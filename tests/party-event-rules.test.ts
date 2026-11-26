import { describe, expect, it } from 'vitest';
import type { BingoConfig, DinnerConfig, QuizConfig, SeatsConfig } from '../server/event/config';
import * as bingo from '../server/games/party-event/bingo';
import { cardCells, judgeCard, labelOf, normalizeCardId } from '../server/games/party-event/cards';
import * as dinner from '../server/games/party-event/dinner';
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

  it('受付ずみかは名前ではなくカードで見る（同じ名前の人がいても取り違えない）', () => {
    const s = bingo.emptyBingo();
    s.called = Array.from({ length: 75 }, (_, i) => i + 1);
    bingo.claim(s, cfg, 'ZZZZ', 'たなか');
    bingo.claim(s, cfg, 'AB23', 'たなか');
    expect(bingo.bingoView(s, cfg, false, 'AB23', null).myRank).toBe(2);
    expect(bingo.bingoView(s, cfg, false, 'K7M9', null).myRank).toBeNull();
    expect(bingo.bingoView(s, cfg, false, null, null).myRank).toBeNull();
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

  /** 名簿の全員が来ていて、くじに入っている状態（司会が全員をくじに入れた） */
  const allHere = (): seats.SeatsState => {
    const s = seats.emptySeats();
    for (const p of seats.roster(s, cfg)) seats.markPresent(s, p.id, true);
    return s;
  };

  it('全員引くと席が決まり、同じ所属が固まらない', () => {
    const s = allHere();
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
    const s = allHere();
    const first = seats.drawOne(s, cfg)!;
    expect(seats.undoDraw(s)).toBe(first.id);
    expect(s.assign[first.id]).toBeUndefined();
    expect(seats.seatsView(s, cfg, null).remaining).toBe(8);
  });

  it('欠席にすると引かれず、戻すと引ける', () => {
    const s = allHere();
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
    const s = allHere();
    seats.drawAll(s, narrow);
    const view = seats.seatsView(s, narrow, null);
    expect(view.tables[0].people).toHaveLength(2);
    expect(view.noSeat).toHaveLength(6);
  });

  it('くじに入るのは名前を選んだ人だけで、来ていない人は引かれない', () => {
    const s = seats.emptySeats();
    s.claimed = { player1: 'p1', player2: 'p5' };
    expect(seats.seatsView(s, cfg, null).remaining).toBe(2);
    const drawn = seats.drawAll(s, cfg).map((p) => p.id);
    expect(drawn.sort()).toEqual(['p1', 'p5']);
    const view = seats.seatsView(s, cfg, null);
    expect(view.roster.filter((p) => p.chosen).map((p) => p.id)).toEqual(['p1', 'p5']);
    expect(view.roster.filter((p) => p.table == null)).toHaveLength(6); // 来ていない6人は席が決まらない
  });

  it('司会がくじに入れた人と、当日足した人も引かれる', () => {
    const s = seats.emptySeats();
    seats.markPresent(s, 'p2', true);
    const extra = seats.addExtra(s, 'とびいり', 'C社');
    expect(seats.drawAll(s, cfg).map((p) => p.id).sort()).toEqual(['p2', extra.id].sort());
    // くじに入れたのを取り消せる
    const t = seats.emptySeats();
    seats.markPresent(t, 'p2', true);
    seats.markPresent(t, 'p2', false);
    expect(seats.drawOne(t, cfg)).toBeNull();
  });

  it('欠席にした人は、名前を選んでいても引かれない', () => {
    const s = seats.emptySeats();
    s.claimed = { player1: 'p1' };
    seats.markAbsent(s, 'p1', true);
    expect(seats.drawOne(s, cfg)).toBeNull();
  });

  it('参加者が自分の名前を足すと名簿に加わり、その人として、くじに入る', () => {
    const s = seats.emptySeats();
    const me = seats.addSelf(s, cfg, 'player9', '  とびいり  太郎 ', 'B社');
    expect(me).toMatchObject({ id: 'x1', name: 'とびいり 太郎', group: 'B社' });
    expect(s.claimed.player9).toBe('x1');
    expect(seats.drawAll(s, cfg).map((p) => p.id)).toEqual(['x1']);
  });

  it('2回目は打ち間違いの直しとして、前に足した名前を書き換える（名簿は増えない）', () => {
    const s = seats.emptySeats();
    seats.addSelf(s, cfg, 'player9', 'とびいり大郎', 'A社');
    const fixed = seats.addSelf(s, cfg, 'player9', 'とびいり太郎', 'B社');
    expect(s.extras).toHaveLength(1);
    expect(fixed).toMatchObject({ id: 'x1', name: 'とびいり太郎', group: 'B社' });
    // 別の人は別の人として足せる
    expect(seats.addSelf(s, cfg, 'player10', 'もうひとり', 'A社').id).toBe('x2');
  });

  it('名簿にある名前は足せない（空白・全角半角の違いも同じとみなす）', () => {
    const s = seats.emptySeats();
    expect(() => seats.addSelf(s, cfg, 'player9', 'あ０', 'A社')).toThrow(/名簿にあります/);
    expect(() => seats.addSelf(s, cfg, 'player9', 'あ 0', 'A社')).toThrow(/名簿にあります/);
    seats.addSelf(s, cfg, 'player9', 'とびいり', 'A社');
    expect(() => seats.addSelf(s, cfg, 'player10', 'とびいり', 'A社')).toThrow(/名簿にあります/);
    expect(s.extras).toHaveLength(1);
  });

  it('空の名前は足せず、長すぎる名前と所属は切り詰める', () => {
    const s = seats.emptySeats();
    expect(() => seats.addSelf(s, cfg, 'player9', '   ', 'A社')).toThrow(/名前を入力/);
    expect(() => seats.addExtra(s, '', 'A社')).toThrow(/名前を入力/);
    const p = seats.addSelf(s, cfg, 'player9', 'な'.repeat(50), 'し'.repeat(50));
    expect(p.name).toHaveLength(seats.NAME_MAX);
    expect(p.group).toHaveLength(seats.GROUP_MAX);
  });

  it('当日足せる人数には上限がある', () => {
    const s = seats.emptySeats();
    for (let i = 0; i < seats.MAX_EXTRAS; i++) seats.addExtra(s, `人${i}`, '');
    expect(() => seats.addExtra(s, 'もう1人', '')).toThrow(/これ以上/);
    expect(() => seats.addSelf(s, cfg, 'player9', 'もう1人', '')).toThrow(/これ以上/);
  });

  it('自分で足すときの所属の選択肢は、名簿にある所属', () => {
    expect(seats.seatsView(seats.emptySeats(), cfg, null).groups).toEqual(['A社', 'B社']);
  });

  it('別のスマホが選んでいる名前は、ふつうに選ぶと断り、本人だと確かめたときだけこちらに移す', () => {
    const s = seats.emptySeats();
    seats.claim(s, cfg, 'old', 'p1', false);
    expect(() => seats.claim(s, cfg, 'new', 'p1', false)).toThrow(/他の方が選んでいます/);
    seats.claim(s, cfg, 'new', 'p1', true);
    expect(s.claimed).toEqual({ new: 'p1' });
    // 移っても、くじに入る人の数は変わらない
    expect(seats.drawAll(s, cfg).map((p) => p.id)).toEqual(['p1']);
    // 名簿に無い名前・選び直し
    expect(() => seats.claim(s, cfg, 'new', 'nope', true)).toThrow(/名簿にありません/);
    seats.claim(s, cfg, 'new', '', false);
    expect(s.claimed).toEqual({});
  });

  it('選ばれている名前には、見ている人以外が選んでいる印（taken）が付く', () => {
    const s = seats.emptySeats();
    seats.claim(s, cfg, 'player1', 'p1', false);
    const forOther = seats.seatsView(s, cfg, null).roster;
    const forMe = seats.seatsView(s, cfg, 'p1').roster;
    expect(forOther.find((p) => p.id === 'p1')!.taken).toBe(true);
    expect(forOther.find((p) => p.id === 'p2')!.taken).toBe(false);
    expect(forMe.find((p) => p.id === 'p1')!.taken).toBe(false);
  });

  it('ルームを出た人が選んでいた名前は空き、くじからも外れる', () => {
    const s = seats.emptySeats();
    seats.claim(s, cfg, 'player1', 'p1', false);
    seats.release(s, 'player1');
    expect(s.claimed).toEqual({});
    expect(seats.drawOne(s, cfg)).toBeNull();
  });

  it('自分で足した名前は、選んでいる間だけくじに入る（足したあと名簿の自分を選び直しても、足した名前が残って引かれない）', () => {
    const s = seats.emptySeats();
    const typo = seats.addSelf(s, cfg, 'player9', 'あ０ちゃん', 'A社');
    seats.claim(s, cfg, 'player9', 'p1', false); // 名簿に自分がいた
    expect(seats.drawAll(s, cfg).map((p) => p.id)).toEqual(['p1']);
    const view = seats.seatsView(s, cfg, 'p1');
    expect(view.roster.find((p) => p.id === typo.id)!.chosen).toBe(false);
    // 司会が足した人は、誰も選んでいなくてもくじに入る
    const t = seats.emptySeats();
    const byHost = seats.addExtra(t, 'スマホ無し', 'B社');
    expect(seats.drawAll(t, cfg).map((p) => p.id)).toEqual([byHost.id]);
  });

  it('自分で足した名前を、本人が別のスマホで取り戻したあとは、前のスマホから書き換えない', () => {
    const s = seats.emptySeats();
    const mine = seats.addSelf(s, cfg, 'phoneA', 'とびいり', 'A社');
    seats.claim(s, cfg, 'phoneB', mine.id, true);
    // 前のスマホで「名前を足す」をもう一度押しても、取り戻した名前は変わらない（別の名前として足す）
    const other = seats.addSelf(s, cfg, 'phoneA', 'べつのひと', 'B社');
    expect(other.id).not.toBe(mine.id);
    expect(s.extras.find((p) => p.id === mine.id)!.name).toBe('とびいり');
    // 同じ名前で足し直すことはできない（一覧から選んでもらう）
    expect(() => seats.addSelf(s, cfg, 'phoneC', 'とびいり', 'A社')).toThrow(/名簿にあります/);
  });

  it('参加者に送る名簿・テーブルには、自分で足したかどうかの印を出さない', () => {
    const s = seats.emptySeats();
    seats.addSelf(s, cfg, 'player9', 'とびいり', 'A社');
    seats.drawAll(s, cfg);
    const view = seats.seatsView(s, cfg, null);
    expect(view.roster.find((p) => p.name === 'とびいり')).not.toHaveProperty('self');
    expect(view.tables.flatMap((t) => t.people)[0]).not.toHaveProperty('self');
    expect(view.last).not.toHaveProperty('self');
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

/* ================================================================== */
describe('夕食の席', () => {
  const cfg: DinnerConfig = {
    title: '夕食の席',
    legend: [
      { label: '甲', groups: ['A社'] },
      { label: '乙', groups: ['B社', 'C社'] },
    ],
    tables: [
      {
        name: '1卓目',
        teams: [
          { name: 'チーム A', members: ['山田 太郎', 'すずき'] },
          { name: 'チーム B', members: ['たなか', 'ゲスト'] },
        ],
      },
    ],
  };
  const roster = [
    { id: 'p1', name: '山田 太郎', group: 'A社' },
    { id: 'p2', name: 'すずき', group: 'B社' },
    { id: 'p3', name: 'たなか', group: 'C社' },
  ];

  it('名前から夕食のチームを引く（全角・空白の違いは同じ）', () => {
    expect(dinner.teamOfName(cfg, '山田太郎')).toEqual({ table: '1卓目', team: 'チーム A' });
    expect(dinner.teamOfName(cfg, '　たなか ')).toEqual({ table: '1卓目', team: 'チーム B' });
    expect(dinner.teamOfName(cfg, 'いないひと')).toBeNull();
  });

  it('所属の色は legend の順、名簿に無い名前は tone null。凡例に人数が付く', () => {
    const v = dinner.dinnerView(cfg, roster, null);
    const [a, b] = v.tables[0].teams;
    expect(a.members.map((m) => m.tone)).toEqual([0, 1]);
    expect(b.members.map((m) => m.tone)).toEqual([1, null]);
    expect(v.legend).toEqual([
      { label: '甲', tone: 0, count: 1 },
      { label: '乙', tone: 1, count: 2 },
    ]);
    expect(v.tables[0].count).toBe(4);
  });

  it('自分の名前に you が付き、myTeam / myTable が入る', () => {
    const v = dinner.dinnerView(cfg, roster, 'たなか');
    expect(v.tables[0].teams[1].members[0].you).toBe(true);
    expect(v.tables[0].teams[0].members.some((m) => m.you)).toBe(false);
    expect(v.myTeam).toBe('チーム B');
    expect(v.myTable).toBe('1卓目');
    expect(dinner.dinnerView(cfg, roster, null).myTeam).toBeNull();
  });
});
