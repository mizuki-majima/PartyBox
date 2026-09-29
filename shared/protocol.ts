/**
 * クライアント ⇔ サーバー間の Socket.IO イベント定義
 *
 * 設計方針:
 *  - サーバー権威型。クライアントは「操作（アクション）」だけを送る。
 *  - サーバーはプレイヤーごとに秘匿情報を除いたビュー（RoomView）を生成して送る。
 *  - タイマーは締切時刻（サーバー時刻の epoch ms）で配信し、クライアントは serverNow との差で補正する。
 */
import type { GameId, GameSettings } from './games';

export type RoomStatus = 'lobby' | 'playing';

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  isHost: boolean;
  /** 現在のゲームに参加中か（途中参加者は false = 観戦） */
  inGame: boolean;
}

export interface GamePlayerRef {
  id: string;
  name: string;
  left: boolean;
  connected: boolean;
}

/** すべてのゲームビューが持つ共通フィールド */
export interface GameViewBase {
  gameId: GameId;
  phase: string;
  round: number;
  totalRounds: number;
  /** 現フェーズの締切（サーバー時刻 ms）。タイマーなしは null */
  deadline: number | null;
  /** 現フェーズの長さ（ms）。進捗バー表示用 */
  duration: number | null;
  players: GamePlayerRef[];
  scores: Record<string, number>;
  /** 自分のプレイヤーID。観戦者は null */
  me: string | null;
  /** 途中終了した場合の理由 */
  endReason: string | null;
}

export interface RoomView {
  code: string;
  gameId: GameId;
  hostId: string;
  youId: string;
  status: RoomStatus;
  players: PlayerView[];
  settings: GameSettings;
  maxPlayers: number;
  game: GameViewBase | null;
  serverNow: number;
}

export interface SessionInfo {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

export interface RoomSummary {
  code: string;
  gameId: GameId;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type AckFn<T = object> = (res: Ack<T>) => void;

export interface GameAction {
  type: string;
  [key: string]: unknown;
}

export interface ClientToServerEvents {
  'room:check': (p: { code: string }, ack: AckFn<{ room: RoomSummary }>) => void;
  'room:create': (p: { gameId: GameId; name: string }, ack: AckFn<{ session: SessionInfo }>) => void;
  'room:join': (p: { code: string; name: string }, ack: AckFn<{ session: SessionInfo }>) => void;
  'room:rejoin': (p: { code: string; playerId: string; token: string }, ack: AckFn<{ session: SessionInfo }>) => void;
  'room:leave': (p: object, ack: AckFn) => void;
  'room:rename': (p: { name: string }, ack: AckFn) => void;
  'room:kick': (p: { playerId: string }, ack: AckFn) => void;
  'room:close': (p: object, ack: AckFn) => void;
  'room:settings': (p: { settings: GameSettings }, ack: AckFn) => void;
  'room:changeGame': (p: { gameId: GameId }, ack: AckFn) => void;
  'room:start': (p: object, ack: AckFn) => void;
  'room:restart': (p: object, ack: AckFn) => void;
  'room:backToLobby': (p: object, ack: AckFn) => void;
  'game:action': (p: GameAction, ack: AckFn) => void;
}

export interface ServerToClientEvents {
  'room:state': (view: RoomView) => void;
  'room:closed': (p: { reason: string }) => void;
  'room:kicked': () => void;
  'session:replaced': () => void;
}

export const LIMITS = {
  nameLength: 12,
  answerLength: 40,
  statementLength: 80,
  promptLength: 40,
  /** お絵描き画像の最大サイズ（base64 デコード後のバイト数） */
  imageBytes: 600_000,
} as const;
