/**
 * クイズの規則（party-app-aws backend/src/quiz.mjs の移植）
 *
 * 司会が進めた段だけが全員に配られる。
 * **答えと解説は phase が reveal になるまで参加者に送らない**。この性質を壊す変更をしないこと。
 * 回答はチーム単位（同じチームの人は同じ1つの回答を共有する）。
 */
import type { QuizPhase, QuizView } from '../../../shared/games/views';
import type { QuizConfig } from '../../event/config';

const PHASES: QuizPhase[] = ['idle', 'question', 'answering', 'reveal', 'result'];

export interface TeamAnswer {
  text: string;
  choice: number | null;
  at: number;
  /** 最後に送った人（司会の画面にも出さない。記録のみ） */
  by: string;
}

export interface QuizState {
  phase: QuizPhase;
  qno: number;
  startedAt: number | null;
  deadline: number | null;
  /** 問題番号 → チーム名 → 正誤 */
  graded: Record<number, Record<string, boolean>>;
  /** 問題番号 → チーム名 → 回答 */
  answers: Record<number, Record<string, TeamAnswer>>;
  /** プレイヤーID → チーム名 */
  teamOf: Record<string, string>;
}

export function emptyQuiz(): QuizState {
  return { phase: 'idle', qno: 0, startedAt: null, deadline: null, graded: {}, answers: {}, teamOf: {} };
}

/** いまの位置（何問目のどの段か）。司会の操作が古くないかを見分けるのに使う */
export const positionOf = (state: QuizState): string => `${state.qno}:${state.phase}`;

export const currentQuestion = (state: QuizState, cfg: QuizConfig) =>
  state.qno >= 1 ? (cfg.questions[state.qno - 1] ?? null) : null;

/** 回答を受け付けるのは「回答タイム」の間だけ。締切後は2秒だけ猶予して無視する */
export function acceptingAnswers(state: QuizState, qno: number): boolean {
  if (state.phase !== 'answering') return false;
  if (Number(qno) !== Number(state.qno)) return false;
  if (state.deadline && Date.now() > state.deadline + 2000) return false;
  return true;
}

function answersFor(state: QuizState, qno: number): Record<string, TeamAnswer> {
  return state.answers[qno] ?? {};
}

export function submitAnswer(state: QuizState, team: string, answer: Omit<TeamAnswer, 'at'>): void {
  const forQno = { ...answersFor(state, state.qno) };
  forQno[team] = { ...answer, at: Date.now() };
  state.answers = { ...state.answers, [state.qno]: forQno };
}

/** 選択肢の問題は締め切った時点で自動採点する。自由回答は司会が ○ を付ける */
function autoGrade(state: QuizState, cfg: QuizConfig): void {
  const question = currentQuestion(state, cfg);
  if (!question?.choices) return;
  const forQno = { ...(state.graded[state.qno] ?? {}) };
  for (const [team, answer] of Object.entries(answersFor(state, state.qno))) {
    forQno[team] = Number(answer.choice) === Number(question.answer);
  }
  state.graded = { ...state.graded, [state.qno]: forQno };
}

function startAnswering(state: QuizState, cfg: QuizConfig): void {
  state.phase = 'answering';
  state.startedAt = Date.now();
  state.deadline = cfg.secondsPerQuestion > 0 ? Date.now() + cfg.secondsPerQuestion * 1000 : null;
}

/** 問題 → 回答タイム → 答え → 次の問題 … → 結果 */
export function next(state: QuizState, cfg: QuizConfig): boolean {
  const total = cfg.questions.length;
  if (!total) return false;

  if (state.phase === 'idle') {
    state.qno = 1;
    state.phase = 'question';
    state.startedAt = null;
    state.deadline = null;
    return true;
  }
  if (state.phase === 'question') {
    startAnswering(state, cfg);
    return true;
  }
  if (state.phase === 'answering') {
    state.phase = 'reveal';
    state.deadline = null;
    autoGrade(state, cfg);
    return true;
  }
  if (state.phase === 'reveal') {
    if (state.qno < total) {
      state.qno += 1;
      state.phase = 'question';
      state.startedAt = null;
      state.deadline = null;
    } else {
      state.phase = 'result';
    }
    return true;
  }
  return false; // result から先は無い
}

export function prev(state: QuizState, cfg: QuizConfig): boolean {
  if (state.phase === 'result') {
    state.phase = 'reveal';
    return true;
  }
  if (state.phase === 'reveal') {
    startAnswering(state, cfg);
    return true;
  }
  if (state.phase === 'answering') {
    state.phase = 'question';
    state.startedAt = null;
    state.deadline = null;
    return true;
  }
  if (state.phase === 'question') {
    if (state.qno <= 1) {
      state.qno = 0;
      state.phase = 'idle';
    } else {
      state.qno -= 1;
      state.phase = 'reveal';
    }
    return true;
  }
  return false;
}

export function setPhase(state: QuizState, phase: string): boolean {
  if (!PHASES.includes(phase as QuizPhase)) return false;
  state.phase = phase as QuizPhase;
  if (phase !== 'answering') state.deadline = null;
  return true;
}

/** 自由回答に司会が ○ / × を付ける */
export function grade(state: QuizState, qno: number, team: string, correct: boolean): void {
  state.graded = { ...state.graded, [qno]: { ...(state.graded[qno] ?? {}), [team]: correct } };
}

export function resetQuiz(state: QuizState): void {
  state.phase = 'idle';
  state.qno = 0;
  state.startedAt = null;
  state.deadline = null;
  state.graded = {};
  state.answers = {};
  // teamOf は残す（各自が選んだチームはそのまま）
}

/** その問題の点数（省いてあれば 1） */
const pointsOf = (cfg: QuizConfig, qno: number): number => cfg.questions[qno - 1]?.points ?? 1;

export function scoresOf(state: QuizState, cfg: QuizConfig): Record<string, number> {
  const scores: Record<string, number> = Object.fromEntries(cfg.teams.map((team) => [team, 0]));
  for (const [qno, byTeam] of Object.entries(state.graded)) {
    for (const [team, ok] of Object.entries(byTeam)) {
      // 設定に無いチーム（チーム名を変える前の保存に残ったもの）は数えない。会場の順位に、無いチームが出ないように
      if (ok && team in scores) scores[team] += pointsOf(cfg, Number(qno));
    }
  }
  return scores;
}

/**
 * どのチームが何と答えたか。
 * 司会には回答タイムから（何秒で答えたかも。速い順）。参加者には答えの段から（チームの順。秒数は出さない）。
 * 回答タイムの間に参加者へ送ると、ほかのチームの答えを写せてしまうので送らない
 */
function answerRows(state: QuizState, cfg: QuizConfig, isHost: boolean, revealed: boolean): QuizView['answers'] {
  if (!isHost && !revealed) return null;
  const forQno = answersFor(state, state.qno);
  const rows = Object.entries(forQno).map(([team, a]) => ({
    team,
    text: a.text,
    choice: a.choice,
    seconds: isHost && state.startedAt ? Math.max(0, Math.round((a.at - state.startedAt) / 100) / 10) : null,
    correct: state.graded[state.qno]?.[team] ?? null,
  }));
  if (isHost) return rows.sort((a, b) => (a.seconds ?? 0) - (b.seconds ?? 0));
  const order = (team: string) => {
    const i = cfg.teams.indexOf(team);
    return i < 0 ? cfg.teams.length : i;
  };
  return rows.sort((a, b) => order(a.team) - order(b.team));
}

export function quizView(state: QuizState, cfg: QuizConfig, isHost: boolean, teamOfMe: string | null): QuizView {
  // 設定に無いチームは、チーム無しとして見せる（選び直してもらう）
  const myTeam = teamOfMe && cfg.teams.includes(teamOfMe) ? teamOfMe : null;
  const question = currentQuestion(state, cfg);
  const revealed = state.phase === 'reveal' || state.phase === 'result';
  const scores = scoresOf(state, cfg);
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const ranking = sorted.map(([team, score]) => ({
    team,
    score,
    rank: sorted.findIndex((x) => x[1] === score) + 1,
  }));
  const forQno = answersFor(state, state.qno);
  const mine = myTeam ? (forQno[myTeam] ?? null) : null;

  return {
    title: cfg.title,
    teams: [...cfg.teams],
    total: cfg.questions.length,
    qno: state.qno,
    phase: state.phase,
    deadline: state.deadline,
    secondsPerQuestion: cfg.secondsPerQuestion,
    question: question
      ? {
          question: question.question,
          choices: question.choices ?? null,
          // ここが肝心: 答えは reveal 以降か、司会にだけ
          answer: revealed || isHost ? question.answer : null,
          note: revealed || isHost ? (question.note ?? null) : null,
          points: pointsOf(cfg, state.qno),
        }
      : null,
    answeredTeams: Object.keys(forQno),
    answers: answerRows(state, cfg, isHost, revealed),
    scores,
    ranking,
    myTeam,
    myAnswer: mine ? { text: mine.text, choice: mine.choice } : null,
    // 自分のチームの正誤。答えと同じく、答えの段までは送らない（先に送ると答えの手がかりになる）
    myCorrect: revealed && myTeam ? (state.graded[state.qno]?.[myTeam] ?? null) : null,
    position: positionOf(state),
  };
}
