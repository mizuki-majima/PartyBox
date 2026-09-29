import type { GameSettings } from '../../../shared/games';
import type { WhosePhase, WhoseResultEntry, WhoseView } from '../../../shared/games/views';
import { type GameAction, LIMITS } from '../../../shared/protocol';
import data from '../../data/whose-answer.json';
import { generateId, shuffle } from '../../utils/random';
import { cleanText } from '../../utils/text';
import { BaseGame, pendingPlayers } from '../BaseGame';
import { type GameContext, UserError } from '../types';

export const WHOSE_POINTS = {
  /** 他人の回答を正しく当てた */
  correctGuess: 2,
  /** 自分の回答を当てられた（当てた人1人につき） */
  caught: -1,
  /** 自分の回答が最後まで誰にも当てられなかった */
  undetected: 1,
} as const;

interface AnswerRecord {
  id: string;
  authorId: string;
  text: string;
}

/** 推理結果から得点を計算する（純粋関数・テスト対象） */
export function scoreWhoseRound(
  answers: AnswerRecord[],
  guesses: Map<string, Map<string, string>>,
): { entries: WhoseResultEntry[]; deltas: Record<string, number> } {
  const deltas: Record<string, number> = {};
  const add = (id: string, d: number) => (deltas[id] = (deltas[id] ?? 0) + d);
  const entries: WhoseResultEntry[] = answers.map((a) => {
    const entryGuesses: Record<string, string> = {};
    const correct: string[] = [];
    for (const [guesserId, map] of guesses) {
      if (guesserId === a.authorId) continue;
      const guessed = map.get(a.id);
      if (!guessed) continue;
      entryGuesses[guesserId] = guessed;
      if (guessed === a.authorId) correct.push(guesserId);
    }
    for (const g of correct) add(g, WHOSE_POINTS.correctGuess);
    if (correct.length > 0) add(a.authorId, WHOSE_POINTS.caught * correct.length);
    else add(a.authorId, WHOSE_POINTS.undetected);
    return { id: a.id, text: a.text, authorId: a.authorId, guesses: entryGuesses, correctGuessers: correct };
  });
  return { entries, deltas };
}

export class WhoseAnswerGame extends BaseGame<WhosePhase> {
  readonly gameId = 'whose-answer' as const;

  private readonly questions: string[];
  private readonly answerTime: number;
  private readonly guessTime: number;

  private submissions = new Map<string, string>();
  /** GUESS フェーズで表示する匿名化済みの回答（シャッフル済み） */
  private answerList: AnswerRecord[] = [];
  /** guesserId -> (answerId -> 推理した playerId) */
  private guesses = new Map<string, Map<string, string>>();
  private locked = new Set<string>();
  private result: WhoseView['result'] = null;

  constructor(ctx: GameContext, participants: string[], settings: GameSettings) {
    super(ctx, participants, settings);
    this.totalRounds = Number(settings.rounds);
    this.answerTime = Number(settings.answerTime) * 1000;
    this.guessTime = Number(settings.guessTime) * 1000;
    this.questions = ctx.drawFromDeck('whose-answer', data.questions, this.totalRounds);
  }

  private get question(): string | null {
    return this.round > 0 ? (this.questions[(this.round - 1) % this.questions.length] ?? null) : null;
  }

  protected beginGame(): void {
    this.startRound(1);
  }

  private startRound(round: number): void {
    this.round = round;
    this.submissions.clear();
    this.answerList = [];
    this.guesses.clear();
    this.locked.clear();
    this.result = null;
    this.setPhase('ROUND_INTRO', { duration: 3000, onEnd: () => this.startAnswer() });
  }

  private startAnswer(): void {
    this.setPhase('ANSWER', { duration: this.answerTime, grace: 1500, onEnd: () => this.startGuess() });
  }

  private startGuess(): void {
    this.answerList = shuffle(
      this.participants
        .filter((id) => this.submissions.has(id))
        .map((id) => ({ id: generateId(6), authorId: id, text: this.submissions.get(id)! })),
    );
    // 推理できる回答が1つもない場合（回答が1件以下）は結果へ
    if (this.answerList.length < 2) {
      this.showResult('回答が少なかったため、このラウンドは推理なしです');
      return;
    }
    // 自分以外の回答が1つもない人（回答を書かなかった人など）はそのまま確定扱い
    for (const id of this.active) {
      if (this.candidatesFor(id).length === 0) this.locked.add(id);
    }
    this.setPhase('GUESS', { duration: this.guessTime, grace: 1000, onEnd: () => this.showResult() });
    this.checkComplete();
  }

  private candidatesFor(playerId: string): string[] {
    return this.answerList.map((a) => a.authorId).filter((id) => id !== playerId);
  }

  private showResult(note?: string): void {
    const scored = scoreWhoseRound(this.answerList, this.guesses);
    for (const [id, d] of Object.entries(scored.deltas)) this.addScore(id, d);
    this.result = { ...scored, note: note ?? null };
    this.setPhase('RESULT', {
      onEnd: () => (this.round >= this.totalRounds ? this.endGame() : this.startRound(this.round + 1)),
    });
  }

  protected onAction(playerId: string, action: GameAction): void {
    switch (action.type) {
      case 'answer': {
        this.requirePhase('ANSWER');
        this.requireActive(playerId);
        const text = cleanText(action.text, LIMITS.answerLength);
        if (!text) throw new UserError('回答を入力してください');
        this.submissions.set(playerId, text);
        this.checkComplete();
        return;
      }
      case 'guess': {
        this.requirePhase('GUESS');
        this.requireActive(playerId);
        if (this.locked.has(playerId)) throw new UserError('推理は確定済みです');
        const answer = this.answerList.find((a) => a.id === action.answerId);
        if (!answer) throw new UserError('回答が見つかりません');
        // 重要: 自分の回答は選べない
        if (answer.authorId === playerId) throw new UserError('自分の回答は選べません');
        const map = this.guesses.get(playerId) ?? new Map<string, string>();
        if (action.playerId === null) {
          map.delete(answer.id);
        } else {
          const target = String(action.playerId);
          if (!this.candidatesFor(playerId).includes(target)) throw new UserError('そのプレイヤーは選べません');
          map.set(answer.id, target);
        }
        this.guesses.set(playerId, map);
        return;
      }
      case 'lock': {
        this.requirePhase('GUESS');
        this.requireActive(playerId);
        this.locked.add(playerId);
        this.checkComplete();
        return;
      }
      case 'unlock': {
        this.requirePhase('GUESS');
        this.locked.delete(playerId);
        return;
      }
      default:
        throw new UserError('不明な操作です');
    }
  }

  protected checkComplete(): void {
    if (this.phase === 'ANSWER' && pendingPlayers(this.active, this.submissions.keys()).length === 0) this.advance();
    else if (this.phase === 'GUESS' && pendingPlayers(this.active, this.locked).length === 0) this.advance();
  }

  getView(playerId: string): WhoseView {
    const inQuestion = this.phase !== 'START' && this.phase !== 'GAME_OVER';
    const showAnswers = this.phase === 'GUESS';
    return {
      ...this.baseView(playerId),
      gameId: 'whose-answer',
      phase: this.phase,
      question: inQuestion ? this.question : null,
      submitted:
        this.phase === 'ANSWER' ? [...this.submissions.keys()] : this.phase === 'GUESS' ? [...this.locked] : [],
      myAnswer: this.submissions.get(playerId) ?? null,
      // 作者IDは送らない（自分の回答かどうかだけ）
      answers: showAnswers
        ? this.answerList.map((a) => ({ id: a.id, text: a.text, mine: a.authorId === playerId }))
        : null,
      candidates: showAnswers ? this.candidatesFor(playerId) : [],
      myGuesses: Object.fromEntries(this.guesses.get(playerId) ?? []),
      locked: this.locked.has(playerId),
      result: this.phase === 'RESULT' ? this.result : null,
    };
  }
}
