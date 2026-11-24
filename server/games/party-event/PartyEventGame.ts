/**
 * 懇親会（クイズ・座席決め・ビンゴ）
 *
 * 通常のゲームと違うところ:
 * - フェーズは EVENT ひとつだけ。進行はすべて司会の操作で、時間切れで勝手に進まない
 *   （クイズの回答タイムの締切だけは時刻を配って、締切後の送信を弾く）
 * - 3つの企画がひとつの状態に同居する。司会が section を切り替えても、
 *   引いた番号・決まった席・クイズの進行は消えない
 * - 途中から来た人もその場で参加者になる（観戦者にしない）。数十人が順に入ってくるため
 * - 人数が減ってもゲームを終わらせない
 */
import type { GameId, GameSettings } from '../../../shared/games';
import type { GameAction, GameViewBase } from '../../../shared/protocol';
import type { EventSection, PartyEventView } from '../../../shared/games/views';
import { type EventConfig, getEventConfig } from '../../event/config';
import { BaseGame } from '../BaseGame';
import { type GameContext, UserError } from '../types';
import * as bingo from './bingo';
import * as quiz from './quiz';
import * as seats from './seats';
import { isCardId, normalizeCardId } from './cards';

const SECTIONS: EventSection[] = ['none', 'quiz', 'seats', 'bingo'];

/** 再起動をまたいで残す中身 */
export interface PartyEventSnapshot {
  section: EventSection;
  quiz: quiz.QuizState;
  bingo: bingo.BingoState;
  seats: seats.SeatsState;
}

export class PartyEventGame extends BaseGame<'EVENT'> {
  readonly gameId: GameId = 'party-event';

  private section: EventSection = 'none';
  private readonly cfg: EventConfig;
  private quizState = quiz.emptyQuiz();
  private bingoState = bingo.emptyBingo();
  private seatsState = seats.emptySeats();
  /** 司会がカードIDを入れて確かめた結果（司会の画面にだけ出す） */
  private inspected: string | null = null;

  constructor(ctx: GameContext, participants: string[], settings: GameSettings, config?: EventConfig) {
    super(ctx, participants, settings);
    this.cfg = config ?? getEventConfig();
    this.minActivePlayers = 0; // 人が減っても終わらせない
    for (const id of participants) bingo.ensureCard(this.bingoState, id);
  }

  /* ---------------- ライフサイクル ---------------- */

  /** 開始の演出は挟まず、すぐ司会の進行に入る */
  override start(): void {
    this.setPhase('EVENT');
  }

  protected beginGame(): void {
    this.setPhase('EVENT');
  }

  /** 途中から来た人もその場で参加者にして、カードを配る */
  override onPlayerConnectionChange(playerId: string, connected: boolean): void {
    if (connected && !this.participants.includes(playerId)) {
      this.participants.push(playerId);
      this.scores[playerId] = 0;
    }
    if (connected) bingo.ensureCard(this.bingoState, playerId);
    super.onPlayerConnectionChange(playerId, connected);
  }

  /**
   * 退出・キックされた人。ゲームの参加者としては残す（ビンゴの受付などの記録はそのまま）が、
   * 座席決めで選んでいた名前は空ける（くじに入らないように。戻ってきた本人が選び直せるように）
   */
  override onPlayerLeave(playerId: string): void {
    seats.release(this.seatsState, playerId);
    this.ctx.update();
  }

  /* ---------------- 永続化 ---------------- */

  snapshot(): PartyEventSnapshot {
    return {
      section: this.section,
      quiz: this.quizState,
      bingo: this.bingoState,
      seats: this.seatsState,
    };
  }

  restore(snap: PartyEventSnapshot): void {
    this.section = SECTIONS.includes(snap.section) ? snap.section : 'none';
    this.quizState = { ...quiz.emptyQuiz(), ...snap.quiz };
    this.bingoState = { ...bingo.emptyBingo(), ...snap.bingo };
    this.seatsState = { ...seats.emptySeats(), ...snap.seats };
    // 回答タイムの途中で落ちた場合、締切はもう当てにならないので締め切っておく
    if (this.quizState.phase === 'answering' && this.quizState.deadline && Date.now() > this.quizState.deadline) {
      this.quizState.phase = 'reveal';
      this.quizState.deadline = null;
    }
  }

  /* ---------------- 操作 ---------------- */

  protected onAction(playerId: string, action: GameAction, isHost: boolean): void {
    if (isHost && this.hostAction(action)) return;
    this.guestAction(playerId, action, isHost);
  }

  /** 司会の操作。扱ったら true */
  private hostAction(action: GameAction): boolean {
    switch (action.type) {
      case 'event:section': {
        const section = String(action.section);
        if (!SECTIONS.includes(section as EventSection)) throw new UserError('その企画はありません');
        this.section = section as EventSection;
        this.inspected = null;
        return true;
      }

      /* ---- クイズ ---- */
      case 'quiz:next':
        if (!quiz.next(this.quizState, this.cfg.quiz)) throw new UserError('これ以上は進めません');
        return true;
      case 'quiz:prev':
        if (!quiz.prev(this.quizState, this.cfg.quiz)) throw new UserError('これ以上は戻れません');
        return true;
      case 'quiz:phase':
        if (!quiz.setPhase(this.quizState, String(action.phase))) throw new UserError('その段はありません');
        return true;
      case 'quiz:grade': {
        const team = String(action.team);
        if (!this.cfg.quiz.teams.includes(team)) throw new UserError('そのチームはありません');
        quiz.grade(this.quizState, Number(action.qno) || this.quizState.qno, team, Boolean(action.correct));
        return true;
      }
      case 'quiz:reset':
        quiz.resetQuiz(this.quizState);
        return true;

      /* ---- ビンゴ ---- */
      case 'bingo:draw':
        if (bingo.draw(this.bingoState) === null) throw new UserError('引ける番号がもうありません');
        return true;
      case 'bingo:undo':
        if (bingo.undoDraw(this.bingoState) === null) throw new UserError('戻せる番号がありません');
        return true;
      case 'bingo:inspect': {
        const id = normalizeCardId(action.cardId);
        if (!isCardId(id)) throw new UserError('カードIDは4文字です');
        this.inspected = id;
        return true;
      }
      case 'bingo:removeClaim':
        if (!bingo.removeClaim(this.bingoState, normalizeCardId(action.cardId))) throw new UserError('その記録はありません');
        return true;
      case 'bingo:prizes':
        if (!bingo.drawPrizes(this.bingoState, this.cfg.bingo)) throw new UserError('まだビンゴした人がいません');
        return true;
      case 'bingo:reset':
        bingo.resetBingo(this.bingoState);
        this.inspected = null;
        return true;

      /* ---- 座席決め ---- */
      case 'seats:draw':
        if (!seats.drawOne(this.seatsState, this.cfg.seats)) throw new UserError('引く人がもういません');
        return true;
      case 'seats:drawAll':
        if (!seats.drawAll(this.seatsState, this.cfg.seats).length) throw new UserError('引く人がもういません');
        return true;
      case 'seats:undo':
        if (!seats.undoDraw(this.seatsState)) throw new UserError('戻せる人がいません');
        return true;
      case 'seats:absent':
        seats.markAbsent(this.seatsState, String(action.personId), action.absent !== false);
        return true;
      case 'seats:addExtra':
        seats.addExtra(this.seatsState, String(action.name ?? ''), String(action.group ?? ''));
        return true;
      case 'seats:present': {
        // 自分で名前を選べない人（スマホが無いなど）を、司会がくじに入れる
        const personId = String(action.personId ?? '');
        if (!seats.roster(this.seatsState, this.cfg.seats).some((p) => p.id === personId)) {
          throw new UserError('その名前は名簿にありません');
        }
        seats.markPresent(this.seatsState, personId, action.present !== false);
        return true;
      }
      case 'seats:reset':
        seats.resetSeats(this.seatsState);
        return true;

      default:
        return false;
    }
  }

  /** 参加者の操作 */
  private guestAction(playerId: string, action: GameAction, isHost: boolean): void {
    switch (action.type) {
      case 'quiz:team': {
        const team = String(action.team);
        if (!this.cfg.quiz.teams.includes(team)) throw new UserError('そのチームはありません');
        this.quizState.teamOf[playerId] = team;
        return;
      }
      case 'quiz:answer': {
        const team = this.quizState.teamOf[playerId];
        if (!team) throw new UserError('先にチームを選んでください');
        if (!quiz.acceptingAnswers(this.quizState, Number(action.qno))) throw new UserError('いまは回答できません');
        const question = quiz.currentQuestion(this.quizState, this.cfg.quiz);
        if (!question) throw new UserError('問題がありません');
        if (question.choices) {
          const choice = Number(action.choice);
          if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) {
            throw new UserError('選択肢を選んでください');
          }
          quiz.submitAnswer(this.quizState, team, { text: question.choices[choice], choice, by: playerId });
        } else {
          const text = String(action.text ?? '').trim().slice(0, 100);
          if (!text) throw new UserError('答えを入力してください');
          quiz.submitAnswer(this.quizState, team, { text, choice: null, by: playerId });
        }
        return;
      }
      case 'bingo:claim': {
        const cardId = this.bingoState.cards[playerId];
        if (!cardId) throw new UserError('カードがまだ配られていません');
        const res = bingo.claim(this.bingoState, this.cfg.bingo, cardId, this.ctx.playerName(playerId));
        if (res.rejected) throw new UserError('まだ揃っていません。読み上げられた番号をもう一度確かめてください');
        if (res.duplicated) throw new UserError(`すでに ${res.rank} 番目で受け付けています`);
        return;
      }
      case 'seats:claim':
        // personId が空なら選び直し。takeover は「別のスマホで選ばれているが本人です」と確かめたとき
        seats.claim(this.seatsState, this.cfg.seats, playerId, String(action.personId ?? ''), action.takeover === true);
        return;
      case 'seats:addSelf':
        // 名簿に無い人が、自分の名前を足してくじに入る
        seats.addSelf(this.seatsState, this.cfg.seats, playerId, String(action.name ?? ''), String(action.group ?? ''));
        return;
      default:
        throw new UserError(isHost ? 'その操作はできません' : 'その操作は司会のみです');
    }
  }

  /* ---------------- ビュー ---------------- */

  getView(playerId: string): GameViewBase {
    return this.viewFor(playerId, false);
  }

  /** 司会用URLを開いている人には、答えやカードIDを含むビューを渡す */
  viewFor(playerId: string, isHost: boolean): PartyEventView {
    return {
      ...this.baseView(playerId),
      gameId: 'party-event',
      phase: 'EVENT',
      section: this.section,
      isHost,
      quiz: quiz.quizView(this.quizState, this.cfg.quiz, isHost, this.quizState.teamOf[playerId] ?? null),
      bingo: bingo.bingoView(this.bingoState, this.cfg.bingo, isHost, this.bingoState.cards[playerId] ?? null, this.inspected),
      seats: seats.seatsView(this.seatsState, this.cfg.seats, this.seatsState.claimed[playerId] ?? null),
    };
  }
}
