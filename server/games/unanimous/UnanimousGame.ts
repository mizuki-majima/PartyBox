import type { GameSettings } from '../../../shared/games';
import type { UnanimousGroup, UnanimousPhase, UnanimousRoundResult, UnanimousView } from '../../../shared/games/views';
import { type GameAction, LIMITS } from '../../../shared/protocol';
import data from '../../data/unanimous.json';
import { cleanText, normalizeAnswer } from '../../utils/text';
import { BaseGame, pendingPlayers } from '../BaseGame';
import { type GameContext, UserError } from '../types';

/**
 * 揃った人数に応じたチーム得点
 *   2人 → 1点, 3人 → 3点, 4人 → 5点, 5人 → 7点 …（2n − 3）
 *   全員一致（3人以上）→ 10点（6人以上は 通常点 + 3 で人数に応じて増える）
 */
export function unanimousPoints(size: number, total: number): number {
  if (size < 2) return 0;
  const base = 2 * size - 3;
  if (size === total && total >= 3) return Math.max(10, base + 3);
  return base;
}

/** 回答をグループ化して得点を計算する（純粋関数・テスト対象） */
export function groupAnswers(
  answers: { playerId: string; text: string }[],
  totalPlayers: number,
  resolveKey: (key: string) => string = (k) => k,
): UnanimousGroup[] {
  const map = new Map<string, { variants: string[]; playerIds: string[] }>();
  for (const { playerId, text } of answers) {
    const key = resolveKey(normalizeAnswer(text));
    const g = map.get(key) ?? { variants: [], playerIds: [] };
    g.variants.push(text);
    g.playerIds.push(playerId);
    map.set(key, g);
  }
  const groups: UnanimousGroup[] = [...map.entries()].map(([key, g]) => ({
    key,
    label: mostCommon(g.variants),
    variants: [...new Set(g.variants)],
    playerIds: g.playerIds,
    points: unanimousPoints(g.playerIds.length, totalPlayers),
  }));
  groups.sort((a, b) => b.playerIds.length - a.playerIds.length || a.label.localeCompare(b.label, 'ja'));
  return groups;
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export class UnanimousGame extends BaseGame<UnanimousPhase> {
  readonly gameId = 'unanimous' as const;

  private readonly questions: string[];
  private readonly answerTime: number;
  private answers = new Map<string, string>();
  /** 表記ゆれの手動統合（キー → 統合先キー）。ラウンドごとにリセット */
  private merges = new Map<string, string>();
  private result: UnanimousRoundResult | null = null;
  private teamScore = 0;
  private readonly maxScore: number;
  private history: UnanimousView['history'] = [];
  private matchCounts: Record<string, number> = {};

  constructor(ctx: GameContext, participants: string[], settings: GameSettings) {
    super(ctx, participants, settings);
    this.totalRounds = Number(settings.rounds);
    this.answerTime = Number(settings.answerTime) * 1000;
    this.questions = ctx.drawFromDeck('unanimous', data.prompts, this.totalRounds);
    this.maxScore = this.totalRounds * unanimousPoints(participants.length, participants.length);
    for (const id of participants) this.matchCounts[id] = 0;
  }

  protected beginGame(): void {
    this.startRound(1);
  }

  private get question(): string | null {
    return this.round > 0 ? (this.questions[(this.round - 1) % this.questions.length] ?? null) : null;
  }

  private startRound(round: number): void {
    this.round = round;
    this.answers.clear();
    this.merges.clear();
    this.result = null;
    this.setPhase('ROUND_INTRO', { duration: 3000, onEnd: () => this.startAnswer() });
  }

  private startAnswer(): void {
    this.setPhase('ANSWER', { duration: this.answerTime, grace: 1500, onEnd: () => this.reveal() });
  }

  private computeResult(): UnanimousRoundResult {
    const active = this.active;
    const answers = active.filter((id) => this.answers.has(id)).map((id) => ({ playerId: id, text: this.answers.get(id)! }));
    const groups = groupAnswers(answers, active.length, (k) => this.resolveMerge(k));
    return {
      round: this.round,
      question: this.question ?? '',
      groups,
      noAnswer: active.filter((id) => !this.answers.has(id)),
      roundScore: groups.reduce((sum, g) => sum + g.points, 0),
      unanimous: active.length >= 3 && groups.length === 1 && groups[0].playerIds.length === active.length,
    };
  }

  private resolveMerge(key: string): string {
    let k = key;
    for (let i = 0; i < 20 && this.merges.has(k); i++) k = this.merges.get(k)!;
    return k;
  }

  private reveal(): void {
    this.result = this.computeResult();
    this.setPhase('REVEAL', { onEnd: () => this.finishRound() });
  }

  /** REVEAL 中はホストが表記ゆれを統合できるため、得点の確定はラウンド終了時 */
  private commitRound(): void {
    if (!this.result) return;
    const r = this.result;
    this.teamScore += r.roundScore;
    this.history.push({ round: r.round, question: r.question, roundScore: r.roundScore, unanimous: r.unanimous });
    for (const g of r.groups) {
      if (g.playerIds.length < 2) continue;
      for (const id of g.playerIds) {
        this.matchCounts[id] = (this.matchCounts[id] ?? 0) + 1;
        this.addScore(id, 1);
      }
    }
    this.result = null;
  }

  private finishRound(): void {
    this.commitRound();
    if (this.round >= this.totalRounds) this.endGame();
    else this.startRound(this.round + 1);
  }

  protected override endGame(reason: string | null = null): void {
    this.commitRound();
    super.endGame(reason);
  }

  protected onAction(playerId: string, action: GameAction, isHost: boolean): void {
    switch (action.type) {
      case 'answer': {
        this.requirePhase('ANSWER');
        this.requireActive(playerId);
        const text = cleanText(action.text, LIMITS.answerLength);
        if (!text) throw new UserError('回答を入力してください');
        this.answers.set(playerId, text);
        this.checkComplete();
        return;
      }
      case 'merge': {
        this.requirePhase('REVEAL');
        if (!isHost) throw new UserError('ホストのみ操作できます');
        const keys = Array.isArray(action.keys) ? action.keys.filter((k): k is string => typeof k === 'string') : [];
        const valid = new Set(this.result?.groups.map((g) => g.key));
        const targets = [...new Set(keys)].filter((k) => valid.has(k));
        if (targets.length < 2) throw new UserError('まとめる答えを2つ以上選んでください');
        const [root, ...rest] = targets;
        for (const k of rest) this.merges.set(k, root);
        this.result = this.computeResult();
        return;
      }
      case 'unmerge': {
        this.requirePhase('REVEAL');
        if (!isHost) throw new UserError('ホストのみ操作できます');
        this.merges.clear();
        this.result = this.computeResult();
        return;
      }
      default:
        throw new UserError('不明な操作です');
    }
  }

  protected checkComplete(): void {
    if (this.phase === 'ANSWER' && pendingPlayers(this.active, this.answers.keys()).length === 0) this.advance();
  }

  getView(playerId: string): UnanimousView {
    const n = this.participants.length;
    const pointTable: UnanimousView['pointTable'] = [];
    for (let s = 2; s < n; s++) pointTable.push({ size: `${s}人`, points: unanimousPoints(s, n) });
    pointTable.push({ size: '全員', points: unanimousPoints(n, n) });

    const showQuestion = this.phase !== 'START' && this.phase !== 'GAME_OVER';
    return {
      ...this.baseView(playerId),
      gameId: 'unanimous',
      phase: this.phase,
      question: showQuestion ? this.question : null,
      submitted: this.phase === 'ANSWER' ? [...this.answers.keys()] : [],
      myAnswer: this.answers.get(playerId) ?? null,
      result: this.phase === 'REVEAL' ? this.result : null,
      teamScore: this.teamScore,
      maxScore: this.maxScore,
      history: this.history,
      matchCounts: this.matchCounts,
      pointTable,
    };
  }
}
