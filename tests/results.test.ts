import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { WhoseView } from '../shared/games/views';
import type { ResultsResponse } from '../shared/results';
import type { PartyServer } from '../server/app';
import { MAX_RESULTS, ResultLog, buildResult, rankPlayers } from '../server/results';
import { type TestClient, setupRoom, startGame, startTestServer } from './helpers';

/**
 * 勝者の記録。卓ごとに遊んだゲームが最後まで終わるたびに、「いつ・誰が1位か」を1件残す。
 */

let server: PartyServer;
let open: TestClient[] = [];

beforeAll(async () => {
  server = await startTestServer();
});
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
afterAll(async () => {
  await server.close();
});

const nameOf = (c: TestClient) => c.view!.players.find((p) => p.id === c.id)!.name;

/** 「誰の答えでしょう？」を、1人目だけが全部当てる形で最後まで遊ぶ（1人目が単独1位になる） */
async function playWhose(rounds = 2) {
  const { host, clients } = await setupRoom(server.port, 'whose-answer', 3, { rounds });
  open.push(...clients);
  const [a] = clients;
  await startGame(host, clients, 'ANSWER');
  for (let round = 1; round <= rounds; round++) {
    await host.waitPhase('ANSWER', (v) => v.game!.round === round);
    for (const [i, cl] of clients.entries()) await cl.actionOk('answer', { text: `答え${round}-${i}` });
    await Promise.all(clients.map((x) => x.waitPhase('GUESS')));
    const view = a.game as WhoseView;
    for (const ans of view.answers!.filter((x) => !x.mine)) {
      const author = clients[Number(ans.text.split('-')[1])];
      await a.actionOk('guess', { answerId: ans.id, playerId: author.id });
    }
    for (const cl of clients) await cl.actionOk('lock');
    await host.waitPhase('RESULT', (v) => v.game!.round === round);
    await host.actionOk('next');
  }
  await host.waitPhase('GAME_OVER');
  return { host, clients };
}

/* ================================================================== */
describe('順位の付け方', () => {
  it('点の高い順に並べ、同点は同じ順位にする（1位が2人なら、次は3位）', () => {
    const rows = rankPlayers([
      { name: 'あ', score: 3, left: false },
      { name: 'い', score: 7, left: false },
      { name: 'う', score: 7, left: false },
      { name: 'え', score: 1, left: false },
    ]);
    expect(rows.map((r) => [r.name, r.rank])).toEqual([
      ['い', 1],
      ['う', 1],
      ['あ', 3],
      ['え', 4],
    ]);
  });

  it('同点1位は全員を勝者にする。途中で抜けた人は勝者にしない', () => {
    const result = buildResult(
      {
        gameId: 'liar',
        players: [
          { name: 'あ', score: 5, left: false },
          { name: 'い', score: 5, left: true },
          { name: 'う', score: 5, left: false },
          { name: 'え', score: 2, left: false },
        ],
        at: 1000,
      },
      'x',
    );
    expect(result.ranked).toBe(true);
    expect(result.winners).toEqual(['あ', 'う']);
    expect(result.at).toBe(1000);
  });

  it('全員で1チームのゲーム・勝ち負けの無いゲームは、1位を決めない', () => {
    for (const gameId of ['unanimous', 'grow-answer'] as const) {
      const result = buildResult({ gameId, players: [{ name: 'あ', score: 9, left: false }], note: 'チーム得点 9 点' }, 'x');
      expect(result.ranked).toBe(false);
      expect(result.winners).toEqual([]);
      expect(result.ranking.map((r) => r.rank)).toEqual([0]);
    }
  });
});

/* ================================================================== */
describe('ゲームが終わると記録に残る', () => {
  it('最後まで遊ぶと、終わった時刻・ゲーム・1位の人・全員の順位が1件残り、/api/results で読める', async () => {
    const before = server.manager.results.list().length;
    const t0 = Date.now();
    const { clients } = await playWhose();
    const [a, b, c] = clients;

    const list = server.manager.results.list();
    expect(list).toHaveLength(before + 1); // 画面が何度配られても、1つのゲームにつき1件だけ
    const result = list.at(-1)!;
    expect(result.gameId).toBe('whose-answer');
    expect(result.ranked).toBe(true);
    expect(result.winners).toEqual([nameOf(a)]);
    expect(result.at).toBeGreaterThanOrEqual(t0);
    expect(result.at).toBeLessThanOrEqual(Date.now());
    expect(result.ranking[0]).toMatchObject({ name: nameOf(a), rank: 1 });
    expect(result.ranking.map((r) => r.name).sort()).toEqual([nameOf(a), nameOf(b), nameOf(c)].sort());
    expect(result.ranking[0].score).toBe(a.game.scores[a.id]);

    const res = await fetch(`http://localhost:${server.port}/api/results`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultsResponse;
    expect(body.results.at(-1)).toEqual(result);
    // ルームコードや再接続の合言葉など、名前と点数以外は出さない
    expect(Object.keys(body.results.at(-1)!).sort()).toEqual(['at', 'gameId', 'id', 'note', 'ranked', 'ranking', 'winners']);
  });

  it('「もう一回」で遊ぶと、もう1件残る（終わった順に並ぶ）', async () => {
    const { host, clients } = await playWhose(2);
    const before = server.manager.results.list().length;
    await host.ok('room:restart');
    await host.waitPhase('ANSWER', (v) => v.game!.round === 1);
    // 2回目は誰も答えずに時間切れで進める
    for (let round = 1; round <= 2; round++) {
      await host.waitPhase('RESULT', (v) => v.game!.round === round, 15_000);
      await host.actionOk('next');
    }
    await host.waitPhase('GAME_OVER', () => true, 15_000);
    const list = server.manager.results.list();
    expect(list).toHaveLength(before + 1);
    expect(list.at(-1)!.at).toBeGreaterThanOrEqual(list.at(-2)!.at);
    expect(clients).toHaveLength(3);
  });

  it('全員一致を目指せ！は、1位のかわりにチームの点を残す', async () => {
    const { host, clients } = await setupRoom(server.port, 'unanimous', 3, { rounds: 3 });
    open.push(...clients);
    const before = server.manager.results.list().length;
    await host.ok('room:start');
    for (;;) {
      await host.waitFor((v) => v.game?.phase === 'ANSWER' || v.game?.phase === 'GAME_OVER', 15_000, 'ANSWER');
      if (host.game.phase === 'GAME_OVER') break;
      for (const cl of clients) await cl.actionOk('answer', { text: 'おにぎり' });
      await host.waitPhase('REVEAL');
      await host.actionOk('next');
    }
    const list = server.manager.results.list();
    expect(list).toHaveLength(before + 1);
    expect(list.at(-1)).toMatchObject({ gameId: 'unanimous', ranked: false, winners: [] });
    expect(list.at(-1)!.note).toMatch(/^チーム得点 \d+ 点/);
  });

  it('途中で打ち切られたゲーム（人数が足りなくなった）は残さない', async () => {
    const { host, clients } = await setupRoom(server.port, 'unanimous', 3);
    open.push(...clients);
    const before = server.manager.results.list().length;
    await startGame(host, clients, 'ANSWER');
    await clients[1].ok('room:leave');
    await clients[2].ok('room:leave');
    await host.waitPhase('GAME_OVER');
    expect(host.game.endReason).toBeTruthy();
    expect(server.manager.results.list()).toHaveLength(before);
  });

  it('懇親会（司会が進める企画）は残さない', async () => {
    const { host, clients } = await setupRoom(server.port, 'party-event', 2);
    open.push(...clients);
    const before = server.manager.results.list().length;
    await startGame(host, clients, 'EVENT');
    await host.actionOk('bingo:draw');
    expect(server.manager.results.list()).toHaveLength(before);
  });
});

/* ================================================================== */
describe('記録の保存', () => {
  let dir: string;
  const prev = process.env.PARTYBOX_STATE_DIR;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'partybox-results-'));
    process.env.PARTYBOX_STATE_DIR = dir;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.PARTYBOX_STATE_DIR;
    else process.env.PARTYBOX_STATE_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  const input = (name: string) => ({ gameId: 'liar' as const, players: [{ name, score: 1, left: false }] });

  it('ファイルに書き、再起動しても読み戻す（ルームの保存 rooms.json とは別のファイル）', () => {
    const log = new ResultLog(true);
    log.add(input('あ'));
    log.add(input('い'));
    const file = JSON.parse(readFileSync(path.join(dir, 'results.json'), 'utf8')) as { version: number; results: unknown[] };
    expect(file.version).toBe(1);
    expect(file.results).toHaveLength(2);

    const again = new ResultLog(true);
    expect(again.list().map((r) => r.winners[0])).toEqual(['あ', 'い']);
    again.add(input('う'));
    expect(new ResultLog(true).list()).toHaveLength(3);
  });

  it('上限を超えたら、古いものから捨てる', () => {
    const log = new ResultLog(false);
    for (let i = 0; i < MAX_RESULTS + 5; i++) log.add(input(`人${i}`));
    expect(log.list()).toHaveLength(MAX_RESULTS);
    expect(log.list()[0].winners[0]).toBe('人5');
    expect(new Set(log.list().map((r) => r.id)).size).toBe(MAX_RESULTS); // ID は重ならない
  });

  it('試験のサーバーは、ディスクに書かない', () => {
    const log = new ResultLog(false);
    log.add(input('か'));
    expect(new ResultLog(true).list().some((r) => r.winners[0] === 'か')).toBe(false);
  });
});
