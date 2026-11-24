import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PartyEventView } from '../shared/games/views';
import type { PartyServer } from '../server/app';
import type { PersistedRoom } from '../server/rooms/persist';
import { TestClient, setupRoom, sleep, startGame, startTestServer } from './helpers';

/**
 * 懇親会のルームそのものの扱い（切断・片付け・保存・デモ）。
 * 試験のサーバーは切断の猶予が 400ms（本番は3分）。
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

const GRACE_PASSED_MS = 900;

async function setupEvent(count = 3) {
  const r = await setupRoom(server.port, 'party-event', count);
  open.push(...r.clients);
  await startGame(r.host, r.clients, 'EVENT');
  return r;
}

async function connect(): Promise<TestClient> {
  const c = await TestClient.connect(server.port);
  open.push(c);
  return c;
}

const view = (c: TestClient) => c.view!.game as unknown as PartyEventView;

/** private なメソッドを試験から呼ぶ */
const manager = () =>
  server.manager as unknown as {
    sweep(): void;
    collectPersisted(): PersistedRoom[];
  };

/* ================================================================== */
describe('切断と復帰（スマホの画面を消している間）', () => {
  it('猶予を過ぎても参加者は外れず、戻ると同じ人・同じビンゴカードで続きから', async () => {
    const { clients, code } = await setupEvent();
    const guest = clients[1];
    await guest.waitFor((v) => (v.game as unknown as PartyEventView).bingo.myCard !== null, 3000, 'カード');
    const cardId = view(guest).bingo.myCard!.cardId;
    const { playerId, token } = guest.session!;

    guest.close();
    await sleep(GRACE_PASSED_MS);
    expect(server.manager.rooms.get(code)?.players.has(playerId)).toBe(true);

    const back = await connect();
    await back.ok('room:rejoin', { code, playerId, token });
    await back.waitFor((v) => (v.game as unknown as PartyEventView)?.bingo.myCard !== null, 3000, '戻ったあとのカード');
    expect(back.view!.youId).toBe(playerId);
    expect(view(back).bingo.myCard!.cardId).toBe(cardId);
  });

  it('司会も含めて全員が猶予を過ぎて切断しても、ルームと進行は残る', async () => {
    const { host, clients, code } = await setupEvent();
    await host.actionOk('event:section', { section: 'bingo' });
    await host.actionOk('bingo:draw');
    const { playerId, token } = host.session!;

    for (const c of clients) c.close();
    await sleep(GRACE_PASSED_MS);
    expect(server.manager.rooms.has(code)).toBe(true);

    const back = await connect();
    await back.ok('room:rejoin', { code, playerId, token });
    await back.waitFor((v) => v.game !== null, 3000, '戻ったあとの画面');
    expect(view(back).bingo.called).toHaveLength(1);
  });

  it('切断しても司会は参加者に移らない（猶予を過ぎても）', async () => {
    const { host, clients } = await setupEvent();
    host.close();
    await sleep(GRACE_PASSED_MS);
    await clients[1].waitFor((v) => v.players.some((p) => p.id === host.id && !p.connected), 3000, '司会の切断');
    expect(clients[1].view!.hostId).toBe(host.id);
    expect(clients[1].view!.youAreHost).toBe(false);
  });
});

/* ================================================================== */
describe('誰もいないルームの片付け', () => {
  it('本番のルームは誰もいなくても30分では片付けず、12時間で片付ける', async () => {
    const { clients, code } = await setupEvent(2);
    for (const c of clients) c.close();
    await sleep(100);
    const room = server.manager.rooms.get(code)!;

    room.lastActivity = Date.now() - 31 * 60 * 1000;
    manager().sweep();
    expect(server.manager.rooms.has(code)).toBe(true);

    room.lastActivity = Date.now() - 12 * 60 * 60 * 1000 - 1000;
    manager().sweep();
    expect(server.manager.rooms.has(code)).toBe(false);
  });

  it('デモのルームは誰もいなくなって30分で片付ける', async () => {
    const host = await connect();
    const res = await host.ok<{ session: { code: string } }>('room:create', { gameId: 'party-event', name: '司会', demo: true });
    const code = res.session.code;
    host.close();
    await sleep(100);
    const room = server.manager.rooms.get(code)!;

    room.lastActivity = Date.now() - 31 * 60 * 1000;
    manager().sweep();
    expect(server.manager.rooms.has(code)).toBe(false);
  });

  it('通常のゲームは今まで通り、誰もいなくなって30分で片付ける', async () => {
    const { clients, code } = await setupRoom(server.port, 'unanimous', 3);
    open.push(...clients);
    const room = server.manager.rooms.get(code)!;
    for (const c of clients) c.close();
    await sleep(100);
    room.lastActivity = Date.now() - 31 * 60 * 1000;
    manager().sweep();
    expect(server.manager.rooms.has(code)).toBe(false);
  });
});

/* ================================================================== */
describe('デモのルーム', () => {
  it('demo を付けて作るとデモになり、全員の画面に demo が届く', async () => {
    const host = await connect();
    const code = await host.create('party-event', '司会');
    expect(server.manager.rooms.get(code)!.demo).toBe(false);

    const demoHost = await connect();
    const res = await demoHost.ok<{ session: { code: string; hostToken?: string } }>('room:create', {
      gameId: 'party-event',
      name: '司会',
      demo: true,
    });
    const demoCode = res.session.code;
    expect(res.session.hostToken).toMatch(/^[0-9a-f]{24}$/); // デモでも司会用URLは作る
    expect(server.manager.rooms.get(demoCode)!.demo).toBe(true);

    const guest = await connect();
    await guest.join(demoCode, '参加者1');
    await guest.waitFor((v) => v.code === demoCode, 3000, '参加');
    expect(guest.view!.demo).toBe(true);
  });

  it('通常のゲームでは demo を付けてもデモにならない', async () => {
    const host = await connect();
    const res = await host.ok<{ session: { code: string } }>('room:create', { gameId: 'unanimous', name: 'みずき', demo: true });
    expect(server.manager.rooms.get(res.session.code)!.demo).toBe(false);
  });

  it('デモのルームはディスクに保存しない（本番のルームは保存する）', async () => {
    const { code } = await setupEvent(2);
    const demoHost = await connect();
    const res = await demoHost.ok<{ session: { code: string } }>('room:create', {
      gameId: 'party-event',
      name: '司会',
      demo: true,
    });
    await demoHost.ok('room:start');

    const saved = manager()
      .collectPersisted()
      .map((r) => r.code);
    expect(saved).toContain(code);
    expect(saved).not.toContain(res.session.code);
  });

  it('参加者を入れて開始したあと、全員のソケットを閉じても、各自のセッションで入り直せる（デモの画面の流れ）', async () => {
    const host = await connect();
    const created = await host.ok<{ session: { code: string; playerId: string; token: string } }>('room:create', {
      gameId: 'party-event',
      name: '司会',
      demo: true,
    });
    const code = created.session.code;
    const guest = await connect();
    await guest.join(code, '参加者1');
    await host.ok('room:start');
    const guestSession = guest.session!;
    host.close();
    guest.close();
    await sleep(GRACE_PASSED_MS);

    const hostFrame = await connect();
    await hostFrame.ok('room:rejoin', { code, playerId: created.session.playerId, token: created.session.token });
    const guestFrame = await connect();
    await guestFrame.ok('room:rejoin', { code, playerId: guestSession.playerId, token: guestSession.token });

    await hostFrame.waitFor((v) => v.youAreHost && v.game !== null, 3000, '司会の枠');
    await hostFrame.actionOk('event:section', { section: 'bingo' });
    await hostFrame.actionOk('bingo:draw');
    await guestFrame.waitFor((v) => (v.game as unknown as PartyEventView)?.bingo.called.length === 1, 3000, '参加者の枠に届く');
  });
});

/* ================================================================== */
describe('ゲームの変更', () => {
  it('懇親会のルームを通常のゲームに変えられない', async () => {
    const host = await connect();
    await host.create('party-event', '司会');
    const res = await host.emit('room:changeGame', { gameId: 'unanimous' });
    expect(res.ok).toBe(false);
  });

  it('通常のルームを懇親会に変えられない', async () => {
    const host = await connect();
    await host.create('unanimous', 'みずき');
    const res = await host.emit('room:changeGame', { gameId: 'party-event' });
    expect(res.ok).toBe(false);
    // 通常のゲームどうしは今まで通り変えられる
    await host.ok('room:changeGame', { gameId: 'liar' });
  });
});
