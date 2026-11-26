import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEventConfig } from '../server/event/config';

/**
 * 懇親会の設定（置き場の quiz.json など）の読み込み。
 * 選択問題の answer は party-app-aws と同じ「何番目か（1 始まり）」で書き、読み込んだあとは 0 始まりで持つ。
 */

let dir: string;
const before = process.env.PARTYBOX_EVENT_DATA_DIR;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'partybox-event-'));
  process.env.PARTYBOX_EVENT_DATA_DIR = dir;
});
afterEach(() => {
  if (before === undefined) delete process.env.PARTYBOX_EVENT_DATA_DIR;
  else process.env.PARTYBOX_EVENT_DATA_DIR = before;
  rmSync(dir, { recursive: true, force: true });
});

const writeQuiz = (questions: unknown[]) =>
  writeFileSync(path.join(dir, 'quiz.json'), JSON.stringify({ title: 'クイズ', teams: ['A', 'B'], questions }));

describe('クイズの answer（選択問題は 1 始まり）', () => {
  it('1 始まりで読み、中では 0 始まりで持つ（最初も最後の選択肢も正解にできる）', () => {
    writeQuiz([
      { question: '最初が正解', choices: ['あ', 'い', 'う'], answer: 1 },
      { question: '最後が正解', choices: ['あ', 'い', 'う'], answer: 3 },
    ]);
    const { quiz } = loadEventConfig();
    const pick = (i: number) => quiz.questions[i].choices![quiz.questions[i].answer as number];
    expect(pick(0)).toBe('あ');
    expect(pick(1)).toBe('う');
  });

  it('範囲外の番号（0 や 選択肢の数より大きい）は、黙って進めずエラーにする', () => {
    writeQuiz([{ question: '0 始まりのつもり', choices: ['あ', 'い'], answer: 0 }]);
    expect(() => loadEventConfig()).toThrow(/1 始まり/);
    writeQuiz([{ question: '多すぎる', choices: ['あ', 'い'], answer: 3 }]);
    expect(() => loadEventConfig()).toThrow(/1 始まり/);
  });

  it('選択問題に答えの文章を書いたらエラーにする', () => {
    writeQuiz([{ question: '文章', choices: ['あ', 'い'], answer: 'あ' }]);
    expect(() => loadEventConfig()).toThrow(/1 始まり/);
  });

  it('自由回答は答えの文章のまま（数字だけでも文章として扱う）', () => {
    writeQuiz([
      { question: '自由回答', answer: 'こたえ' },
      { question: '数字の自由回答', answer: 3776 },
    ]);
    const { quiz } = loadEventConfig();
    expect(quiz.questions[0].answer).toBe('こたえ');
    expect(quiz.questions[1].answer).toBe('3776');
  });

  it('answer は省ける（選択問題でも自由回答でも）。省いたまま持つ（答えが当日まで分からない問題のため）', () => {
    writeQuiz([
      { question: '答えが直前に決まる選択問題', choices: ['あ', 'い', 'う'] },
      { question: '司会が正解を決める自由回答' },
    ]);
    const { quiz } = loadEventConfig();
    expect(quiz.questions.map((q) => q.answer)).toEqual([undefined, undefined]);
  });

  it('points を省くと 1 点、書けばその点', () => {
    writeQuiz([
      { question: 'ふつう', answer: 'あ' },
      { question: '最終問題', answer: 'い', points: 3 },
    ]);
    const { quiz } = loadEventConfig();
    expect(quiz.questions[0].points ?? 1).toBe(1);
    expect(quiz.questions[1].points).toBe(3);
  });

  it('points が 0 や 11 ならエラー', () => {
    writeQuiz([{ question: '0点', answer: 'あ', points: 0 }]);
    expect(() => loadEventConfig()).toThrow(/quiz\.json の形式が正しくありません/);
    writeQuiz([{ question: '11点', answer: 'あ', points: 11 }]);
    expect(() => loadEventConfig()).toThrow(/quiz\.json の形式が正しくありません/);
  });

  it('同梱のサンプルも 1 始まりで書いてあり、第1問の正解は「北海道」', () => {
    // 置き場が空ならサンプルで動く
    const { quiz, source } = loadEventConfig();
    expect(source).toContain('サンプル');
    const q = quiz.questions[0];
    expect(q.choices![q.answer as number]).toBe('北海道');
  });
});

describe('夕食の席（dinner.json）', () => {
  const writeDinner = (body: unknown) => writeFileSync(path.join(dir, 'dinner.json'), JSON.stringify(body));
  const seatsBody = { participants: ['あ', 'い'], tables: [{ name: '1', seats: 2 }] };

  it('置き場の dinner.json を読む（title を省くと「夕食の席」）', () => {
    writeDinner({
      legend: [{ label: '所属A', groups: ['A社'] }],
      tables: [{ name: '卓1', teams: [{ name: 'チーム A', members: ['あ', 'い'] }] }],
    });
    const { dinner } = loadEventConfig();
    expect(dinner?.title).toBe('夕食の席');
    expect(dinner?.tables[0].teams[0].members).toEqual(['あ', 'い']);
    expect(dinner?.legend[0].groups).toEqual(['A社']);
  });

  it('置き場に名簿があって dinner.json が無ければ null（サンプルの名前を本番に出さない）', () => {
    writeFileSync(path.join(dir, 'seats.json'), JSON.stringify(seatsBody));
    expect(loadEventConfig().dinner).toBeNull();
  });

  it('置き場が空ならサンプルを使う', () => {
    expect(loadEventConfig().dinner?.tables.length).toBeGreaterThanOrEqual(1);
  });

  it('形式が違えば起動を失敗させる', () => {
    writeDinner({ tables: [] });
    expect(() => loadEventConfig()).toThrow(/dinner\.json の形式が正しくありません/);
  });
});
