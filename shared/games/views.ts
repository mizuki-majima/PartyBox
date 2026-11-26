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
  /** ホストが表記ゆれを手動でまとめたか */
  merged: boolean;
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

/* ------------------------------------------------------------------ */
/* 懇親会（クイズ・座席決め・ビンゴ）                                   */
/* ------------------------------------------------------------------ */

/** 司会が切り替える、いま全員に出している企画 */
export type EventSection = 'none' | 'quiz' | 'seats' | 'bingo';

export type QuizPhase = 'idle' | 'question' | 'answering' | 'reveal' | 'result';

export interface QuizQuestionView {
  question: string;
  /** 選択肢の問題なら選択肢。自由回答なら null */
  choices: string[] | null;
  /** 答えと解説は reveal 以降か、司会にだけ入る。それ以外は null */
  answer: string | number | null;
  note: string | null;
  /** この問題の点数（正解したチームに足す。既定 1。最後の問題を高くするなど） */
  points: number;
}

/**
 * どのチームが何と答えたか。司会には回答タイムから、参加者には答えの段から（回答タイム中は写せないように送らない）
 */
export interface QuizAnswerRow {
  team: string;
  text: string;
  choice: number | null;
  /** 回答タイム開始からの秒数（司会にだけ。参加者には null） */
  seconds: number | null;
  correct: boolean | null;
}

export interface QuizView {
  title: string;
  teams: string[];
  total: number;
  qno: number;
  phase: QuizPhase;
  deadline: number | null;
  secondsPerQuestion: number;
  question: QuizQuestionView | null;
  /** 送信済みのチーム名（中身は送らない） */
  answeredTeams: string[];
  answers: QuizAnswerRow[] | null;
  scores: Record<string, number>;
  ranking: { team: string; score: number; rank: number }[];
  /** 自分が選んでいるチーム */
  myTeam: string | null;
  myAnswer: { text: string; choice: number | null } | null;
  /** 自分のチームのこの問題の正誤（答えの段から。回答していない・採点前は null） */
  myCorrect: boolean | null;
  /** いまの位置（何問目のどの段か）。司会の「次へ」「戻す」に付けて送り、二度押しで段が飛ぶのを防ぐ */
  position: string;
}

export interface BingoCardView {
  cardId: string;
  /** 25マス。まん中（12）は 0 = FREE */
  cells: number[];
  marked: boolean[];
  lines: number;
  bingo: boolean;
  reach: number;
}

export interface BingoClaim {
  rank: number;
  name: string;
  at: number;
  ok: boolean;
  /** 景品の対象に入っているか */
  inPrize: boolean;
  /** カードIDは司会にだけ */
  cardId: string | null;
}

export interface BingoPrizes {
  assigned: { cardId: string; name: string; prize: string | null }[];
  leftover: string[];
  at: number;
}

export interface BingoView {
  title: string;
  called: number[];
  last: number | null;
  lastLabel: string | null;
  remaining: number;
  winnersCount: number;
  claims: BingoClaim[];
  prizes: BingoPrizes | null;
  prizeList: string[];
  /** 自分のカード。まだ配られていなければ null */
  myCard: BingoCardView | null;
  /** 自分のカードが受付ずみなら、その順位 */
  myRank: number | null;
  /** 司会がカードIDを入れて確かめた結果 */
  inspected: BingoCardView | null;
}

export interface SeatsPerson {
  id: string;
  name: string;
  group: string;
}

export interface SeatsRosterEntry extends SeatsPerson {
  table: number | null;
  absent: boolean;
  /** くじに入る人か（自分で名前を選んだ・司会が足した・司会がくじに入れた） */
  chosen: boolean;
  /** 自分以外の誰かがこの名前を選んでいるか */
  taken: boolean;
}

export interface SeatsTable {
  name: string;
  seats: number;
  people: SeatsPerson[];
}

export interface SeatsView {
  title: string;
  tables: SeatsTable[];
  /** 席が足りずに決まらなかった人 */
  noSeat: SeatsPerson[];
  roster: SeatsRosterEntry[];
  /** 名簿にある所属（参加者が自分の名前を足すときの選択肢） */
  groups: string[];
  /** まだ席が決まっていない、くじに入る人の数 */
  remaining: number;
  drawn: number;
  last: (SeatsPerson & { table: number | null }) | null;
  /** 自分が選んだ名簿上の人 */
  myPersonId: string | null;
}

/** 夕食の席の1人。tone は所属の色（legend の何番目か。名簿に無い名前は null） */
export interface DinnerMemberView {
  name: string;
  tone: number | null;
  /** この画面の人が名簿で選んだ名前か */
  you: boolean;
}

export interface DinnerTeamView {
  name: string;
  members: DinnerMemberView[];
}

export interface DinnerTableView {
  name: string;
  /** このテーブルの人数 */
  count: number;
  teams: DinnerTeamView[];
}

export interface DinnerView {
  title: string;
  tables: DinnerTableView[];
  /** 色の凡例（人数つき） */
  legend: { label: string; tone: number; count: number }[];
  /** 自分の夕食のチーム・テーブル（名簿で名前を選んでいて、席の表に載っていれば） */
  myTeam: string | null;
  myTable: string | null;
}

export interface PartyEventView extends GameViewBase {
  gameId: 'party-event';
  phase: 'EVENT';
  section: EventSection;
  /** この画面を見ている人が司会か（司会用URLを開いているか） */
  isHost: boolean;
  quiz: QuizView;
  bingo: BingoView;
  seats: SeatsView;
  /** 夕食の席（dinner.json が無ければ null） */
  dinner: DinnerView | null;
}

export type AnyGameView = UnanimousView | WhoseView | LiarView | GrowView | TrialView | PartyEventView;
