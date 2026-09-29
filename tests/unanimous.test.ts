import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { UnanimousView } from '../shared/games/views';
import type { PartyServer } from '../server/app';
import { groupAnswers, unanimousPoints } from '../server/games/unanimous/UnanimousGame';
import { normalizeAnswer } from '../server/utils/text';
import { setupRoom, startGame, startTestServer, type TestClient } from './helpers';

let server: PartyServer;
let open: TestClient[] = [];

beforeAll(async () => {
  server = await startTestServer({ timeScale: 0.05 });
});
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
afterAll(async () => {
  await server.close();
});

const g = (c: TestClient) => c.game as UnanimousView;

describe('得点計算・表記ゆれ', () => {
  it('人数に応じた得点表', () => {
    expect(unanimousPoints(1, 5)).toBe(0);
    expect(unanimousPoints(2, 5)).toBe(1);
    expect(unanimousPoints(3, 5)).toBe(3);
    expect(unanimousPoints(4, 5)).toBe(5);
    expect(unanimousPoints(5, 5)).toBe(10); // 全員一致
    expect(unanimousPoints(4, 4)).toBe(10);
    expect(unanimousPoints(6, 6)).toBe(12);
    expect(unanimousPoints(10, 10)).toBe(20); // 大人数でも全員一致が最も高い
    expect(unanimousPoints(9, 10)).toBeLessThan(unanimousPoints(10, 10));
  });

  it('ひらがな/カタカナ・全角/半角・空白・記号を同一視する', () => {
    expect(normalizeAnswer('ラーメン')).toBe(normalizeAnswer('らーめん'));
    expect(normalizeAnswer('ＳＷＩＴＣＨ')).toBe(normalizeAnswer('switch'));
    expect(normalizeAnswer(' からあげ！ ')).toBe(normalizeAnswer('カラアゲ'));
    expect(normalizeAnswer('寿司')).not.toBe(normalizeAnswer('すし'));
  });

  it('グループ化してチーム得点を出す', () => {
    const groups = groupAnswers(
      [
        { playerId: 'a', text: 'おにぎり' },
        { playerId: 'b', text: 'オニギリ' },
        { playerId: 'c', text: 'おにぎり' },
        { playerId: 'd', text: 'プリン' },
        { playerId: 'e', text: 'ぷりん' },
      ],
      5,
    );
    expect(groups.map((x) => [x.label, x.playerIds.length, x.points])).toEqual([
      ['おにぎり', 3, 3],
      ['プリン', 2, 1],
    ]);
  });
});

describe('全員一致を目指せ！ 通しプレイ', () => {
  it('回答の秘匿 → 全員回答で自動公開 → 得点 → 次ラウンド → ゲーム終了 → もう一回', async () => {
    const { host, clients } = await setupRoom(server.port, 'unanimous', 4, { rounds: 3 });
    open = clients;
    await startGame(host, clients, 'ANSWER');

    // ラウンド1: 3人一致 + 1人バラバラ
    const q1 = g(host).question;
    expect(q1).toBeTruthy();
    expect(clients.every((c) => g(c).question === q1)).toBe(true);
    await clients[0].actionOk('answer', { text: 'おにぎり' });
    await clients[1].actionOk('answer', { text: 'オニギリ' });
    // 回答は送信者以外には見えない（誰が送信したかだけ見える）
    const mid = await clients[3].waitFor((v) => (v.game as UnanimousView).submitted.length === 2);
    expect(JSON.stringify(mid)).not.toContain('おにぎり');
    expect(JSON.stringify(mid)).not.toContain('オニギリ');
    expect((mid.game as UnanimousView).myAnswer).toBeNull();

    await clients[2].actionOk('answer', { text: 'おにぎり ' });
    await clients[3].actionOk('answer', { text: 'サンドイッチ' });
    const reveal = await host.waitPhase('REVEAL');
    const r1 = (reveal.game as UnanimousView).result!;
    expect(r1.groups[0]).toMatchObject({ label: 'おにぎり', points: 3 });
    expect(r1.groups[0].playerIds).toHaveLength(3);
    expect(r1.roundScore).toBe(3);

    // ホスト以外は次に進めない
    expect(await clients[1].action('next')).toMatchObject({ ok: false });

    // ホストが表記ゆれをまとめる → 全員一致に
    const keys = r1.groups.map((x) => x.key);
    await host.actionOk('merge', { keys });
    const merged = await clients[1].waitFor((v) => (v.game as UnanimousView).result?.groups.length === 1);
    expect((merged.game as UnanimousView).result).toMatchObject({ roundScore: 10, unanimous: true });
    await host.actionOk('unmerge');
    await host.waitFor((v) => (v.game as UnanimousView).result?.groups.length === 2);

    await host.actionOk('next');
    await Promise.all(clients.map((c) => c.waitPhase('ANSWER', (v) => v.game!.round === 2)));
    expect(g(host).teamScore).toBe(3);
    expect(g(host).question).not.toBe(q1);

    // ラウンド2: 1人が回答しないまま時間切れ（0.05倍速で 1.5秒）
    await clients[0].actionOk('answer', { text: 'コーラ' });
    await clients[1].actionOk('answer', { text: 'こーら' });
    await clients[2].actionOk('answer', { text: 'お茶' });
    const reveal2 = await host.waitPhase('REVEAL', () => true, 6000);
    const r2 = (reveal2.game as UnanimousView).result!;
    expect(r2.noAnswer).toEqual([clients[3].id]);
    expect(r2.roundScore).toBe(1);
    await host.actionOk('next');

    // ラウンド3: 全員一致
    await host.waitPhase('ANSWER', (v) => v.game!.round === 3);
    for (const c of clients) await c.actionOk('answer', { text: 'ねこ' });
    const reveal3 = await host.waitPhase('REVEAL');
    expect((reveal3.game as UnanimousView).result).toMatchObject({ roundScore: 10, unanimous: true });
    await host.actionOk('next');

    const over = await clients[2].waitPhase('GAME_OVER');
    const final = over.game as UnanimousView;
    expect(final.teamScore).toBe(3 + 1 + 10);
    expect(final.history.map((h) => h.roundScore)).toEqual([3, 1, 10]);
    expect(final.matchCounts[clients[0].id]).toBe(3);
    expect(final.matchCounts[clients[3].id]).toBe(1);

    // もう一回
    await host.ok('room:restart');
    await Promise.all(clients.map((c) => c.waitPhase('ANSWER', (v) => v.game!.round === 1)));
    expect(g(host).teamScore).toBe(0);
  });

  it('ゲーム中に退出しても止まらず、残りの人の回答で進む', async () => {
    const { host, clients } = await setupRoom(server.port, 'unanimous', 3, { rounds: 3 });
    open = clients;
    await startGame(host, clients, 'ANSWER');
    await clients[0].actionOk('answer', { text: 'いぬ' });
    await clients[1].actionOk('answer', { text: 'いぬ' });
    await clients[2].ok('room:leave');
    const v = await host.waitPhase('REVEAL');
    expect((v.game as UnanimousView).result?.roundScore).toBe(1);
    expect(v.game!.players.find((p) => p.id === clients[2].id)?.left).toBe(true);

    // さらに1人抜けて1人になったらゲーム終了
    await clients[1].ok('room:leave');
    const over = await host.waitPhase('GAME_OVER');
    expect(over.game!.endReason).toContain('足りなく');
    await host.ok('room:backToLobby');
    await host.waitFor((v) => v.status === 'lobby' && v.game === null);
  });
});
