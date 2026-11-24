import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol';

export type PartySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: PartySocket | null = null;

/** アプリ全体で1本のソケットを共有する（同一オリジンの /socket.io に接続） */
export function getSocket(): PartySocket {
  if (!socket) {
    socket = io({
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return socket;
}

/**
 * 共有のソケットとは別に、1本だけ新しく繋ぐ（使い終わったら disconnect すること）。
 * デモの画面が、司会と参加者それぞれの人として部屋に入るときに使う。
 */
export async function openSocket(timeoutMs = 8000): Promise<PartySocket> {
  const s: PartySocket = io({ transports: ['websocket', 'polling'], forceNew: true, reconnection: false });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      s.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      s.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } catch (err) {
    s.disconnect();
    throw err;
  }
  return s;
}

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type Result<E extends keyof ClientToServerEvents> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

/** 指定したソケットで ack 付きのイベントを送信し、結果を Promise で返す（タイムアウト時はエラー扱い） */
export async function requestOn<E extends keyof ClientToServerEvents>(
  s: PartySocket,
  event: E,
  payload: Payload<E>,
  timeoutMs = 8000,
): Promise<Result<E>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (s.timeout(timeoutMs) as any).emitWithAck(event, payload)) as Result<E>;
  } catch {
    return { ok: false, error: '通信がタイムアウトしました。接続を確認してください' } as Ack as Result<E>;
  }
}

/** 共有のソケットで ack 付きのイベントを送信する */
export async function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Payload<E>,
  timeoutMs = 8000,
): Promise<Result<E>> {
  return requestOn(getSocket(), event, payload, timeoutMs);
}
