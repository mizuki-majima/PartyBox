import type { GameSettings } from '../../../shared/games';
import {
  AD_STAGE_H,
  AD_STAGE_W,
  type AdDodgePhase,
  type AdDodgeView,
  type AdRoundResult,
  type AdRoundRow,
  type AdTrapKind,
  type AdTrapStat,
} from '../../../shared/games/views';
import type { GameAction } from '../../../shared/protocol';
import { BaseGame } from '../BaseGame';
import { type GameContext, UserError } from '../types';
import {
  createRng,
  generateRound,
  hitTest,
  landingStep,
  type PageDef,
  passPoint,
  type Rng,
  type StepDef,
  TRAP_INFO,
  trapPoint,
  type Zone,
} from './stages';

/** 広告を押したあと、戻れるようになるまで（ms。ルームの時間の速さに合わせて縮む） */
export const PENALTY_MS = 3000;
/** ラウンドの結果を見せる時間（ms）。ホストは「次へ」で先に進められる */
const RESULT_MS = 15000;
/** 連打の上限（1秒あたり）。超えたぶんは数えない（でたらめに押して当てるのを防ぐ） */
const MAX_TAPS_PER_SEC = 8;
/**
 * スマホが言う「押した時刻」を、どこまで前にさかのぼって認めるか（ms）。
 * 回線の遅れのせいで、割り込み広告が出る前に押したのに、出たあとに届くことがあるため
 */
const MAX_TAP_LAG_MS = 1500;

/** ゴールした順の点（4位より後は、ゴールすれば +1） */
export function finishPoints(order: number): number {
  return [5, 3, 2][order] ?? 1;
}

interface Penalty {
  id: number;
  startedAt: number;
  until: number;
  trap: AdTrapKind;
  step: StepDef;
}

interface Racer {
  page: number;
  step: number;
  stepStartedAt: number;
  finishedMs: number | null;
  traps: number;
  trapKinds: Map<AdTrapKind, number>;
  penalty: Penalty | null;
  tapTimes: number[];
}

function newRacer(now: number): Racer {
  return { page: 0, step: 0, stepStartedAt: now, finishedMs: null, traps: 0, trapKinds: new Map(), penalty: null, tapTimes: [] };
}

/** 時間で変わる判定が、すべて変わり終わる時刻（段が始まってからの ms） */
function settledTime(zones: readonly Zone[]): number {
  let t = 0;
  for (const z of zones) t = Math.max(t, z.from ?? 0, z.shift?.at ?? 0);
  return t;
}

export class AdDodgeGame extends BaseGame<AdDodgePhase> {
  readonly gameId = 'ad-dodge' as const;

  private readonly pageCount: number;
  private readonly timeLimit: number;
  private pages: PageDef[] = [];
  private racers = new Map<string, Racer>();
  private raceStartedAt: number | null = null;
  private result: AdRoundResult | null = null;
  private history: AdDodgeView['history'] = [];
  private roundTraps = new Map<AdTrapKind, number>();
  private penaltySeq = 0;
  private readonly rng: Rng = createRng(Math.floor(Math.random() * 2 ** 32));
  /** 通しの試験（E2E）のときだけ、押せば進める場所をビューに入れる */
  private readonly reveal = process.env.PARTYBOX_AD_DODGE_REVEAL === '1';

  constructor(ctx: GameContext, participants: string[], settings: GameSettings) {
    super(ctx, participants, settings);
    this.totalRounds = Number(settings.rounds) || 3;
    this.pageCount = Number(settings.pages) || 8;
    this.timeLimit = (Number(settings.timeLimit) || 90) * 1000;
  }

  protected beginGame(): void {
    this.startRound(1);
  }

  private startRound(round: number): void {
    this.round = round;
    this.result = null;
    this.raceStartedAt = null;
    this.roundTraps.clear();
    // 全員が同じ種から作ったページを遊ぶ（同じページが同じ順に出る）
    this.pages = generateRound(this.rng.int(0, 2 ** 31), this.pageCount, (ms) => this.ctx.scale(ms));
    this.racers = new Map(this.participants.map((id) => [id, newRacer(Date.now())]));
    this.setPhase('ROUND_INTRO', { duration: 3000, onEnd: () => this.startRace() });
  }

  private startRace(): void {
    const now = Date.now();
    this.raceStartedAt = now;
    for (const r of this.racers.values()) r.stepStartedAt = now;
    this.setPhase('RACE', { duration: this.timeLimit, onEnd: () => this.finishRace() });
  }

  private finishRace(): void {
    this.result = this.computeResult();
    for (const row of this.result.rows) this.addScore(row.id, row.points);
    const first = this.result.rows.find((r) => r.finishedMs != null) ?? null;
    this.history.push({ round: this.round, winnerId: first?.id ?? null, ms: first?.finishedMs ?? null });
    this.setPhase('RESULT', {
      duration: RESULT_MS,
      onEnd: () => (this.round >= this.totalRounds ? this.endGame() : this.startRound(this.round + 1)),
    });
  }

  private computeResult(): AdRoundResult {
    const rows = this.participants.map((id) => {
      const r = this.racers.get(id)!;
      return { id, cleared: r.page, finishedMs: r.finishedMs, traps: r.traps };
    });
    // ゴールした人は早い順、ゴールできなかった人は進んだページの多い順（同じなら広告を押した回数の少ない順）
    rows.sort((a, b) => {
      if (a.finishedMs != null && b.finishedMs != null) return a.finishedMs - b.finishedMs;
      if (a.finishedMs != null) return -1;
      if (b.finishedMs != null) return 1;
      return b.cleared - a.cleared || a.traps - b.traps;
    });
    let finishers = 0;
    const ranked: AdRoundRow[] = [];
    rows.forEach((row, i) => {
      const prev = ranked[i - 1];
      // ゴールできなかった人どうしで成績が同じなら、同じ順位にする
      const tied = prev && row.finishedMs == null && prev.finishedMs == null && prev.cleared === row.cleared && prev.traps === row.traps;
      // 途中で抜けた人には点を付けない（ゴールの順番も詰める）
      const points = row.finishedMs != null && !this.left.has(row.id) ? finishPoints(finishers++) : 0;
      ranked.push({ ...row, rank: tied ? prev.rank : i + 1, points });
    });
    let worst: AdTrapStat | null = null;
    for (const [kind, count] of this.roundTraps) {
      if (!worst || count > worst.count) worst = { kind, label: TRAP_INFO[kind].label, tip: TRAP_INFO[kind].tip, count };
    }
    return {
      round: this.round,
      rows: ranked,
      pages: this.pages.map((p) => ({ kind: p.kind, label: TRAP_INFO[p.kind].label, tip: TRAP_INFO[p.kind].tip })),
      worstTrap: worst,
    };
  }

  protected checkComplete(): void {
    if (this.phase !== 'RACE') return;
    if (this.active.every((id) => this.racers.get(id)?.finishedMs != null)) this.advance();
  }

  /** スマホが言う「段が始まってから押すまでの時間」を、ありえる範囲に収める */
  private tapTime(raw: unknown, elapsed: number): number {
    const t = Number(raw);
    if (!Number.isFinite(t)) return elapsed;
    return Math.min(elapsed, Math.max(elapsed - MAX_TAP_LAG_MS, 0, t));
  }

  private openPenalty(r: Racer, trap: AdTrapKind, now: number): void {
    r.traps++;
    r.trapKinds.set(trap, (r.trapKinds.get(trap) ?? 0) + 1);
    this.roundTraps.set(trap, (this.roundTraps.get(trap) ?? 0) + 1);
    const lock = this.ctx.scale(PENALTY_MS);
    r.penalty = { id: ++this.penaltySeq, startedAt: now, until: now + lock, trap, step: landingStep(this.rng, lock) };
  }

  protected onAction(playerId: string, action: GameAction): void {
    if (action.type !== 'tap') throw new UserError('不明な操作です');
    this.requirePhase('RACE');
    this.requireActive(playerId);
    const r = this.racers.get(playerId);
    if (!r || r.finishedMs != null) return;
    const now = Date.now();
    r.tapTimes = r.tapTimes.filter((t) => now - t < 1000);
    if (r.tapTimes.length >= MAX_TAPS_PER_SEC) return;
    r.tapTimes.push(now);

    const x = Number(action.x);
    const y = Number(action.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > AD_STAGE_W || y > AD_STAGE_H) return;

    // 広告のページを見ている間は、そのページの「戻る」と「受け取る」だけ
    if (r.penalty) {
      const p = r.penalty;
      if (Number(action.landing) !== p.id || now < p.until) return;
      const hit = hitTest(p.step.zones, x, y, this.tapTime(action.t, now - p.startedAt));
      if (hit?.act === 'exit') r.penalty = null;
      else if (hit?.act === 'trap') this.openPenalty(r, p.trap, now);
      return;
    }

    // 前の段に向けた押し直し（二度押し・届く前の連打）は数えない
    if (action.landing != null || Number(action.page) !== r.page || Number(action.step) !== r.step) return;
    const page = this.pages[r.page];
    const step = page?.steps[r.step];
    if (!page || !step) return;
    const hit = hitTest(step.zones, x, y, this.tapTime(action.t, now - r.stepStartedAt));
    if (!hit) return;
    if (hit.act === 'trap') {
      this.openPenalty(r, page.kind, now);
      return;
    }
    if (hit.act === 'step' && r.step + 1 < page.steps.length) {
      r.step++;
      r.stepStartedAt = now;
      return;
    }
    r.page++;
    r.step = 0;
    r.stepStartedAt = now;
    if (r.page >= this.pages.length) {
      r.finishedMs = now - (this.raceStartedAt ?? now);
      this.checkComplete();
    }
  }

  /** 試験用: その人がいま押せば進める場所（時間で変わるものは、変わり終わったあと） */
  private debugTarget(r: Racer): AdDodgeView['debugTarget'] {
    if (r.penalty) {
      const t = settledTime(r.penalty.step.zones);
      const p = passPoint(r.penalty.step.zones, t);
      return p && { ...p, at: r.penalty.startedAt + t };
    }
    const step = this.pages[r.page]?.steps[r.step];
    if (!step) return null;
    const t = Math.max(settledTime(step.zones), Date.now() - r.stepStartedAt);
    const p = passPoint(step.zones, t);
    return p && { ...p, at: r.stepStartedAt + t, trap: trapPoint(step.zones, t) };
  }

  getView(playerId: string): AdDodgeView {
    const r = this.racers.get(playerId);
    const racing = this.phase === 'RACE' && !!r && this.isActive(playerId) && r.finishedMs == null;
    const page = r ? this.pages[r.page] : undefined;
    const step = r ? page?.steps[r.step] : undefined;
    const showRacers = this.phase === 'RACE' || this.phase === 'RESULT';
    return {
      ...this.baseView(playerId),
      gameId: 'ad-dodge',
      phase: this.phase,
      pages: this.pageCount,
      raceStartedAt: this.phase === 'RACE' ? this.raceStartedAt : null,
      racers: showRacers
        ? this.participants.map((id) => {
            const x = this.racers.get(id)!;
            return { id, cleared: x.page, finishedMs: x.finishedMs, traps: x.traps };
          })
        : [],
      // 見せるのは見た目だけ。どこを押せば進めるか（zones）は送らない
      stage:
        racing && page && step
          ? { page: r.page, step: r.step, kind: page.kind, site: page.site, headline: page.headline, startedAt: r.stepStartedAt, els: step.els }
          : null,
      penalty:
        racing && r.penalty
          ? { id: r.penalty.id, startedAt: r.penalty.startedAt, until: r.penalty.until, trap: r.penalty.trap, els: r.penalty.step.els }
          : null,
      myTraps: r
        ? [...r.trapKinds].map(([kind, count]) => ({ kind, label: TRAP_INFO[kind].label, tip: TRAP_INFO[kind].tip, count }))
        : [],
      roundResult: this.phase === 'RESULT' ? this.result : null,
      history: this.history,
      debugTarget: this.reveal && racing && r ? this.debugTarget(r) : null,
    };
  }
}
