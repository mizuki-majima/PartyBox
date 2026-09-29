import type { GameId, GameSettings } from '../../shared/games';
import type { GameAction, GameViewBase } from '../../shared/protocol';

/** プレイヤーに表示してよいエラー（アクションの ack で返す） */
export class UserError extends Error {}

/** ゲームがルームに対して要求できる機能 */
export interface GameContext {
  /** 状態が変わったので全員にビューを再送する（同一tick内の複数回呼び出しはまとめて1回送信） */
  update(): void;
  playerName(id: string): string;
  isConnected(id: string): boolean;
  /** 時間（ms）をスケールする。テストでは短縮される */
  scale(ms: number): number;
  /** お絵描き画像を保存し、配信用URLを返す */
  storeImage(data: Buffer, mime: string): string;
  /**
   * お題の山札から n 件引く。同じルームで遊んでいる間は、使い切るまで同じお題が出ない。
   * @param deckId 山札の識別子（ゲームごとなど）
   * @param keyOf 重複判定に使うキー
   */
  drawFromDeck<T>(deckId: string, pool: readonly T[], n: number, keyOf?: (item: T) => string): T[];
}

export interface GameInstance {
  readonly gameId: GameId;
  readonly participants: string[];
  start(): void;
  getView(playerId: string): GameViewBase;
  handleAction(playerId: string, action: GameAction, isHost: boolean): void;
  onPlayerLeave(playerId: string): void;
  onPlayerConnectionChange(playerId: string, connected: boolean): void;
  isOver(): boolean;
  dispose(): void;
}

export interface ServerGameDefinition {
  id: GameId;
  create(ctx: GameContext, participants: string[], settings: GameSettings): GameInstance;
}
