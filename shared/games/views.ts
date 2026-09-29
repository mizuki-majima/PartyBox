/**
 * 各ゲームのビュー型（サーバーが生成し、クライアントが描画する）
 * 秘匿すべき情報は、サーバー側でプレイヤーごとに除去してから送信される。
 */
import type { GameViewBase } from '../protocol';

/* ------------------------------------------------------------------ */
/* 全員一致を目指せ！                                                   */
/* ------------------------------------------------------------------ */
export type UnanimousPhase = 'START' | 'ROUND_INTRO' | 'ANSWER' | 'REVEAL' | 'GAME_OVER';

export interface UnanimousGroup {
  key: string;
  label: string;
  /** 表記ゆれを含む、実際に入力された答え */
  variants: string[];
  playerIds: string[];
  points: number;
}

export interface UnanimousRoundResult {
  round: number;
  question: string;
  groups: UnanimousGroup[];
  noAnswer: string[];
  roundScore: number;
  unanimous: boolean;
}

export interface UnanimousView extends GameViewBase {
  gameId: 'unanimous';
  phase: UnanimousPhase;
  question: string | null;
  submitted: string[];
  myAnswer: string | null;
  result: UnanimousRoundResult | null;
  teamScore: number;
  maxScore: number;
  history: { round: number; question: string; roundScore: number; unanimous: boolean }[];
  /** 他の人と答えが揃った回数 */
  matchCounts: Record<string, number>;
  pointTable: { size: string; points: number }[];
}

/* ------------------------------------------------------------------ */
/* 誰の答えでしょう？                                                   */
/* ------------------------------------------------------------------ */
export type WhosePhase = 'START' | 'ROUND_INTRO' | 'ANSWER' | 'GUESS' | 'RESULT' | 'GAME_OVER';

export interface WhoseAnswerCard {
  id: string;
  text: string;
  mine: boolean;
}

export interface WhoseResultEntry {
  id: string;
  text: string;
  authorId: string;
  /** guesserId -> 推理した playerId */
  guesses: Record<string, string>;
  correctGuessers: string[];
}

export interface WhoseView extends GameViewBase {
  gameId: 'whose-answer';
  phase: WhosePhase;
  question: string | null;
  /** ANSWER: 回答済み / GUESS: 推理確定済み のプレイヤー */
  submitted: string[];
  myAnswer: string | null;
  answers: WhoseAnswerCard[] | null;
  /** 推理候補（自分以外の回答者） */
  candidates: string[];
  myGuesses: Record<string, string>;
  locked: boolean;
  result: { entries: WhoseResultEntry[]; deltas: Record<string, number>; note: string | null } | null;
}

/* ------------------------------------------------------------------ */
/* 嘘つきは誰だ？                                                       */
/* ------------------------------------------------------------------ */
export type LiarPhase = 'START' | 'ROLE' | 'TALK' | 'VOTE' | 'LIAR_GUESS' | 'RESULT' | 'GAME_OVER';
export type LiarMode = 'secret' | 'wordwolf';

export interface Statement {
  playerId: string;
  text: string;
}

export interface LiarResult {
  liarId: string;
  topic: string;
  liarTopic: string | null;
  votes: Record<string, string>;
  voteCounts: Record<string, number>;
  caught: boolean;
  liarGuess: string | null;
  liarGuessCorrect: boolean | null;
  deltas: Record<string, number>;
  note: string | null;
}

export interface LiarView extends GameViewBase {
  gameId: 'liar';
  phase: LiarPhase;
  mode: LiarMode;
  /** secret モードで自分が嘘つきなら true。ワードウルフでは常に null（本人も知らない） */
  amLiar: boolean | null;
  myTopic: string | null;
  ready: string[];
  order: string[];
  turnIndex: number;
  statements: Statement[];
  voted: string[];
  myVote: string | null;
  /** LIAR_GUESS フェーズで提示されるお題の選択肢 */
  guessChoices: string[] | null;
  /** LIAR_GUESS 中に誰が推理しているか（見破られた嘘つき） */
  guesserId: string | null;
  result: LiarResult | null;
}

/* ------------------------------------------------------------------ */
/* 回答を育てろ                                                         */
/* ------------------------------------------------------------------ */
export type GrowPhase = 'START' | 'WRITE' | 'DRAW' | 'DESCRIBE' | 'ALBUM' | 'GAME_OVER';

export interface GrowEntry {
  kind: 'prompt' | 'drawing' | 'text';
  /** 最初のお題が自動配布の場合 null */
  playerId: string | null;
  text: string | null;
  imageUrl: string | null;
  /** 時間切れ・退出などで空の場合 */
  empty: boolean;
}

export interface GrowTask {
  kind: 'write' | 'draw' | 'describe';
  /** 描く/説明する元ネタ（write の場合は null） */
  source: GrowEntry | null;
}

export interface GrowAlbum {
  ownerId: string;
  entries: GrowEntry[];
}

export interface GrowView extends GameViewBase {
  gameId: 'grow-answer';
  phase: GrowPhase;
  step: number;
  totalSteps: number;
  task: GrowTask | null;
  submitted: string[];
  mySubmitted: boolean;
  /** ALBUM では公開済みのものまで、GAME_OVER では全部 */
  albums: GrowAlbum[] | null;
  albumIndex: number;
  albumCount: number;
}

/* ------------------------------------------------------------------ */
/* 10秒裁判                                                             */
/* ------------------------------------------------------------------ */
export type TrialPhase = 'START' | 'BRIEFING' | 'TESTIMONY' | 'VOTE' | 'VERDICT' | 'GAME_OVER';
export type TrialRole = 'defendant' | 'prosecutor' | 'defense' | 'witness';
export type Verdict = 'guilty' | 'innocent';

export interface TrialCase {
  title: string;
  summary: string;
  question: string;
}

export interface TrialResult {
  verdict: Verdict;
  truth: Verdict;
  truthText: string;
  votes: Record<string, Verdict>;
  cards: Record<string, string[]>;
  deltas: Record<string, number>;
  note: string | null;
  /** 被告の退出などで裁判が中止になった */
  aborted: boolean;
}

export interface TrialView extends GameViewBase {
  gameId: 'ten-sec-trial';
  phase: TrialPhase;
  caseInfo: TrialCase | null;
  /** 役職は公開情報 */
  roles: Record<string, TrialRole>;
  myRole: TrialRole | null;
  myGoal: string | null;
  myCards: string[];
  ready: string[];
  order: string[];
  turnIndex: number;
  statements: Statement[];
  voted: string[];
  myVote: Verdict | null;
  canVote: boolean;
  result: TrialResult | null;
}

export type AnyGameView = UnanimousView | WhoseView | LiarView | GrowView | TrialView;
