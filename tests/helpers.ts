import { io, type Socket } from 'socket.io-client';
import type { GameId } from '../shared/games';
import type { Ack, ClientToServerEvents, RoomView, ServerToClientEvents, SessionInfo } from '../shared/protocol';
import { type PartyServer, type PartyServerOptions, startPartyServer } from '../server/app';

export function startTestServer(opts: PartyServerOptions = {}): Promise<PartyServer> {
  return startPartyServer({
    port: 0,
    staticDir: null,
    // ゲーム内の時間を 1/50 に短縮（30秒 → 0.6秒）
    timeScale: 0.02,
    disconnectGraceMs: 400,
    hostTransferMs: 150,
    ...opts,
  });
}

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** テスト用の仮想プレイヤー（1ブラウザ = 1クライアント） */
export class TestClient {
  view: RoomView | null = null;
  session: SessionInfo | null = null;
  closedReason: string | null = null;
  kicked = false;
  replaced = false;
  private listeners = new Set<() => void>();

  private constructor(readonly socket: ClientSocket) {
    socket.on('room:state', (v) => {
      this.view = v;
      for (const l of this.listeners) l();
    });
    socket.on('room:closed', ({ reason }) => (this.closedReason = reason));
    socket.on('room:kicked', () => (this.kicked = true));
    socket.on('session:replaced', () => (this.replaced = true));
  }

  static async connect(port: number): Promise<TestClient> {
    const socket: ClientSocket = io(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return new TestClient(socket);
  }

  get id(): string {
    return this.session!.playerId;
  }

  get game(): any {
    return this.view?.game;
  }

  async emit<T = object>(event: keyof ClientToServerEvents, payload: object = {}): Promise<Ack<T>> {
    return (await (this.socket as any).timeout(5000).emitWithAck(event, payload)) as Ack<T>;
  }

  /** 失敗したら例外にする emit */
  async ok<T = object>(event: keyof ClientToServerEvents, payload: object = {}): Promise<T> {
    const res = await this.emit<T>(event, payload);
    if (!res.ok) throw new Error(`${event} failed: ${res.error}`);
    return res as T;
  }

  async create(gameId: GameId, name: string): Promise<string> {
    const res = await this.ok<{ session: SessionInfo }>('room:create', { gameId, name });
    this.session = res.session;
    return res.session.code;
  }

  async join(code: string, name: string): Promise<void> {
    const res = await this.ok<{ session: SessionInfo }>('room:join', { code, name });
    this.session = res.session;
  }

  action(type: string, extra: object = {}) {
    return this.emit('game:action', { type, ...extra });
  }

  async actionOk(type: string, extra: object = {}) {
    const res = await this.action(type, extra);
    if (!res.ok) throw new Error(`action ${type} failed: ${res.error}`);
  }

  /** 条件を満たすビューが届くまで待つ */
  waitFor(pred: (v: RoomView) => boolean, timeoutMs = 5000, label = 'condition'): Promise<RoomView> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.view && pred(this.view)) {
          cleanup();
          resolve(this.view);
          return true;
        }
        return false;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${label}. Last phase: ${this.view?.game?.phase ?? this.view?.status}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(listener);
      };
      const listener = () => void check();
      if (!check()) this.listeners.add(listener);
    });
  }

  waitPhase(phase: string, extra: (v: RoomView) => boolean = () => true, timeoutMs = 5000) {
    return this.waitFor((v) => v.game?.phase === phase && extra(v), timeoutMs, `phase ${phase}`);
  }

  close(): void {
    this.socket.disconnect();
  }
}

/** ホスト1人 + 参加者 n-1 人でルームを作る */
export async function setupRoom(port: number, gameId: GameId, count: number, settings?: object) {
  const names = ['みずき', 'たろう', 'はな', 'けん', 'ゆい', 'そら', 'りく', 'めい', 'かい', 'のあ'];
  const host = await TestClient.connect(port);
  const code = await host.create(gameId, names[0]);
  const clients = [host];
  for (let i = 1; i < count; i++) {
    const c = await TestClient.connect(port);
    await c.join(code, names[i]);
    clients.push(c);
  }
  if (settings) await host.ok('room:settings', { settings });
  await Promise.all(clients.map((c) => c.waitFor((v) => v.players.length === count)));
  return { host, clients, code };
}

/** ホストが開始し、全員が最初の入力フェーズに入るまで待つ（START演出は短縮時間で自動的に進む） */
export async function startGame(host: TestClient, clients: TestClient[], firstPhase: string) {
  await host.ok('room:start');
  await Promise.all(clients.map((c) => c.waitPhase(firstPhase)));
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 1x1 の透明PNG */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
