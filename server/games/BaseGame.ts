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

/** 準備の関門の状態（ビューの GateView のもと） */
interface GateState {
  ready: Set<string>;
  counting: boolean;
  canEnd: boolean;
  /** カウントダウンが終わったら呼ぶ */
  onGo: () => void;
}

/**
 * 全ゲーム共通の状態管理
 *
 *   START（準備の関門）→ (ROUND → ANSWER → RESULT) × N → GAME_OVER
 *
 * - 準備の関門（openGate）: 時間では進まず、全員（切れている人を除く）の「準備OK」で自動のカウントダウンに入り、終わると進む。
 *   カウントダウン中はホストが止められる。ホストの「待たずに始める」（skip）はすぐカウントダウンに入る
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
  private gate: GateState | null = null;
  /** 関門の中（待つ・カウントダウン）からの setPhase か。それ以外の setPhase は関門を消す */
  private keepGate = false;

  /** 準備の関門のカウントダウンの長さ（ルームの時間の倍率で縮む） */
  static readonly GATE_COUNTDOWN_MS = 3000;

  constructor(
    protected readonly ctx: GameContext,
    readonly participants: string[],
    protected readonly settings: GameSettings,
  ) {
    for (const id of participants) this.scores[id] = 0;
  }

  /* ---------------- ライフサイクル ---------------- */

  /** 遊び方を出して、全員の準備OKを待つ（準備の関門）。カウントダウンが終わったら beginGame */
  start(): void {
    this.openGate('START', { onGo: () => this.beginGame() });
  }

  /** START の関門を抜けた後に呼ばれる */
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
    this.gate = null;
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
    // 関門の状態は、関門のフェーズの間だけ持つ（ゲームが途中で別のフェーズへ進めたら消す。残ると結果の画面で勝手に進む）
    if (!this.keepGate) this.gate = null;
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

  /**
   * 準備の関門を開く。時間では進まず、全員（切れている人を除く）が「準備OK」を押すと自動でカウントダウンに入り、
   * 終わると onGo を呼ぶ。roundHead（ラウンドの頭）なら、2ラウンド目からホストに「ここで終了」を出す
   */
  protected openGate(phase: P | 'START', opts: { roundHead?: boolean; onGo: () => void }): void {
    this.gate = { ready: new Set(), counting: false, canEnd: opts.roundHead === true && this.round > 1, onGo: opts.onGo };
    this.waitGate(phase);
  }

  /** 関門で待つ（時間なし。そろう・ホストの skip で beginCountdown） */
  private waitGate(phase: P | 'START'): void {
    this.gatePhase(phase, { onEnd: () => this.beginCountdown() });
  }

  /** 関門の中からのフェーズの設定（関門を消さない） */
  private gatePhase(phase: P | 'START', opts: PhaseOptions): void {
    this.keepGate = true;
    try {
      this.setPhase(phase, opts);
    } finally {
      this.keepGate = false;
    }
  }

  private beginCountdown(): void {
    const g = this.gate;
    if (!g) return;
    g.counting = true;
    this.gatePhase(this.phase as P | 'START', {
      duration: BaseGame.GATE_COUNTDOWN_MS,
      onEnd: () => {
        this.gate = null;
        g.onGo();
      },
    });
  }

  /** 待つ相手（つながっていて、抜けていない参加者）が全員準備OKなら、カウントダウンに入る */
  private checkGate(): void {
    const g = this.gate;
    if (!g || g.counting || this.phase === 'GAME_OVER') return;
    const waiting = this.active.filter((id) => this.ctx.isConnected(id));
    if (waiting.length > 0 && waiting.every((id) => g.ready.has(id))) this.advance();
  }

  /**
   * ラウンドの頭でホストが「ここで終了」: それまでに終わったラウンドの点で最終結果を出す（endReason は付けないので、勝者の記録に残る）
   */
  protected finishEarly(): void {
    const done = Math.max(0, this.round - 1);
    this.round = done;
    this.totalRounds = done;
    this.endGame(null);
  }

  protected endGame(reason: string | null = null): void {
    this.clearTimer();
    this.onEnd = null;
    this.gate = null;
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
      // 関門では、前の画面の「次へ」の二度押し（画面の更新が遅れて届く間）で準備OKを飛ばさない。
      // 「待たずに始める／進む」（skip）は待っている間だけ受け、カウントダウン中は 3・2・1 を飛ばさない
      if (this.gate && (action.type === 'next' || this.gate.counting)) return;
      this.advance();
      return;
    }
    if (this.phase === 'GAME_OVER') throw new UserError('ゲームは終了しています');
    if (this.gate) {
      // 準備の関門の操作は、各ゲームより先に受ける
      if (action.type === 'ready') {
        this.requireActive(playerId);
        this.gate.ready.add(playerId);
        this.checkGate();
        this.ctx.update();
        return;
      }
      if (action.type === 'gate:end') {
        if (!isHost) throw new UserError('ホストのみ操作できます');
        if (!this.gate.canEnd) throw new UserError('今は終了できません');
        this.finishEarly();
        return;
      }
      if (action.type === 'gate:stop') {
        if (!isHost) throw new UserError('ホストのみ操作できます');
        if (!this.gate.counting) return;
        // 止めたら全員の準備OKを取り消す（もう一度そろうと、またカウントダウン）
        this.gate.counting = false;
        this.gate.ready.clear();
        this.waitGate(this.phase as P | 'START');
        return;
      }
    }
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
    this.checkGate(); // 抜けた人を待たない
    try {
      this.onLeave(playerId);
    } catch (err) {
      console.error(`[${this.gameId}] onLeave failed`, err);
    }
    this.ctx.update();
  }

  onPlayerConnectionChange(_playerId: string, _connected: boolean): void {
    this.checkGate(); // 切れた人を待たない
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
      gate: this.gate ? { ready: [...this.gate.ready], counting: this.gate.counting, canEnd: this.gate.canEnd } : null,
    };
  }
}

/** 共通: 「全員の入力を待つ」フェーズで使う提出管理 */
export function pendingPlayers(active: string[], done: Iterable<string>): string[] {
  const doneSet = new Set(done);
  return active.filter((id) => !doneSet.has(id));
}
