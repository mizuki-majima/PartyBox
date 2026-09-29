import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PartyServer } from '../server/app';
import { setupRoom, sleep, startTestServer, TestClient } from './helpers';

let server: PartyServer;
const clients: TestClient[] = [];

async function connect() {
  const c = await TestClient.connect(server.port);
  clients.push(c);
  return c;
}

beforeAll(async () => {
  server = await startTestServer();
});
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
});
afterAll(async () => {
  await server.close();
});

describe('ルーム作成・参加', () => {
  it('ルームを作成すると6桁コードとセッションが返り、ホストになる', async () => {
    const host = await connect();
    const code = await host.create('unanimous', 'みずき');
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(host.session?.token).toHaveLength(32);
    const view = await host.waitFor((v) => v.players.length === 1);
    expect(view.hostId).toBe(host.id);
    expect(view.status).toBe('lobby');
    expect(view.players[0]).toMatchObject({ name: 'みずき', isHost: true, connected: true });
    // トークンは他人のビューに含まれない
    expect(JSON.stringify(view)).not.toContain(host.session!.token);
  });

  it('参加者一覧が全員にリアルタイム同期される', async () => {
    const host = await connect();
    const code = await host.create('unanimous', 'みずき');
    const a = await connect();
    await a.join(code.toLowerCase(), 'たろう'); // 小文字でも参加できる
    const b = await connect();
    await b.join(code, 'はな');
    for (const c of [host, a, b]) {
      const v = await c.waitFor((v) => v.players.length === 3);
      expect(v.players.map((p) => p.name)).toEqual(['みずき', 'たろう', 'はな']);
      expect(v.youId).toBe(c.id);
    }
  });

  it('存在しないコード・重複した名前・空の名前は拒否される', async () => {
    const host = await connect();
    const code = await host.create('unanimous', 'みずき');
    const a = await connect();
    expect(await a.emit('room:join', { code: 'ZZZZZZ', name: 'x' })).toMatchObject({ ok: false });
    expect(await a.emit('room:join', { code, name: 'みずき' })).toMatchObject({ ok: false, error: expect.stringContaining('名前') });
    expect(await a.emit('room:join', { code, name: '   ' })).toMatchObject({ ok: false });
    const check = await a.emit<{ room: { gameId: string; playerCount: number } }>('room:check', { code });
    expect(check).toMatchObject({ ok: true, room: { gameId: 'unanimous', playerCount: 1 } });
  });

  it('最大人数を超えると参加できない', async () => {
    const { code } = await setupRoom(server.port, 'liar', 8);
    const extra = await connect();
    expect(await extra.emit('room:join', { code, name: '9人目' })).toMatchObject({ ok: false, error: expect.stringContaining('満員') });
  });

  it('ホストだけが設定変更・ゲーム変更できる。不正な設定値は無視される', async () => {
    const { host, clients: cs } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    expect(await cs[1].emit('room:settings', { settings: { rounds: 3 } })).toMatchObject({ ok: false });
    await host.ok('room:settings', { settings: { rounds: 7, answerTime: 9999 } });
    const v = await cs[1].waitFor((v) => v.settings.rounds === 7);
    expect(v.settings.answerTime).toBe(30); // 不正値は既定値のまま
    await host.ok('room:changeGame', { gameId: 'liar' });
    const v2 = await cs[2].waitFor((v) => v.gameId === 'liar');
    expect(v2.settings.mode).toBe('secret');
  });

  it('最少人数に満たないと開始できない', async () => {
    const { host, clients: cs } = await setupRoom(server.port, 'liar', 3);
    clients.push(...cs);
    const res = await host.emit('room:start');
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining('4人以上') });
    expect(await cs[1].emit('room:start')).toMatchObject({ ok: false, error: expect.stringContaining('ホスト') });
  });
});

describe('退出・再接続・ホスト権限', () => {
  it('リロード（再接続）してもトークンで同じプレイヤーとして復帰できる', async () => {
    const { host, clients: cs, code } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    const taro = cs[1];
    const { playerId, token } = taro.session!;
    taro.close();
    await host.waitFor((v) => v.players.find((p) => p.id === playerId)?.connected === false);

    const reloaded = await connect();
    // 間違ったトークンでは復帰できない（なりすまし防止）
    expect(await reloaded.emit('room:rejoin', { code, playerId, token: 'x'.repeat(32) })).toMatchObject({ ok: false });
    await reloaded.ok('room:rejoin', { code, playerId, token });
    const v = await host.waitFor((v) => v.players.find((p) => p.id === playerId)?.connected === true);
    expect(v.players).toHaveLength(3);
  });

  it('切断したまま猶予時間が過ぎるとルームから外れる', async () => {
    const { host, clients: cs } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    cs[2].close();
    await host.waitFor((v) => v.players.length === 2, 3000);
  });

  it('ホストが退出すると次の人にホストが移る', async () => {
    const { host, clients: cs } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    await host.ok('room:leave');
    const v = await cs[1].waitFor((v) => v.players.length === 2);
    expect(v.hostId).toBe(cs[1].id);
  });

  it('ホストが切断したままだと、接続中の人にホストが移る', async () => {
    const { host, clients: cs } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    host.close();
    const v = await cs[1].waitFor((v) => v.hostId === cs[1].id, 3000);
    expect(v.players.find((p) => p.id === host.id)?.connected).toBe(false);
  });

  it('ホストはプレイヤーをキックできる', async () => {
    const { host, clients: cs } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    await host.ok('room:kick', { playerId: cs[2].id });
    await host.waitFor((v) => v.players.length === 2);
    await sleep(50);
    expect(cs[2].kicked).toBe(true);
  });

  it('ホストがルームを削除すると全員に通知される', async () => {
    const { host, clients: cs, code } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    await host.ok('room:close');
    await sleep(50);
    expect(cs[1].closedReason).toContain('削除');
    const other = await connect();
    expect(await other.emit('room:check', { code })).toMatchObject({ ok: false });
  });

  it('同じプレイヤーが別タブで接続すると古いタブは切り離される', async () => {
    const { host, clients: cs, code } = await setupRoom(server.port, 'unanimous', 3);
    clients.push(...cs);
    const tab2 = await connect();
    await tab2.ok('room:rejoin', { code, playerId: host.id, token: host.session!.token });
    await sleep(50);
    expect(host.replaced).toBe(true);
    const v = await tab2.waitFor((v) => v.youId === host.id);
    expect(v.players.filter((p) => p.connected)).toHaveLength(3);
  });

  it('ゲーム中に参加した人は観戦者になり、秘密情報は見えない', async () => {
    const { host, clients: cs, code } = await setupRoom(server.port, 'liar', 4);
    clients.push(...cs);
    await host.ok('room:start');
    await host.waitPhase('ROLE');
    const late = await connect();
    await late.join(code, 'おそい');
    const v = await late.waitFor((v) => v.status === 'playing' && v.game !== null);
    expect(v.players.find((p) => p.id === late.id)?.inGame).toBe(false);
    expect(v.game?.me).toBeNull();
    expect((v.game as any).myTopic).toBeNull();
    expect((v.game as any).amLiar).toBeNull();
    expect(await late.action('ready')).toMatchObject({ ok: false });
  });
});
