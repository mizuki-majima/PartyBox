import type { GameId, GameSettings } from '../../shared/games';
import type { GameAction, GameViewBase } from '../../shared/protocol';
import { type GameContext, type GameInstance, UserError } from './types';

interface PhaseOptions {
  /** 表示上の制限時間（ms）。省略するとタイマーなし（ホストの「次へ」で進む） */
  duration?: number;
  /** 締切後、遅れて届く送信を受け付ける猶予（ms） */
  grace?: number;
  /** フェーズ終了時の処理（時間切れ・全員完了・ホストのスキップ共通） */
  onEnd?: () => void;
}

/**
 * 全ゲーム共通の状態管理
 *
 *   START → (ROUND → ANSWER → RESULT) × N → GAME_OVER
 *
 * - フェーズ・ラウンド・締切時刻・得点を保持
 * - タイマー切れ / 全員完了 / ホストのスキップ を同じ `advance()` で処理するので二重進行しない
 * - 途中退出したプレイヤーは `left` に入り、完了判定から外れる
 */
export abstract class BaseGame<P extends string = string> implements GameInstance {
  abstract readonly gameId: GameId;

  phase: P | 'START' | 'GAME_OVER' = 'START';
  round = 0;
  totalRounds = 1;
  deadline: number | null = null;
  duration: number | null = null;
  scores: Record<string, number> = {};
  endReason: string | null = null;

  protected readonly left = new Set<string>();
  /** これを下回ったらゲームを打ち切る */
  protected minActivePlayers = 2;

  private timer: NodeJS.Timeout | null = null;
  private onEnd: (() => void) | null = null;
  private disposed = false;

  constructor(
    protected readonly ctx: GameContext,
    readonly participants: string[],
    protected readonly settings: GameSettings,
  ) {
    for (const id of participants) this.scores[id] = 0;
  }

  /* ---------------- ライフサイクル ---------------- */

  start(): void {
    this.setPhase('START', { duration: 4000, onEnd: () => this.beginGame() });
  }

  /** START 演出の後に呼ばれる */
  protected abstract beginGame(): void;

  /** ゲーム固有のアクション処理 */
  protected abstract onAction(playerId: string, action: GameAction, isHost: boolean): void;

  /** ゲーム固有のビュー */
  abstract getView(playerId: string): GameViewBase;

  /** 途中退出時のゲーム固有処理（デフォルト: 完了判定をやり直す） */
  protected onLeave(_playerId: string): void {
    this.checkComplete();
  }

  /** 全員が完了していればフェーズを進める。各ゲームでオーバーライド */
  protected checkComplete(): void {}

  isOver(): boolean {
    return this.phase === 'GAME_OVER';
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.onEnd = null;
  }

  /* ---------------- ヘルパー ---------------- */

  get active(): string[] {
    return this.participants.filter((id) => !this.left.has(id));
  }

  isParticipant(id: string): boolean {
    return this.participants.includes(id);
  }

  isActive(id: string): boolean {
    return this.isParticipant(id) && !this.left.has(id);
  }

  protected setPhase(phase: P | 'START' | 'GAME_OVER', opts: PhaseOptions = {}): void {
    if (this.disposed) return;
    this.clearTimer();
    this.phase = phase;
    this.onEnd = opts.onEnd ?? null;
    if (opts.duration != null) {
      const ms = this.ctx.scale(opts.duration);
      const grace = this.ctx.scale(opts.grace ?? 0);
      this.duration = ms;
      this.deadline = Date.now() + ms;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.advance();
      }, ms + grace);
    } else {
      this.duration = null;
      this.deadline = null;
    }
    this.ctx.update();
  }

  /** 現フェーズを終了して次へ（多重呼び出しは無視される） */
  protected advance(): void {
    const fn = this.onEnd;
    this.onEnd = null;
    this.clearTimer();
    if (!fn || this.disposed) return;
    try {
      fn();
    } catch (err) {
      console.error(`[${this.gameId}] phase transition failed`, err);
      this.endGame('エラーが発生したため、ゲームを終了しました');
    }
    this.ctx.update();
  }

  protected endGame(reason: string | null = null): void {
    this.clearTimer();
    this.onEnd = null;
    this.endReason = reason;
    this.phase = 'GAME_OVER';
    this.deadline = null;
    this.duration = null;
    this.ctx.update();
  }

  protected addScore(playerId: string, delta: number): void {
    if (!(playerId in this.scores)) return;
    this.scores[playerId] += delta;
  }

  protected requireActive(playerId: string): void {
    if (!this.isActive(playerId)) throw new UserError('このゲームには参加していません（次のゲームから参加できます）');
  }

  protected requirePhase(...phases: string[]): void {
    if (!phases.includes(this.phase)) throw new UserError('今はその操作はできません');
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /* ---------------- GameInstance 実装 ---------------- */

  handleAction(playerId: string, action: GameAction, isHost: boolean): void {
    if (this.disposed) throw new UserError('ゲームは終了しています');
    if (action.type === 'skip' || action.type === 'next') {
      if (!isHost) throw new UserError('ホストのみ操作できます');
      if (this.phase === 'GAME_OVER') return;
      this.advance();
      return;
    }
    if (this.phase === 'GAME_OVER') throw new UserError('ゲームは終了しています');
    this.onAction(playerId, action, isHost);
    this.ctx.update();
  }

  onPlayerLeave(playerId: string): void {
    if (!this.isParticipant(playerId) || this.left.has(playerId)) return;
    this.left.add(playerId);
    if (this.phase === 'GAME_OVER') {
      this.ctx.update();
      return;
    }
    if (this.active.length < this.minActivePlayers) {
      this.endGame('参加者が足りなくなったため、ゲームを終了しました');
      return;
    }
    try {
      this.onLeave(playerId);
    } catch (err) {
      console.error(`[${this.gameId}] onLeave failed`, err);
    }
    this.ctx.update();
  }

  onPlayerConnectionChange(_playerId: string, _connected: boolean): void {
    this.ctx.update();
  }

  protected baseView(playerId: string): GameViewBase {
    return {
      gameId: this.gameId,
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      deadline: this.deadline,
      duration: this.duration,
      players: this.participants.map((id) => ({
        id,
        name: this.ctx.playerName(id),
        left: this.left.has(id),
        connected: this.ctx.isConnected(id),
      })),
      scores: { ...this.scores },
      me: this.isParticipant(playerId) ? playerId : null,
      endReason: this.endReason,
    };
  }
}

/** 共通: 「全員の入力を待つ」フェーズで使う提出管理 */
export function pendingPlayers(active: string[], done: Iterable<string>): string[] {
  const doneSet = new Set(done);
  return active.filter((id) => !doneSet.has(id));
}
