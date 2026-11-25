import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PartyEventView } from '../shared/games/views';
import type { PartyServer } from '../server/app';
import type { PersistedFile, PersistedRoom } from '../server/rooms/persist';
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
const DAY_MS = 24 * 60 * 60 * 1000;

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
  it('本番のルームは誰もいなくても30分・12時間では片付けず（前日に作って QR を配れる）、7日で片付ける', async () => {
    const { clients, code } = await setupEvent(2);
    for (const c of clients) c.close();
    await sleep(100);
    const room = server.manager.rooms.get(code)!;

    room.lastActivity = Date.now() - 31 * 60 * 1000;
    manager().sweep();
    expect(server.manager.rooms.has(code)).toBe(true);

    room.lastActivity = Date.now() - 2 * DAY_MS;
    manager().sweep();
    expect(server.manager.rooms.has(code)).toBe(true);

    room.lastActivity = Date.now() - 7 * DAY_MS - 1000;
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

/* ================================================================== */
describe('保存ファイル（再起動をまたぐ）', () => {
  // このファイルの中だけ、保存先を使い捨ての場所にする（本番の /opt/partybox/state を触らない）
  let dir: string;
  const before = process.env.PARTYBOX_STATE_DIR;
  const FLUSHED_MS = 1300; // まとめ書きの間隔（1秒）を超える

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'partybox-state-'));
    process.env.PARTYBOX_STATE_DIR = dir;
  });
  afterAll(() => {
    if (before === undefined) delete process.env.PARTYBOX_STATE_DIR;
    else process.env.PARTYBOX_STATE_DIR = before;
    rmSync(dir, { recursive: true, force: true });
  });

  const savedCodes = (): string[] => {
    try {
      return (JSON.parse(readFileSync(path.join(dir, 'rooms.json'), 'utf8')) as PersistedFile).rooms.map((r) => r.code);
    } catch {
      return [];
    }
  };
  const sweepOf = (s: PartyServer) => (s.manager as unknown as { sweep(): void }).sweep();

  async function eventRoomOn(s: PartyServer): Promise<string> {
    const host = await TestClient.connect(s.port);
    open.push(host);
    const code = await host.create('party-event', '司会');
    await host.ok('room:start');
    return code;
  }

  it('片付けたルームはファイルからも消え、再起動しても戻らない', async () => {
    const s1 = await startTestServer({ persist: true });
    const code = await eventRoomOn(s1);
    await sleep(FLUSHED_MS);
    expect(savedCodes()).toContain(code);

    s1.manager.rooms.get(code)!.lastActivity = Date.now() - 8 * DAY_MS;
    sweepOf(s1);
    expect(s1.manager.rooms.has(code)).toBe(false);
    await sleep(FLUSHED_MS);
    expect(savedCodes()).not.toContain(code);
    await s1.close();

    const s2 = await startTestServer({ persist: true });
    expect(s2.manager.rooms.has(code)).toBe(false);
    await s2.close();
  });

  it('まだ始めていないルームも再起動で残る（前日に作って配った QR と司会用URLが、そのまま使える）', async () => {
    const s1 = await startTestServer({ persist: true });
    const host = await TestClient.connect(s1.port);
    const code = await host.create('party-event', '司会');
    const hostToken = host.session!.hostToken!;
    const guest = await TestClient.connect(s1.port);
    await guest.join(code, 'たろう');
    host.close();
    guest.close();
    await s1.close(); // 終了時に書き出す

    const s2 = await startTestServer({ persist: true });
    const restored = s2.manager.rooms.get(code);
    expect(restored?.status).toBe('lobby'); // 開始ずみにはしない
    expect(restored?.game).toBeNull();

    // 参加者は同じ人として戻れる。新しい人も同じ QR（コード）で入れる
    const guest2 = await TestClient.connect(s2.port);
    open.push(guest2);
    await guest2.ok('room:rejoin', { code, playerId: guest.session!.playerId, token: guest.session!.token });
    const late = await TestClient.connect(s2.port);
    open.push(late);
    await late.join(code, 'はな');

    // 司会用URLもそのまま使えて、開始できる
    const host2 = await TestClient.connect(s2.port);
    open.push(host2);
    await host2.join(code, '司会2');
    await host2.ok('room:claimHost', { token: hostToken });
    await host2.ok('room:start');
    await late.waitPhase('EVENT');
    expect((late.view!.game as unknown as PartyEventView).bingo.myCard).not.toBeNull();
    await s2.close();
  });

  it('開始前かどうかの印（status）が無い古い保存ファイルは、開始ずみのルームとして戻す', async () => {
    const s1 = await startTestServer({ persist: true });
    const code = await eventRoomOn(s1);
    const host = open.at(-1)!;
    await host.actionOk('bingo:draw');
    await s1.close();

    // 古い形式にする（status を書く前のファイル）
    const file = path.join(dir, 'rooms.json');
    const saved = JSON.parse(readFileSync(file, 'utf8')) as PersistedFile;
    expect(saved.version).toBe(1);
    for (const r of saved.rooms) delete r.status;
    writeFileSync(file, JSON.stringify(saved), 'utf8');

    const s2 = await startTestServer({ persist: true });
    const restored = s2.manager.rooms.get(code);
    expect(restored?.status).toBe('playing');
    expect((restored!.game!.snapshot!() as { bingo: { called: number[] } }).bingo.called).toHaveLength(1);
    await s2.close();
  });

  it('復元したルームは、再起動した時刻ではなく最後の動きから7日で片付ける', async () => {
    const s1 = await startTestServer({ persist: true });
    const code = await eventRoomOn(s1);
    const oldActivity = Date.now() - 8 * DAY_MS;
    s1.manager.rooms.get(code)!.lastActivity = oldActivity;
    await s1.close(); // 終了時に書き出す

    const s2 = await startTestServer({ persist: true });
    expect(s2.manager.rooms.get(code)?.lastActivity).toBe(oldActivity);
    sweepOf(s2);
    expect(s2.manager.rooms.has(code)).toBe(false);
    await s2.close();
  });

  it('最後の動きから7日たっていなければ、再起動しても残る', async () => {
    const s1 = await startTestServer({ persist: true });
    const code = await eventRoomOn(s1);
    await s1.close();

    const s2 = await startTestServer({ persist: true });
    sweepOf(s2);
    expect(s2.manager.rooms.has(code)).toBe(true);
    await s2.close();
  });
});

/* ================================================================== */
describe('当日の事故を防ぐ', () => {
  it('懇親会のルームはロビーに戻せない（戻すとクイズ・座席・ビンゴの進行が全部消える）', async () => {
    const { host, code } = await setupEvent();
    await host.actionOk('event:section', { section: 'bingo' });
    await host.actionOk('bingo:draw');

    const res = await host.emit('room:backToLobby');
    expect(res.ok).toBe(false);
    const room = server.manager.rooms.get(code)!;
    expect(room.status).toBe('playing');
    await host.waitFor((v) => (v.game as unknown as PartyEventView)?.bingo.called.length === 1, 3000, '進行が残る');
  });

  it('ルームを作った人が退出しても、参加者は司会にならない（司会用URLを開いた人に移る）', async () => {
    const { host, clients, code } = await setupEvent(3);
    const token = host.session!.hostToken!;
    // 3人目が司会用URLを開いた（2人目はふつうの参加者）
    await clients[2].ok('room:claimHost', { token });

    await host.ok('room:leave');
    const room = server.manager.rooms.get(code)!;
    expect(room.hostId).toBe(clients[2].id);
    await clients[1].waitFor((v) => !v.players.some((p) => p.id === host.id), 3000, '作った人が抜ける');
    expect(clients[1].view!.youAreHost).toBe(false);
    expect((await clients[1].action('bingo:draw')).ok).toBe(false);
    // 参加者に答えが届かない
    await clients[2].actionOk('event:section', { section: 'quiz' });
    await clients[2].actionOk('quiz:next');
    await clients[1].waitFor((v) => (v.game as unknown as PartyEventView)?.quiz.phase === 'question', 3000, '第1問');
    expect(view(clients[1]).quiz.question!.answer).toBeNull();
  });

  it('司会用URLを開いた人がいないまま作った人が退出しても、誰も司会にならず、あとから司会用URLで戻れる', async () => {
    const { host, clients, code } = await setupEvent(2);
    const token = host.session!.hostToken!;
    await host.ok('room:leave');
    const room = server.manager.rooms.get(code)!;
    expect(room.hostId).toBe('');
    await clients[1].waitFor((v) => v.players.length === 1, 3000, '作った人が抜ける');
    expect(clients[1].view!.youAreHost).toBe(false);

    const back = await connect();
    await back.join(code, '司会');
    await back.ok('room:claimHost', { token });
    await back.waitFor((v) => v.youAreHost && v.hostId === back.id, 3000, '司会に戻る');
  });

  it('切断した人と同じ名前で入れる（別のブラウザで開き直した本人）。接続中の人とは重ねられない', async () => {
    const { clients, code } = await setupEvent(3);
    const name = clients[1].view!.players.find((p) => p.id === clients[1].id)!.name;
    const other = clients[2].view!.players.find((p) => p.id === clients[2].id)!.name;
    clients[1].close();
    await clients[0].waitFor((v) => v.players.some((p) => p.id === clients[1].id && !p.connected), 3000, '切断');

    const again = await connect();
    await again.join(code, name);
    const dup = await connect();
    expect((await dup.emit('room:join', { code, name: other })).ok).toBe(false);
  });

  it('通常のゲームは今まで通り、切断した人の名前でも入れない（猶予のうちは本人が戻れるように）', async () => {
    const { clients, code } = await setupRoom(server.port, 'unanimous', 3);
    open.push(...clients);
    clients[1].close();
    await clients[0].waitFor((v) => v.players.some((p) => p.id === clients[1].id && !p.connected), 3000, '切断');
    const c = await connect();
    expect((await c.emit('room:join', { code, name: 'たろう' })).ok).toBe(false);
  });

  it('退出した人が選んでいた名前は空き、戻ってきた本人が選び直せる', async () => {
    const { clients, code } = await setupEvent(2);
    await clients[1].actionOk('seats:claim', { personId: 'p1' });
    await clients[1].ok('room:leave');

    const back = await connect();
    await back.join(code, 'たろう');
    await back.actionOk('seats:claim', { personId: 'p1' });
    await back.waitFor((v) => (v.game as unknown as PartyEventView)?.seats.myPersonId === 'p1', 3000, '選び直せた');
  });
});
