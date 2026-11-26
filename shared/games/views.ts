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
  /** 何周目の発言か（何周も話すゲームだけ） */
  lap?: number;
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
  /** いま何周目か（1 始まり）と、1つのお題で何周話すか */
  lap: number;
  laps: number;
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
  /** 答えと解説は reveal 以降か、司会にだけ入る。それ以外は null（答えを書いていない問題も null） */
  answer: string | number | null;
  note: string | null;
  /** 司会が ○ を付ける問題か（自由回答と、答えを書いていない問題）。false なら締め切りで自動採点 */
  hostGraded: boolean;
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

export type AnyGameView = UnanimousView | WhoseView | LiarView | GrowView | TrialView | AdDodgeView | PartyEventView;

/* ------------------------------------------------------------------ */
/* 広告をすり抜けろ！                                                   */
/* ------------------------------------------------------------------ */
/*
 * ページの中身は、論理座標（幅 AD_STAGE_W × 高さ AD_STAGE_H）で表す。スマホの画面の大きさに合わせて拡大・縮小して描く。
 * スマホに送るのは「見た目」（AdElement）だけ。どこを押せば進めるか（当たり判定）はサーバーだけが持つ
 */
export const AD_STAGE_W = 360;
export const AD_STAGE_H = 560;

export type AdDodgePhase = 'START' | 'ROUND_INTRO' | 'RACE' | 'RESULT' | 'GAME_OVER';

/** 罠の種類（1ページに1つ） */
export type AdTrapKind =
  | 'tiny-x'
  | 'fake-x'
  | 'big-next'
  | 'shift'
  | 'escape'
  | 'countdown'
  | 'shame'
  | 'virus'
  | 'chain'
  | 'cookie'
  | 'misregister';

/** 描くものの形。中身の文言は label / sub / cta に入る */
export type AdShape =
  /** 全面・大きめの広告（variant で配色が変わる） */
  | 'sheet'
  /** 横長の広告 */
  | 'banner'
  /** 閉じる印（tone: faint = 薄い, drawn = 広告の絵の一部, plain = 灰色の小さい印, red = 赤い丸） */
  | 'x'
  /** ボタン（tone: loud = 派手, plain = 灰色の立体ボタン） */
  | 'btn'
  /** 文字のリンク（tone: article = 記事の中の青いリンク, muted = 灰色の小さな文字） */
  | 'link'
  /** ただの文字（countdownTo があれば残り秒数を出す） */
  | 'text'
  /** 動画の広告 */
  | 'video'
  /** 偽の警告（OS の警告の窓のような見た目） */
  | 'alert'
  /** 確認の窓 */
  | 'dialog'
  /** 設定の一覧（スイッチが並ぶ） */
  | 'toggles'
  /** 判定ずれの本当の位置（薄い点線の枠） */
  | 'ghost'
  /** 広告を押したあとに開くページ */
  | 'landing';

export interface AdElement {
  id: string;
  shape: AdShape;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  sub?: string;
  cta?: string;
  tone?: string;
  variant?: number;
  /** この段が始まってから出てくるまで（ms） */
  from?: number;
  /** この段が始まってから消えるまで（ms） */
  until?: number;
  /** at（ms）の時点で dx, dy だけ動く（割り込み広告でボタンがずれる） */
  shift?: { at: number; dx: number; dy: number };
  /** 残り秒数を出すときの終わり（この段が始まってからの ms） */
  countdownTo?: number;
}

/** いま自分が見ているページの1段 */
export interface AdStageView {
  /** 何ページ目か（0 始まり） */
  page: number;
  /** そのページの何段目か（0 始まり。閉じても次が出る広告などは段が複数ある） */
  step: number;
  kind: AdTrapKind;
  site: string;
  headline: string;
  /** この段が始まった時刻（サーバー時刻）。見た目の時間の動きはここからの経過で決まる */
  startedAt: number;
  els: AdElement[];
}

/** 広告を押してしまったときのページ */
export interface AdPenaltyView {
  /** 押し直しを見分ける番号（戻る前の二度押しを、ページの操作と取り違えないため） */
  id: number;
  startedAt: number;
  /** これより前は戻れない（サーバー時刻） */
  until: number;
  trap: AdTrapKind;
  els: AdElement[];
}

export interface AdRacer {
  id: string;
  /** 進んだページ数 */
  cleared: number;
  /** ゴールまでの時間（ms）。まだなら null */
  finishedMs: number | null;
  /** 広告を押した回数 */
  traps: number;
}

export interface AdRoundRow extends AdRacer {
  /** そのラウンドの順位（ゴールした順。ゴールできなかった人は進んだページの多い順） */
  rank: number;
  points: number;
}

export interface AdTrapStat {
  kind: AdTrapKind;
  label: string;
  /** 見分け方 */
  tip: string;
  count: number;
}

export interface AdRoundResult {
  round: number;
  rows: AdRoundRow[];
  /** そのラウンドのページの罠（順番どおり） */
  pages: { kind: AdTrapKind; label: string; tip: string }[];
  /** いちばん多く押された罠（誰も押さなければ null） */
  worstTrap: AdTrapStat | null;
}

export interface AdDodgeView extends GameViewBase {
  gameId: 'ad-dodge';
  phase: AdDodgePhase;
  pages: number;
  /** レースの始まった時刻（サーバー時刻） */
  raceStartedAt: number | null;
  racers: AdRacer[];
  /** 自分のいまのページ（レース中で、まだゴールしていない参加者だけ） */
  stage: AdStageView | null;
  /** 広告を押してしまっているとき */
  penalty: AdPenaltyView | null;
  /** 自分がこのラウンドで押してしまった罠 */
  myTraps: AdTrapStat[];
  roundResult: AdRoundResult | null;
  /** これまでのラウンドの1位 */
  history: { round: number; winnerId: string | null; ms: number | null }[];
  /**
   * 通しの試験（E2E）のときだけ: いま押せば進める場所の真ん中（論理座標）。本番では常に null
   * （サーバーを PARTYBOX_AD_DODGE_REVEAL=1 で起動したときだけ入る）。at はそこが押せるようになる時刻（サーバー時刻）
   */
  debugTarget: { x: number; y: number; at: number; trap?: { x: number; y: number } | null } | null;
}
