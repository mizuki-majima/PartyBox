import { describe, expect, it } from 'vitest';
import { LIMITS, STAT_KEYS } from '../src/blueprint/types';
import { EXAMPLE_PROMPTS, RIVAL_PROMPTS } from '../src/generator';
import { analyzePrompt, designCar, MockCarGenerator } from '../src/generator/MockCarGenerator';
import { extractKeyword, normalizeText } from '../src/generator/text';

const traitIds = (prompt: string) => analyzePrompt(prompt).traits.map((t) => t.id);

describe('normalizeText', () => {
  it('カタカナ・全角・大文字をならす', () => {
    expect(normalizeText('カッコイイ')).toBe('かっこいい');
    expect(normalizeText('ヒラぺったい')).toBe('ひらぺったい');
    expect(normalizeText('ＵＦＯ みたい')).toBe('ufoみたい');
  });
});

describe('analyzePrompt', () => {
  it('表記ゆれがあっても同じ特徴を拾う', () => {
    for (const p of ['かっこいい車', 'カッコイイ車', '格好いい車', 'かっこ良い車']) {
      expect(traitIds(p)).toContain('cool');
    }
    for (const p of ['ひらぺったい車', 'ヒラぺったい車', '平べったい車', 'ヒラベッタイ車']) {
      expect(traitIds(p)).toContain('flat');
    }
  });

  it('江戸・カレー・かわいい を拾う', () => {
    expect(traitIds('江戸時代にあるような車')).toContain('edo');
    expect(traitIds('カレーの匂いがしそうな車')).toContain('curry');
    expect(traitIds('かわいい車')).toContain('cute');
  });

  it('色の名前を拾う', () => {
    expect(analyzePrompt('赤い車').colors).toEqual(['#e53935']);
    expect(analyzePrompt('青と白の車').colors).toEqual(['#1e88e5', '#fafafa']);
    expect(analyzePrompt('キンピカの車').colorPalette).toBe('gold');
  });

  it('「面白い」の「白」を色と誤認しない', () => {
    const an = analyzePrompt('面白い車');
    expect(an.colors).toEqual([]);
    expect(an.traits.map((t) => t.id)).toContain('funny');
  });

  it('同じ言葉に複数の特徴があれば全部拾う', () => {
    const ids = traitIds('海賊船');
    expect(ids).toContain('boat');
    expect(ids).toContain('pirate');
  });
});

describe('extractKeyword', () => {
  it('辞書に無い単語から名前の元を拾う', () => {
    expect(extractKeyword('宇宙人が乗ってそうな車')).toBe('宇宙人');
    expect(extractKeyword('ぷにぷにの車')).toBe('プニプニ');
    expect(extractKeyword('ドーナツみたいな車')).toBe('ドーナツ');
    expect(extractKeyword('車')).toBeNull();
  });
});

describe('designCar', () => {
  const prompts = [
    ...EXAMPLE_PROMPTS,
    ...RIVAL_PROMPTS,
    '最強の車',
    'あ',
    '',
    '🚗🚗🚗',
    '<script>alert(1)</script>',
    'x'.repeat(500),
    'よくわからないけどすごいやつ',
    'ぷにぷにの車',
    '赤ちゃんが乗る青い車',
  ];

  it('どんな入力でも有効な設計図が出る', () => {
    for (const p of prompts) {
      const bp = designCar(p);
      expect(bp.parts.length).toBeGreaterThan(0);
      expect(bp.parts.length).toBeLessThanOrEqual(LIMITS.maxParts);
      expect(STAT_KEYS.reduce((a, k) => a + bp.stats[k], 0)).toBe(LIMITS.statTotal);
      expect(bp.name.length).toBeGreaterThan(0);
      expect(Array.from(bp.name).length).toBeLessThanOrEqual(LIMITS.nameMax);
    }
  });

  it('同じ文なら同じ車（表記ゆれも同じ扱い）', () => {
    for (const p of prompts) expect(designCar(p)).toEqual(designCar(p));
    expect(designCar('カッコイイ車').parts).toEqual(designCar('かっこいい車').parts);
  });

  it('違う文なら違う車になりやすい', () => {
    const names = new Set(RIVAL_PROMPTS.map((p) => JSON.stringify(designCar(p).parts)));
    expect(names.size).toBe(RIVAL_PROMPTS.length);
    const unknown = new Set(['りんご', 'みかん', 'ぶどう', 'めろん', 'もも'].map((p) => JSON.stringify(designCar(p))));
    expect(unknown.size).toBe(5);
  });

  it('江戸は牛車風・木の車輪', () => {
    const bp = designCar('江戸時代にあるような車');
    expect(bp.wheelStyle).toBe('wooden');
    expect(bp.parts.some((p) => p.material === 'wood')).toBe(true);
  });

  it('ひらぺったい車は背が低い', () => {
    const height = (p: string) => {
      const bp = designCar(p);
      return Math.max(...bp.parts.map((q) => q.position[1]));
    };
    expect(height('ひらぺったいスポーツカー')).toBeLessThan(height('スポーツカー'));
  });

  it('「最強」と書いても合計は上限のまま', () => {
    const bp = designCar('最強で無敵で世界一速い車');
    expect(STAT_KEYS.reduce((a, k) => a + bp.stats[k], 0)).toBe(LIMITS.statTotal);
    for (const k of STAT_KEYS) expect(bp.stats[k]).toBeLessThanOrEqual(LIMITS.statMax);
  });

  it('速い車は speed が高く、のんびりした車は stability が高い', () => {
    const fast = designCar('とにかく速い車');
    const slow = designCar('のんびりした車');
    expect(fast.stats.speed).toBeGreaterThan(slow.stats.speed);
    expect(slow.stats.stability).toBeGreaterThan(fast.stats.stability);
  });
});

describe('MockCarGenerator', () => {
  it('途中経過を知らせてから設計図を返す', async () => {
    const gen = new MockCarGenerator({ minDelayMs: 0, maxDelayMs: 0 });
    const steps: string[] = [];
    const bp = await gen.generate('かわいい車', { onProgress: (m) => steps.push(m) });
    expect(steps.length).toBeGreaterThan(0);
    expect(bp).toEqual(designCar('かわいい車'));
  });

  it('中断できる', async () => {
    const gen = new MockCarGenerator({ minDelayMs: 1000, maxDelayMs: 1000 });
    const ctrl = new AbortController();
    const p = gen.generate('車', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toThrow();
  });
});
