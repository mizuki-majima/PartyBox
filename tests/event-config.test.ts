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

  it('同梱のサンプルも 1 始まりで書いてあり、第1問の正解は「北海道」', () => {
    // 置き場が空ならサンプルで動く
    const { quiz, source } = loadEventConfig();
    expect(source).toContain('サンプル');
    const q = quiz.questions[0];
    expect(q.choices![q.answer as number]).toBe('北海道');
  });
});
