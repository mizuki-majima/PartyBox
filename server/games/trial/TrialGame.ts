import type { GameSettings } from '../../../shared/games';
import type { TrialCase, TrialPhase, TrialResult, TrialRole, TrialView, Verdict } from '../../../shared/games/views';
import { type GameAction, LIMITS } from '../../../shared/protocol';
import data from '../../data/trial.json';
import { pick, shuffle } from '../../utils/random';
import { cleanText } from '../../utils/text';
import { BaseGame, pendingPlayers } from '../BaseGame';
import { TurnSequence } from '../TurnSequence';
import { type GameContext, UserError } from '../types';

type CaseTemplate = (typeof data.cases)[number];

export const TRIAL_POINTS = {
  /** 検察: 有罪判決 / 弁護士・被告: 無罪判決 */
  advocateWin: 3,
  defendantAcquitted: 3,
  /** 真実と同じ票を入れた（証人） */
  witnessCorrect: 2,
  /** 真実と同じ票を入れた（検察・弁護士） */
  voterCorrect: 1,
} as const;

/** 証人に配る証拠が「真実側」になる確率 */
const WITNESS_TRUTH_BIAS = 0.7;

export interface GeneratedCase {
  info: TrialCase;
  truthText: string;
  cards: Record<string, string[]>;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

/**
 * 事件テンプレートと役職から、事件文・証拠カードをランダム生成する（テスト対象）
 * - 検察には有罪寄り、弁護士には無罪寄りの証拠
 * - 証人には 70% の確率で真実側の証拠
 * - 被告には真実と、弁明に使える無罪寄りの証拠
 */
export function generateCase(
  template: CaseTemplate,
  defendantName: string,
  roles: Record<string, TrialRole>,
  truth: Verdict,
): GeneratedCase {
  const vars: Record<string, string> = { d: defendantName };
  for (const [key, options] of Object.entries(template.vars ?? {})) vars[key] = pick(options as string[]);

  const guiltyPool = shuffle(template.guilty);
  const innocentPool = shuffle(template.innocent);
  const draw = (side: Verdict): string => {
    const primary = side === 'guilty' ? guiltyPool : innocentPool;
    const generic = side === 'guilty' ? data.generic.guilty : data.generic.innocent;
    const card = primary.shift() ?? pick(generic);
    return fill(card, vars);
  };

  const cards: Record<string, string[]> = {};
  for (const [id, role] of Object.entries(roles)) {
    switch (role) {
      case 'prosecutor':
        cards[id] = [draw('guilty')];
        break;
      case 'defense':
        cards[id] = [draw('innocent')];
        break;
      case 'defendant':
        cards[id] = [draw('innocent')];
        break;
      case 'witness': {
        const truthful = Math.random() < WITNESS_TRUTH_BIAS;
        const side: Verdict = truthful ? truth : truth === 'guilty' ? 'innocent' : 'guilty';
        cards[id] = [draw(side)];
        break;
      }
    }
  }

  return {
    info: {
      title: template.title,
      summary: fill(template.summary, vars),
      question: fill(template.question, vars),
    },
    truthText: fill(truth === 'guilty' ? template.guiltyTruth : template.innocentTruth, vars),
    cards,
  };
}

/** 判決（同数は「疑わしきは罰せず」で無罪） */
export function decideVerdict(votes: Iterable<Verdict>): Verdict {
  let guilty = 0;
  let innocent = 0;
  for (const v of votes) v === 'guilty' ? guilty++ : innocent++;
  return guilty > innocent ? 'guilty' : 'innocent';
}

export class TrialGame extends BaseGame<TrialPhase> {
  readonly gameId = 'ten-sec-trial' as const;
  protected override minActivePlayers = 3;

  private readonly speakTime: number;
  private readonly voteTime: number;
  private readonly cases: CaseTemplate[];
  /** 役職ローテーション用の固定順 */
  private readonly rotation: string[];

  private roles: Record<string, TrialRole> = {};
  private truth: Verdict = 'innocent';
  private current: GeneratedCase | null = null;
  private ready = new Set<string>();
  private turns = new TurnSequence();
  private votes = new Map<string, Verdict>();
  private result: TrialResult | null = null;

  constructor(ctx: GameContext, participants: string[], settings: GameSettings) {
    super(ctx, participants, settings);
    this.totalRounds = Number(settings.rounds);
    this.speakTime = Number(settings.speakTime) * 1000;
    this.voteTime = Number(settings.voteTime) * 1000;
    this.cases = ctx.drawFromDeck('trial', data.cases, this.totalRounds, (c) => c.title);
    this.rotation = shuffle(participants);
  }

  private get defendantId(): string | undefined {
    return Object.keys(this.roles).find((id) => this.roles[id] === 'defendant');
  }

  protected beginGame(): void {
    this.startRound(1);
  }

  private startRound(round: number): void {
    this.round = round;
    const active = this.rotation.filter((id) => this.isActive(id));
    const n = active.length;
    const offset = (round - 1) % n;
    const rotated = [...active.slice(offset), ...active.slice(0, offset)];
    this.roles = {};
    rotated.forEach((id, i) => {
      this.roles[id] = i === 0 ? 'defendant' : i === 1 ? 'prosecutor' : i === 2 ? 'defense' : 'witness';
    });
    this.truth = Math.random() < 0.5 ? 'guilty' : 'innocent';
    const template = this.cases[(round - 1) % this.cases.length];
    this.current = generateCase(template, this.ctx.playerName(rotated[0]), this.roles, this.truth);
    this.ready.clear();
    this.votes.clear();
    this.result = null;
    this.setPhase('BRIEFING', { duration: 30000, onEnd: () => this.startTestimony() });
  }

  private startTestimony(): void {
    const byRole = (role: TrialRole) => Object.keys(this.roles).filter((id) => this.roles[id] === role);
    this.turns.reset([...byRole('prosecutor'), ...shuffle(byRole('witness')), ...byRole('defense'), ...byRole('defendant')]);
    this.nextTurn();
  }

  private canSpeak = (id: string) => this.isActive(id) && this.ctx.isConnected(id);

  private nextTurn(): void {
    const speaker = this.turns.next(this.canSpeak);
    if (!speaker) {
      this.setPhase('VOTE', { duration: this.voteTime, grace: 500, onEnd: () => this.resolve() });
      return;
    }
    this.setPhase('TESTIMONY', { duration: this.speakTime, grace: 500, onEnd: () => this.nextTurn() });
  }

  private get voters(): string[] {
    return this.active.filter((id) => this.roles[id] && this.roles[id] !== 'defendant');
  }

  private resolve(note: string | null = null, aborted = false): void {
    const verdict = decideVerdict(this.votes.values());
    const deltas: Record<string, number> = {};
    const add = (id: string, d: number) => (deltas[id] = (deltas[id] ?? 0) + d);
    if (!aborted) {
      for (const [id, role] of Object.entries(this.roles)) {
        if (role === 'prosecutor' && verdict === 'guilty') add(id, TRIAL_POINTS.advocateWin);
        if (role === 'defense' && verdict === 'innocent') add(id, TRIAL_POINTS.advocateWin);
        if (role === 'defendant' && verdict === 'innocent') add(id, TRIAL_POINTS.defendantAcquitted);
      }
      for (const [id, vote] of this.votes) {
        if (vote !== this.truth) continue;
        add(id, this.roles[id] === 'witness' ? TRIAL_POINTS.witnessCorrect : TRIAL_POINTS.voterCorrect);
      }
      for (const [id, d] of Object.entries(deltas)) this.addScore(id, d);
    }
    let guilty = 0;
    let innocent = 0;
    for (const v of this.votes.values()) v === 'guilty' ? guilty++ : innocent++;
    const tieNote = !aborted && guilty === innocent ? '同数のため「疑わしきは罰せず」で無罪です' : null;
    this.result = {
      verdict,
      truth: this.truth,
      truthText: this.current?.truthText ?? '',
      votes: Object.fromEntries(this.votes),
      cards: this.current?.cards ?? {},
      deltas,
      note: note ?? tieNote,
      aborted,
    };
    this.setPhase('VERDICT', {
      onEnd: () => (this.round >= this.totalRounds ? this.endGame() : this.startRound(this.round + 1)),
    });
  }

  protected onAction(playerId: string, action: GameAction): void {
    switch (action.type) {
      case 'ready': {
        this.requirePhase('BRIEFING');
        this.requireActive(playerId);
        this.ready.add(playerId);
        this.checkComplete();
        return;
      }
      case 'speak': {
        this.requirePhase('TESTIMONY');
        if (this.turns.current !== playerId) throw new UserError('今はあなたの番ではありません');
        this.turns.record(playerId, cleanText(action.text, LIMITS.statementLength));
        this.advance();
        return;
      }
      case 'vote': {
        this.requirePhase('VOTE');
        this.requireActive(playerId);
        if (this.roles[playerId] === 'defendant') throw new UserError('被告は投票できません');
        if (!this.roles[playerId]) throw new UserError('このラウンドには参加していません');
        const verdict = action.verdict;
        if (verdict !== 'guilty' && verdict !== 'innocent') throw new UserError('有罪か無罪を選んでください');
        this.votes.set(playerId, verdict);
        this.checkComplete();
        return;
      }
      default:
        throw new UserError('不明な操作です');
    }
  }

  protected checkComplete(): void {
    if (this.phase === 'BRIEFING' && pendingPlayers(this.active, this.ready).length === 0) this.advance();
    else if (this.phase === 'VOTE' && pendingPlayers(this.voters, this.votes.keys()).length === 0) this.advance();
  }

  protected override onLeave(playerId: string): void {
    this.votes.delete(playerId);
    const inTrial = ['BRIEFING', 'TESTIMONY', 'VOTE'].includes(this.phase);
    if (inTrial && playerId === this.defendantId) {
      this.resolve('被告が退廷したため、この裁判は中止になりました', true);
      return;
    }
    if (this.phase === 'TESTIMONY' && this.turns.current === playerId) {
      this.advance();
      return;
    }
    this.checkComplete();
  }

  private goalFor(role: TrialRole): string {
    switch (role) {
      case 'defendant':
        return this.truth === 'guilty'
          ? `あなたは本当にやりました…。バレないように無罪を勝ち取りましょう！（無罪判決で +${TRIAL_POINTS.defendantAcquitted}点）`
          : `あなたは無実です！無罪を勝ち取りましょう。（無罪判決で +${TRIAL_POINTS.defendantAcquitted}点）`;
      case 'prosecutor':
        return `被告を有罪にしよう！（有罪判決で +${TRIAL_POINTS.advocateWin}点・真実に投票で +${TRIAL_POINTS.voterCorrect}点）`;
      case 'defense':
        return `被告を無罪にしよう！（無罪判決で +${TRIAL_POINTS.advocateWin}点・真実に投票で +${TRIAL_POINTS.voterCorrect}点）`;
      case 'witness':
        return `証拠をもとに証言しよう。真実を見抜いて投票すると +${TRIAL_POINTS.witnessCorrect}点`;
    }
  }

  getView(playerId: string): TrialView {
    const inCase = this.phase !== 'START' && this.phase !== 'GAME_OVER';
    const myRole = inCase ? (this.roles[playerId] ?? null) : null;
    const secretVisible = inCase && this.phase !== 'VERDICT';
    return {
      ...this.baseView(playerId),
      gameId: 'ten-sec-trial',
      phase: this.phase,
      caseInfo: inCase ? (this.current?.info ?? null) : null,
      roles: inCase ? this.roles : {},
      myRole,
      myGoal: myRole ? this.goalFor(myRole) : null,
      myCards: secretVisible ? (this.current?.cards[playerId] ?? []) : [],
      ready: [...this.ready],
      order: this.phase === 'TESTIMONY' || this.phase === 'VOTE' ? this.turns.order : [],
      turnIndex: this.turns.index,
      statements: inCase ? this.turns.statements : [],
      voted: [...this.votes.keys()],
      myVote: this.votes.get(playerId) ?? null,
      canVote: this.phase === 'VOTE' && this.isActive(playerId) && !!myRole && myRole !== 'defendant',
      result: this.phase === 'VERDICT' ? this.result : null,
    };
  }
}
