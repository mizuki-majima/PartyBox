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

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type Result<E extends keyof ClientToServerEvents> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

/** ack 付きでイベントを送信し、結果を Promise で返す（タイムアウト時はエラー扱い） */
export async function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Payload<E>,
  timeoutMs = 8000,
): Promise<Result<E>> {
  const s = getSocket();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (s.timeout(timeoutMs) as any).emitWithAck(event, payload)) as Result<E>;
  } catch {
    return { ok: false, error: '通信がタイムアウトしました。接続を確認してください' } as Ack as Result<E>;
  }
}
