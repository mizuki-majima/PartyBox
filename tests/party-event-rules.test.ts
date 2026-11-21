import { describe, expect, it } from 'vitest';
import type { BingoConfig, QuizConfig, SeatsConfig } from '../server/event/config';
import * as bingo from '../server/games/party-event/bingo';
import { cardCells, judgeCard, labelOf, normalizeCardId } from '../server/games/party-event/cards';
import * as quiz from '../server/games/party-event/quiz';
import * as seats from '../server/games/party-event/seats';

/* ================================================================== */
describe('ビンゴのカード', () => {
  /**
   * 移植元（party-app-aws）で同じ種・同じIDから作った値。
   * ここが変わると、過去に配ったカードIDが別のカードになってしまう。
   */
  const GOLDEN: Record<string, number[]> = {
    AB23: [12, 21, 35, 58, 61, 8, 16, 42, 56, 73, 14, 19, 0, 47, 63, 3, 30, 31, 52, 70, 10, 18, 39, 49, 68],
    ZZZZ: [14, 28, 43, 55, 69, 1, 25, 39, 57, 71, 15, 16, 0, 56, 64, 9, 17, 37, 54, 74, 12, 19, 36, 58, 66],
    K7M9: [5, 24, 42, 56, 75, 10, 28, 39, 49, 62, 8, 29, 0, 47, 64, 14, 25, 37, 57, 61, 7, 20, 32, 46, 66],
  };

  it('移植元と同じカードを作る', () => {
    for (const [cardId, cells] of Object.entries(GOLDEN)) {
      expect(cardCells('party', cardId)).toEqual(cells);
    }
  });

  it('列ごとの数の範囲が正しく、まん中は FREE', () => {
    const cells = cardCells('party', 'AB23');
    expect(cells[12]).toBe(0);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const n = cells[r * 5 + c];
        if (n === 0) continue;
        expect(n).toBeGreaterThanOrEqual(c * 15 + 1);
        expect(n).toBeLessThanOrEqual(c * 15 + 15);
      }
    }
    expect(new Set(cells.filter((n) => n !== 0)).size).toBe(24); // 重複なし
  });

  it('呼ばれた番号だけで判定する', () => {
    const cells = cardCells('party', 'AB23');
    const firstRow = cells.slice(0, 5);
    expect(judgeCard(cells, []).bingo).toBe(false);
    expect(judgeCard(cells, firstRow).bingo).toBe(true);
    expect(judgeCard(cells, firstRow.slice(0, 4)).reach).toBeGreaterThan(0);
  });

  it('カードIDの正規化とラベル', () => {
    expect(normalizeCardId(' ab-23 ')).toBe('AB23');
    expect(normalizeCardId('abcdefgh')).toBe('ABCD');
    expect(labelOf(1)).toBe('B 1');
    expect(labelOf(75)).toBe('O 75');
  });
});

/* ================================================================== */
describe('ビンゴの進行', () => {
  const cfg: BingoConfig = { title: 'ビンゴ', seed: 'party', winnersCount: 2, prizes: ['景品A', '景品B'] };

  it('75個引いたら終わり、戻すと引き直せる', () => {
    const s = bingo.emptyBingo();
    for (let i = 0; i < 75; i++) expect(bingo.draw(s)).not.toBeNull();
    expect(bingo.draw(s)).toBeNull();
    expect(new Set(s.called).size).toBe(75); // 同じ番号は出ない
    bingo.undoDraw(s);
    expect(bingo.draw(s)).not.toBeNull();
  });

  it('カードは1人1枚で、何度呼んでも同じものが返る', () => {
    const s = bingo.emptyBingo();
    const a = bingo.ensureCard(s, 'p1');
    expect(bingo.ensureCard(s, 'p1')).toBe(a);
    expect(bingo.ensureCard(s, 'p2')).not.toBe(a);
  });

  it('揃っていない「ビンゴ！」は受け付けない', () => {
    const s = bingo.emptyBingo();
    const res = bingo.claim(s, cfg, 'AB23', 'みずき');
    expect(res.rejected).toBe(true);
    expect(s.claims).toHaveLength(0);
  });

  it('揃っていれば順位が付き、2回目は重複になる', () => {
    const s = bingo.emptyBingo();
    s.called = cardCells(cfg.seed, 'AB23').slice(0, 5);
    expect(bingo.claim(s, cfg, 'AB23', 'みずき').rank).toBe(1);
    expect(bingo.claim(s, cfg, 'AB23', 'みずき').duplicated).toBe(true);
    expect(s.claims).toHaveLength(1);
  });

  it('景品は上位の人数ぶんだけ配り、取り消すと引き直しになる', () => {
    const s = bingo.emptyBingo();
    s.called = Array.from({ length: 75 }, (_, i) => i + 1); // 全部呼べば誰でもビンゴ
    for (const id of ['AB23', 'ZZZZ', 'K7M9']) bingo.claim(s, cfg, id, id);
    const prizes = bingo.drawPrizes(s, cfg)!;
    expect(prizes.assigned).toHaveLength(2); // winnersCount
    expect(new Set(prizes.assigned.map((a) => a.prize)).size).toBe(2); // 同じ景品は配らない
    bingo.removeClaim(s, 'AB23');
    expect(s.prizes).toBeNull();
    expect(s.claims).toHaveLength(2);
  });

  it('参加者にはカードIDを出さない', () => {
    const s = bingo.emptyBingo();
    s.called = Array.from({ length: 75 }, (_, i) => i + 1);
    bingo.claim(s, cfg, 'AB23', 'みずき');
    expect(bingo.bingoView(s, cfg, false, null, null).claims[0].cardId).toBeNull();
    expect(bingo.bingoView(s, cfg, true, null, null).claims[0].cardId).toBe('AB23');
  });
});

/* ================================================================== */
describe('座席決め', () => {
  const cfg: SeatsConfig = {
    title: '座席決め',
    participants: [
      ...Array.from({ length: 4 }, (_, i) => ({ name: `あ${i}`, group: 'A社' })),
      ...Array.from({ length: 4 }, (_, i) => ({ name: `い${i}`, group: 'B社' })),
    ],
    tables: [
      { name: 'T1', seats: 4 },
      { name: 'T2', seats: 4 },
    ],
    fillOrder: 'roundRobin',
  };

  it('全員引くと席が決まり、同じ所属が固まらない', () => {
    const s = seats.emptySeats();
    expect(seats.drawAll(s, cfg)).toHaveLength(8);
    expect(seats.drawOne(s, cfg)).toBeNull();

    const view = seats.seatsView(s, cfg, null);
    for (const t of view.tables) {
      expect(t.people).toHaveLength(4);
      const groups = t.people.map((p) => p.group);
      // 4人中、同じ所属は2人ずつに割れる
      expect(groups.filter((g) => g === 'A社')).toHaveLength(2);
    }
    expect(view.remaining).toBe(0);
  });

  it('戻すと引き直せる', () => {
    const s = seats.emptySeats();
    const first = seats.drawOne(s, cfg)!;
    expect(seats.undoDraw(s)).toBe(first.id);
    expect(s.assign[first.id]).toBeUndefined();
    expect(seats.seatsView(s, cfg, null).remaining).toBe(8);
  });

  it('欠席にすると引かれず、戻すと引ける', () => {
    const s = seats.emptySeats();
    seats.markAbsent(s, 'p1', true);
    seats.drawAll(s, cfg);
    expect(s.assign.p1).toBeUndefined();
    seats.markAbsent(s, 'p1', false);
    expect(seats.seatsView(s, cfg, null).remaining).toBe(1);
  });

  it('当日その場で足した人も引かれる', () => {
    const s = seats.emptySeats();
    const extra = seats.addExtra(s, 'とびいり', 'C社');
    expect(extra.id).toBe('x1');
    seats.drawAll(s, cfg);
    expect(s.assign[extra.id]).toBeDefined();
  });

  it('席が足りなければ「席なし」になる', () => {
    const narrow: SeatsConfig = { ...cfg, tables: [{ name: 'T1', seats: 2 }] };
    const s = seats.emptySeats();
    seats.drawAll(s, narrow);
    const view = seats.seatsView(s, narrow, null);
    expect(view.tables[0].people).toHaveLength(2);
    expect(view.noSeat).toHaveLength(6);
  });
});

/* ================================================================== */
describe('クイズ', () => {
  const cfg: QuizConfig = {
    title: 'クイズ',
    secondsPerQuestion: 30,
    teams: ['A', 'B'],
    questions: [
      { question: '選択の問題', choices: ['あ', 'い', 'う'], answer: 1, note: '解説' },
      { question: '自由回答の問題', answer: 'こたえ' },
    ],
  };

  const advanceTo = (s: quiz.QuizState, phase: string) => {
    for (let i = 0; i < 10 && s.phase !== phase; i++) quiz.next(s, cfg);
  };

  it('idle → 問題 → 回答タイム → 答え → 次の問題 → 結果 と進む', () => {
    const s = quiz.emptyQuiz();
    expect(s.phase).toBe('idle');
    quiz.next(s, cfg);
    expect([s.phase, s.qno]).toEqual(['question', 1]);
    quiz.next(s, cfg);
    expect(s.phase).toBe('answering');
    expect(s.deadline).toBeGreaterThan(Date.now());
    quiz.next(s, cfg);
    expect(s.phase).toBe('reveal');
    quiz.next(s, cfg);
    expect([s.phase, s.qno]).toEqual(['question', 2]);
    advanceTo(s, 'result');
    expect(s.phase).toBe('result');
    expect(quiz.next(s, cfg)).toBe(false); // ここから先は無い
  });

  it('戻すと1つ前の段に帰る', () => {
    const s = quiz.emptyQuiz();
    advanceTo(s, 'reveal');
    quiz.prev(s, cfg);
    expect(s.phase).toBe('answering');
    quiz.prev(s, cfg);
    expect(s.phase).toBe('question');
    quiz.prev(s, cfg);
    expect([s.phase, s.qno]).toEqual(['idle', 0]);
  });

  it('答えは reveal まで参加者に送らない（司会には最初から見える）', () => {
    const s = quiz.emptyQuiz();
    advanceTo(s, 'answering');
    expect(quiz.quizView(s, cfg, false, 'A').question?.answer).toBeNull();
    expect(quiz.quizView(s, cfg, false, 'A').question?.note).toBeNull();
    expect(quiz.quizView(s, cfg, true, null).question?.answer).toBe(1);
    quiz.next(s, cfg); // reveal
    expect(quiz.quizView(s, cfg, false, 'A').question?.answer).toBe(1);
    expect(quiz.quizView(s, cfg, false, 'A').question?.note).toBe('解説');
  });

  it('他チームの回答の中身は参加者に送らない（送信済みの印だけ）', () => {
    const s = quiz.emptyQuiz();
    advanceTo(s, 'answering');
    quiz.submitAnswer(s, 'A', { text: 'い', choice: 1, by: 'p1' });
    const guest = quiz.quizView(s, cfg, false, 'B');
    expect(guest.answers).toBeNull();
    expect(guest.answeredTeams).toEqual(['A']);
    expect(quiz.quizView(s, cfg, true, null).answers).toHaveLength(1);
  });

  it('回答タイム以外は受け付けない', () => {
    const s = quiz.emptyQuiz();
    advanceTo(s, 'question');
    expect(quiz.acceptingAnswers(s, 1)).toBe(false);
    quiz.next(s, cfg);
    expect(quiz.acceptingAnswers(s, 1)).toBe(true);
    expect(quiz.acceptingAnswers(s, 2)).toBe(false); // 違う問題への回答
    s.deadline = Date.now() - 3000; // 締切から3秒（猶予2秒）
    expect(quiz.acceptingAnswers(s, 1)).toBe(false);
  });

  it('選択問題は締め切った時点で自動採点される', () => {
    const s = quiz.emptyQuiz();
    advanceTo(s, 'answering');
    quiz.submitAnswer(s, 'A', { text: 'い', choice: 1, by: 'p1' });
    quiz.submitAnswer(s, 'B', { text: 'あ', choice: 0, by: 'p2' });
    quiz.next(s, cfg); // reveal で採点
    expect(quiz.scoresOf(s, cfg)).toEqual({ A: 1, B: 0 });
  });

  it('自由回答は司会が ○ を付けるまで得点にならない', () => {
    const s = quiz.emptyQuiz();
    advanceTo(s, 'answering');
    quiz.next(s, cfg);
    quiz.next(s, cfg); // 第2問（自由回答）
    quiz.next(s, cfg); // answering
    quiz.submitAnswer(s, 'A', { text: 'こたえ', choice: null, by: 'p1' });
    quiz.next(s, cfg); // reveal
    expect(quiz.scoresOf(s, cfg).A).toBe(0);
    quiz.grade(s, 2, 'A', true);
    expect(quiz.scoresOf(s, cfg).A).toBe(1);
  });

  it('同点は同じ順位になる', () => {
    const s = quiz.emptyQuiz();
    quiz.grade(s, 1, 'A', true);
    quiz.grade(s, 1, 'B', true);
    expect(quiz.quizView(s, cfg, false, null).ranking.map((r) => r.rank)).toEqual([1, 1]);
  });
});
