import type { GameSettings } from '../../../shared/games';
import type { LiarMode, LiarPhase, LiarResult, LiarView } from '../../../shared/games/views';
import { type GameAction, LIMITS } from '../../../shared/protocol';
import data from '../../data/liar.json';
import { pick, pickMany, shuffle } from '../../utils/random';
import { cleanText } from '../../utils/text';
import { BaseGame, pendingPlayers } from '../BaseGame';
import { TurnSequence } from '../TurnSequence';
import { type GameContext, UserError } from '../types';

interface Topic {
  category: string;
  topic: string;
}

const ALL_TOPICS: Topic[] = data.categories.flatMap((c) => c.topics.map((topic) => ({ category: c.name, topic })));
const GUESS_CHOICES = 6;

export const LIAR_POINTS = {
  /** 嘘つきを見破った（最多票が嘘つき）とき、嘘つきに投票した市民 */
  catchLiar: 2,
  /** 見破れなかったが嘘つきに投票していた市民 */
  suspectedLiar: 1,
  /** 嘘つきが逃げ切った */
  liarEscaped: 3,
  /** 見破られた嘘つきがお題を当てた（逆転） */
  liarGuessedTopic: 3,
} as const;

/** 投票を集計して嘘つきが見破られたかを判定（純粋関数・テスト対象） */
export function tallyLiarVotes(votes: Map<string, string>, liarId: string) {
  const counts: Record<string, number> = {};
  for (const target of votes.values()) counts[target] = (counts[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((id) => counts[id] === max);
  // 同票の場合は見破れなかった扱い
  const caught = max > 0 && top.length === 1 && top[0] === liarId;
  return { counts, caught };
}

export class LiarGame extends BaseGame<LiarPhase> {
  readonly gameId = 'liar' as const;
  protected override minActivePlayers = 3;

  private readonly mode: LiarMode;
  private readonly talkTime: number;
  private readonly voteTime: number;
  private readonly topics: Topic[];

  private liarId = '';
  private previousLiar = '';
  private topic: Topic | null = null;
  private liarTopic: string | null = null;
  private guessChoices: string[] = [];
  private ready = new Set<string>();
  private turns = new TurnSequence();
  private votes = new Map<string, string>();
  private liarGuess: string | null = null;
  private result: LiarResult | null = null;

  constructor(ctx: GameContext, participants: string[], settings: GameSettings) {
    super(ctx, participants, settings);
    this.totalRounds = Number(settings.rounds);
    this.talkTime = Number(settings.talkTime) * 1000;
    this.voteTime = Number(settings.voteTime) * 1000;
    this.mode = settings.mode === 'wordwolf' ? 'wordwolf' : 'secret';
    this.topics = ctx.drawFromDeck('liar', ALL_TOPICS, this.totalRounds, (t) => t.topic);
  }

  protected beginGame(): void {
    this.startRound(1);
  }

  private startRound(round: number): void {
    this.round = round;
    const candidates = this.active.filter((id) => id !== this.previousLiar);
    this.liarId = pick(candidates.length > 0 ? candidates : this.active);
    this.previousLiar = this.liarId;
    this.topic = this.topics[(round - 1) % this.topics.length];
    const siblings = ALL_TOPICS.filter((t) => t.category === this.topic!.category && t.topic !== this.topic!.topic);
    this.liarTopic = this.mode === 'wordwolf' ? pick(siblings).topic : null;
    const decoys = pickMany(siblings.map((t) => t.topic), GUESS_CHOICES - 1);
    this.guessChoices = shuffle([this.topic.topic, ...decoys]);
    this.ready.clear();
    this.votes.clear();
    this.liarGuess = null;
    this.result = null;
    this.turns.reset(shuffle(this.active));
    this.setPhase('ROLE', { duration: 15000, onEnd: () => this.nextTurn() });
  }

  private canSpeak = (id: string) => this.isActive(id) && this.ctx.isConnected(id);

  private nextTurn(): void {
    const speaker = this.turns.next(this.canSpeak);
    if (!speaker) {
      this.setPhase('VOTE', { duration: this.voteTime, grace: 500, onEnd: () => this.resolveVote() });
      return;
    }
    this.setPhase('TALK', { duration: this.talkTime, grace: 500, onEnd: () => this.nextTurn() });
  }

  private resolveVote(): void {
    const { caught } = tallyLiarVotes(this.votes, this.liarId);
    if (caught && this.mode === 'secret' && this.isActive(this.liarId)) {
      this.setPhase('LIAR_GUESS', { duration: 25000, grace: 500, onEnd: () => this.finishRound() });
      return;
    }
    this.finishRound();
  }

  private finishRound(note: string | null = null, voided = false): void {
    const { counts, caught } = tallyLiarVotes(this.votes, this.liarId);
    const deltas: Record<string, number> = {};
    const liarGuessCorrect = this.liarGuess === null ? null : this.liarGuess === this.topic?.topic;
    if (!voided) {
      for (const [voter, target] of this.votes) {
        if (voter === this.liarId || target !== this.liarId) continue;
        deltas[voter] = caught ? LIAR_POINTS.catchLiar : LIAR_POINTS.suspectedLiar;
      }
      if (!caught) deltas[this.liarId] = LIAR_POINTS.liarEscaped;
      else if (liarGuessCorrect) deltas[this.liarId] = LIAR_POINTS.liarGuessedTopic;
      for (const [id, d] of Object.entries(deltas)) this.addScore(id, d);
    }
    this.result = {
      liarId: this.liarId,
      topic: this.topic?.topic ?? '',
      liarTopic: this.liarTopic,
      votes: Object.fromEntries(this.votes),
      voteCounts: counts,
      caught: !voided && caught,
      liarGuess: this.liarGuess,
      liarGuessCorrect,
      deltas,
      note,
    };
    this.setPhase('RESULT', {
      onEnd: () => (this.round >= this.totalRounds ? this.endGame() : this.startRound(this.round + 1)),
    });
  }

  protected onAction(playerId: string, action: GameAction): void {
    switch (action.type) {
      case 'ready': {
        this.requirePhase('ROLE');
        this.requireActive(playerId);
        this.ready.add(playerId);
        this.checkComplete();
        return;
      }
      case 'speak': {
        this.requirePhase('TALK');
        if (this.turns.current !== playerId) throw new UserError('今はあなたの番ではありません');
        this.turns.record(playerId, cleanText(action.text, LIMITS.statementLength));
        this.advance();
        return;
      }
      case 'vote': {
        this.requirePhase('VOTE');
        this.requireActive(playerId);
        const target = String(action.targetId ?? '');
        if (target === playerId) throw new UserError('自分には投票できません');
        if (!this.isActive(target)) throw new UserError('そのプレイヤーには投票できません');
        this.votes.set(playerId, target);
        this.checkComplete();
        return;
      }
      case 'guessTopic': {
        this.requirePhase('LIAR_GUESS');
        if (playerId !== this.liarId) throw new UserError('お題を推理できるのは嘘つきだけです');
        const guess = String(action.topic ?? '');
        if (!this.guessChoices.includes(guess)) throw new UserError('選択肢から選んでください');
        this.liarGuess = guess;
        this.advance();
        return;
      }
      default:
        throw new UserError('不明な操作です');
    }
  }

  protected checkComplete(): void {
    if (this.phase === 'ROLE' && pendingPlayers(this.active, this.ready).length === 0) this.advance();
    else if (this.phase === 'VOTE' && pendingPlayers(this.active, this.votes.keys()).length === 0) this.advance();
  }

  protected override onLeave(playerId: string): void {
    this.votes.delete(playerId);
    const inRound = ['ROLE', 'TALK', 'VOTE', 'LIAR_GUESS'].includes(this.phase);
    if (inRound && playerId === this.liarId) {
      this.finishRound('嘘つきが退出したため、このラウンドは無効になりました', true);
      return;
    }
    if (this.phase === 'TALK' && this.turns.current === playerId) {
      this.advance();
      return;
    }
    this.checkComplete();
  }

  getView(playerId: string): LiarView {
    const participant = this.isParticipant(playerId);
    const inRound = ['ROLE', 'TALK', 'VOTE', 'LIAR_GUESS'].includes(this.phase);
    const isLiar = playerId === this.liarId;
    let myTopic: string | null = null;
    if (participant && inRound) {
      if (!isLiar) myTopic = this.topic?.topic ?? null;
      else if (this.mode === 'wordwolf') myTopic = this.liarTopic;
    }
    return {
      ...this.baseView(playerId),
      gameId: 'liar',
      phase: this.phase,
      mode: this.mode,
      amLiar: participant && inRound && this.mode === 'secret' ? isLiar : null,
      myTopic,
      ready: [...this.ready],
      order: inRound ? this.turns.order : [],
      turnIndex: this.turns.index,
      statements: this.turns.statements,
      voted: [...this.votes.keys()],
      myVote: this.votes.get(playerId) ?? null,
      guessChoices: this.phase === 'LIAR_GUESS' ? this.guessChoices : null,
      guesserId: this.phase === 'LIAR_GUESS' ? this.liarId : null,
      result: this.phase === 'RESULT' ? this.result : null,
    };
  }
}
