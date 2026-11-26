import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PartyServer } from '../server/app';
import { TestClient, setupRoom, sleep, startTestServer } from './helpers';

/**
 * 準備の関門。ゲーム開始・説明を読む画面・各ラウンドの頭は、時間では進まず、
 * 全員（切れている人を除く）の「準備OK」で自動のカウントダウン（3秒）に入り、終わると進む。
 * カウントダウン中はホストが止められる（全員の準備OKを取り消す）
 */
let server: PartyServer;
let open: TestClient[] = [];

beforeAll(async () => {
  // 切れた人がすぐ外れないようにする（「切れている人は待たない」を、外れる前に確かめるため）
  server = await startTestServer({ disconnectGraceMs: 60_000 });
});
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
afterAll(async () => {
  await server.close();
});

async function room(count: number, settings: object = { rounds: 2 }) {
  const r = await setupRoom(server.port, 'whose-answer', count, settings);
  open.push(...r.clients);
  return r;
}
const gate = (c: TestClient) => c.game?.gate as { ready: string[]; counting: boolean; canEnd: boolean } | null;

describe('ゲーム開始の準備の関門', () => {
  it('開始しても時間では進まない', async () => {
    const { host } = await room(3);
    await host.ok('room:start');
    await host.waitPhase('START');
    expect(gate(host)).toMatchObject({ ready: [], counting: false, canEnd: false });
    expect(host.game.deadline).toBeNull();
    await sleep(300); // 今までの 4秒 × 1/50 を十分に越える
    expect(host.game.phase).toBe('START');
  });

  it('全員が準備OKを押すと、自動でカウントダウン → 最初のラウンドへ', async () => {
    const { host, clients } = await room(3);
    await host.ok('room:start');
    await host.waitPhase('START');
    await clients[0].actionOk('ready');
    await clients[1].actionOk('ready');
    await host.waitFor((v) => (v.game as any).gate?.ready.length === 2, 3000, '2人');
    expect(gate(host)!.counting).toBe(false);
    await clients[2].actionOk('ready');
    await host.waitFor((v) => (v.game as any).gate?.counting === true, 3000, 'カウントダウン');
    expect(host.game.deadline).not.toBeNull();
    await host.waitFor((v) => v.game!.phase === 'ROUND_INTRO' || v.game!.phase === 'ANSWER', 3000, '最初のラウンド');
    expect(host.game.round).toBe(1);
  });

  it('止めると準備OKが取り消され、もう一度そろうと1回だけ進む', async () => {
    const { host, clients } = await room(3);
    await host.ok('room:start');
    await host.waitPhase('START');
    for (const c of clients) await c.actionOk('ready');
    await host.waitFor((v) => (v.game as any).gate?.counting === true, 3000, 'カウントダウン');
    expect((await clients[1].action('gate:stop')).ok).toBe(false); // ホスト以外は止められない
    await host.actionOk('gate:stop');
    await host.waitFor((v) => (v.game as any).gate?.counting === false, 3000, '止まる');
    expect(gate(host)!.ready).toEqual([]);
    await sleep(200); // 止めたあとは、カウントダウンの時間が過ぎても進まない
    expect(host.game.phase).toBe('START');
    for (const c of clients) await c.actionOk('ready');
    await host.waitFor((v) => v.game!.phase === 'ROUND_INTRO' || v.game!.phase === 'ANSWER', 3000, '最初のラウンド');
    expect(host.game.round).toBe(1);
  });

  it('切れている人は待たない', async () => {
    const { host, clients } = await room(3);
    await host.ok('room:start');
    await host.waitPhase('START');
    const gone = clients[2];
    const goneId = gone.id;
    gone.close();
    await host.waitFor((v) => v.game!.players.some((p) => p.id === goneId && !p.connected), 3000, '切断');
    await clients[0].actionOk('ready');
    await clients[1].actionOk('ready');
    await host.waitFor((v) => (v.game as any).gate?.counting === true, 3000, 'カウントダウン');
  });

  it('ホストの「待たずに始める」（skip）でカウントダウンに入る', async () => {
    const { host } = await room(3);
    await host.ok('room:start');
    await host.waitPhase('START');
    await host.actionOk('skip');
    await host.waitFor((v) => (v.game as any).gate?.counting === true, 3000, 'カウントダウン');
  });

  it('カウントダウン中に人が抜けて最少人数を下回ると、打ち切る', async () => {
    const r = await setupRoom(server.port, 'ad-dodge', 2, { rounds: 1 });
    open.push(...r.clients);
    await r.host.ok('room:start');
    await r.host.waitPhase('START');
    for (const c of r.clients) await c.actionOk('ready');
    await r.host.waitFor((v) => (v.game as any).gate?.counting === true, 3000, 'カウントダウン');
    await r.clients[1].ok('room:leave');
    await r.host.waitPhase('GAME_OVER');
    expect(r.host.game.endReason).toBeTruthy();
  });
});
