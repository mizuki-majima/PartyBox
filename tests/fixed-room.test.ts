import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PartyEventView } from '../shared/games/views';
import type { PartyServer } from '../server/app';
import { loadEventConfig, reloadEventConfig } from '../server/event/config';
import { TestClient, sleep, startTestServer } from './helpers';

/**
 * 常設の懇親会ルーム。置き場に room.json を置くと、サーバーが起動時にそのコードのルームを用意する。
 * 参加者はコードを入れるだけで入れ、ルームは期限でも・誰もいなくなっても消えない。
 * （ここで使うコードと合言葉は試験用の作りもの）
 */

const CODE = 'TEST27';
const HOST_TOKEN = 'test-host-token-0123456789';

let dataDir: string;
let stateDir: string;
let server: PartyServer;
let open: TestClient[] = [];
const prevData = process.env.PARTYBOX_EVENT_DATA_DIR;
const prevState = process.env.PARTYBOX_STATE_DIR;

const writeRoom = (room: object) => writeFileSync(path.join(dataDir, 'room.json'), JSON.stringify(room), 'utf8');

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'partybox-fixed-data-'));
  stateDir = mkdtempSync(path.join(tmpdir(), 'partybox-fixed-state-'));
  process.env.PARTYBOX_EVENT_DATA_DIR = dataDir;
  process.env.PARTYBOX_STATE_DIR = stateDir;
  // 名簿・問題は置かない（サンプルで動く）。常設のルームだけ置く。コードは小文字で書いても大文字として扱う
  writeRoom({ code: CODE.toLowerCase(), hostToken: HOST_TOKEN });
  reloadEventConfig();
  server = await startTestServer();
});
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
afterAll(async () => {
  await server.close();
  if (prevData === undefined) delete process.env.PARTYBOX_EVENT_DATA_DIR;
  else process.env.PARTYBOX_EVENT_DATA_DIR = prevData;
  if (prevState === undefined) delete process.env.PARTYBOX_STATE_DIR;
  else process.env.PARTYBOX_STATE_DIR = prevState;
  reloadEventConfig();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(stateDir, { recursive: true, force: true });
});

async function connect(s: PartyServer = server): Promise<TestClient> {
  const c = await TestClient.connect(s.port);
  open.push(c);
  return c;
}
const view = (c: TestClient) => c.view!.game as unknown as PartyEventView;
const inEvent = (c: TestClient) => c.waitFor((v) => v.game?.phase === 'EVENT', 3000, '懇親会の画面');
const getJson = async (s: PartyServer, p: string) => (await fetch(`http://localhost:${s.port}${p}`)).json();

/* ================================================================== */
describe('コードを入れるだけで入れる', () => {
  it('起動した時点でルームがあり、誰も「ゲーム開始」を押さなくても、参加者はそのまま懇親会の画面に入る', async () => {
    const room = server.manager.rooms.get(CODE);
    expect(room?.status).toBe('playing');
    expect(room?.permanent).toBe(true);

    const guest = await connect();
    // 参加者が小文字で打っても入れる
    const check = await guest.emit<{ room: { code: string; gameId: string; status: string } }>('room:check', { code: CODE.toLowerCase() });
    expect(check).toMatchObject({ ok: true, room: { code: CODE, gameId: 'party-event', status: 'playing' } });
    await guest.join(CODE, 'たろう');
    await inEvent(guest);
    expect(guest.view!.youAreHost).toBe(false);
    expect(guest.session!.hostToken).toBeUndefined();
    expect(view(guest).bingo.myCard).not.toBeNull();
    expect((await guest.action('bingo:draw')).ok).toBe(false); // 参加者は進行できない
  });

  it('コードを知らなければ入れない（違うコードではルームが見つからない）', async () => {
    const guest = await connect();
    expect((await guest.emit('room:check', { code: 'ZZZZ99' })).ok).toBe(false);
    expect((await guest.emit('room:join', { code: 'ZZZZ99', name: 'たろう' })).ok).toBe(false);
  });

  it('司会用URLの合言葉を示した人だけが進行できる', async () => {
    const host = await connect();
    await host.join(CODE, '司会');
    expect((await host.emit('room:claimHost', { token: 'wrong-token-0123456789' })).ok).toBe(false);
    await host.ok('room:claimHost', { token: HOST_TOKEN });
    await host.waitFor((v) => v.youAreHost, 3000, '司会');
    await host.actionOk('event:section', { section: 'bingo' });
    await host.actionOk('bingo:draw');
    await host.waitFor(() => view(host).bingo.called.length >= 1, 3000, '番号');
  });
});

/* ================================================================== */
describe('コードを知らない人に、名簿やクイズを見せない', () => {
  it('常設のルームがある間は、懇親会のルームは新しく作れない（通常のゲームは作れる）', async () => {
    const c = await connect();
    const res = await c.emit('room:create', { gameId: 'party-event', name: 'だれか' });
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining('コードで参加') });

    const d = await connect();
    await d.create('unanimous', 'みずき'); // 卓ごとのゲームは今までどおり
    expect(d.view?.gameId ?? 'unanimous').toBe('unanimous');

    // 通常のゲームの「1人で試す」（デモ）も作れる（止めるのは懇親会だけ）
    const e = await connect();
    const demo = await e.ok<{ session: { code: string } }>('room:create', { gameId: 'unanimous', name: 'みずき', demo: true });
    expect(server.manager.rooms.get(demo.session.code)!.demo).toBe(true);
  });

  it('常設のルームがある間は、懇親会のデモも作れない（デモは本番と同じ問題・答えで動くため）', async () => {
    const before = server.manager.rooms.size;
    const host = await connect();
    const res = await host.emit('room:create', { gameId: 'party-event', name: '司会', demo: true });
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining('コードで参加') });
    expect(server.manager.rooms.size).toBe(before);

    // 常設のルームはそのまま入れる
    const guest = await connect();
    const real = loadEventConfig().seats.participants.map((p) => (typeof p === 'string' ? p : p.name));
    const fixed = await guest.ok<{ room: { roster?: { name: string }[] } }>('room:check', { code: CODE });
    expect(fixed.room.roster!.map((p) => p.name)).toEqual(real);
  });

  it('入口の出し分け用の API は、常設のルームがあることだけを返す（コードは返さない）', async () => {
    const body = await getJson(server, '/api/event');
    expect(body).toEqual({ fixedRoom: true });
    expect(JSON.stringify(body)).not.toContain(CODE);
    expect(JSON.stringify(await getJson(server, '/api/health'))).not.toContain(CODE);
  });
});

/* ================================================================== */
describe('消えない', () => {
  const internals = (s: PartyServer) => s.manager as unknown as { sweep(): void };

  it('最後の1人が退出しても、期限を過ぎても、司会が削除しようとしても、ルームは残る', async () => {
    const host = await connect();
    await host.join(CODE, '司会2');
    await host.ok('room:claimHost', { token: HOST_TOKEN });
    expect(await host.emit('room:close')).toMatchObject({ ok: false, error: expect.stringContaining('常設') });

    // 全員を退出させる
    const room = server.manager.rooms.get(CODE)!;
    for (const c of open.splice(0)) c.close();
    const lone = await connect();
    await lone.join(CODE, 'ひとり');
    for (const id of [...room.players.keys()]) if (id !== lone.id) room.players.delete(id);
    await lone.ok('room:leave');
    expect(room.players.size).toBe(0);
    expect(server.manager.rooms.has(CODE)).toBe(true);

    room.lastActivity = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30日動きが無い
    internals(server).sweep();
    expect(server.manager.rooms.has(CODE)).toBe(true);

    const again = await connect();
    await again.join(CODE, 'あとから');
    await inEvent(again);
  });

  it('再起動しても、進み具合はそのまま。合言葉を変えると、前の合言葉の司会は司会でなくなる', async () => {
    const s1 = await startTestServer({ persist: true });
    const host = await connect(s1);
    await host.join(CODE, '司会');
    await host.ok('room:claimHost', { token: HOST_TOKEN });
    await host.actionOk('bingo:draw');
    await host.actionOk('bingo:draw');
    await host.waitFor(() => view(host).bingo.called.length === 2, 3000, '2個');
    const session = host.session!;
    host.close();
    await sleep(50);
    await s1.close(); // 終了時に書き出す

    const s2 = await startTestServer({ persist: true });
    expect(s2.manager.rooms.get(CODE)?.permanent).toBe(true);
    const back = await connect(s2);
    await back.ok('room:rejoin', { code: CODE, playerId: session.playerId, token: session.token });
    await inEvent(back);
    expect(view(back).bingo.called).toHaveLength(2);
    expect(back.view!.youAreHost).toBe(true);
    back.close();
    await sleep(50);
    await s2.close();

    // 合言葉を変えて起動し直す
    const NEW_TOKEN = 'another-host-token-9876543210';
    writeRoom({ code: CODE, hostToken: NEW_TOKEN });
    reloadEventConfig();
    const s3 = await startTestServer({ persist: true });
    const old = await connect(s3);
    await old.ok('room:rejoin', { code: CODE, playerId: session.playerId, token: session.token });
    await inEvent(old);
    expect(old.view!.youAreHost).toBe(false);
    expect(view(old).bingo.called).toHaveLength(2); // 進み具合は残る
    expect((await old.emit('room:claimHost', { token: HOST_TOKEN })).ok).toBe(false);
    await old.ok('room:claimHost', { token: NEW_TOKEN });
    await s3.close();

    writeRoom({ code: CODE.toLowerCase(), hostToken: HOST_TOKEN });
    reloadEventConfig();
  });
});

/* ================================================================== */
describe('設定ファイル（room.json）', () => {
  it('形式が違えば、黙って無視せずに起動を失敗させる', () => {
    for (const bad of [{ code: 'AB' }, { code: 'ABC-123' }, { code: 'ABCDEF', hostToken: 'short' }, { hostToken: HOST_TOKEN }]) {
      writeRoom(bad);
      expect(() => loadEventConfig()).toThrow(/room\.json/);
    }
    writeRoom({ code: CODE.toLowerCase(), hostToken: HOST_TOKEN });
    expect(loadEventConfig().room).toEqual({ code: CODE, hostToken: HOST_TOKEN });
  });

  it('合言葉を省くと、サーバーが作る', () => {
    writeRoom({ code: 'NOTOKEN1' });
    expect(loadEventConfig().room).toEqual({ code: 'NOTOKEN1' });
    writeRoom({ code: CODE.toLowerCase(), hostToken: HOST_TOKEN });
  });
});
