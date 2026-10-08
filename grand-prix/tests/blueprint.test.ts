import { describe, expect, it } from 'vitest';
import { normalizeBlueprint, normalizeStats, sanitizeText } from '../src/blueprint/schema';
import { BROKEN_SAMPLE, SAMPLE_BLUEPRINTS } from '../src/blueprint/samples';
import { decodeBlueprint, encodeBlueprint } from '../src/blueprint/serialize';
import { LIMITS, STAT_KEYS, type CarStats } from '../src/blueprint/types';

const total = (s: CarStats) => STAT_KEYS.reduce((a, k) => a + s[k], 0);

describe('normalizeStats', () => {
  it('合計がちょうど上限になり、各値が 1〜10 に収まる', () => {
    const cases: unknown[] = [
      { speed: 10, acceleration: 10, handling: 10, stability: 10 },
      { speed: 1, acceleration: 1, handling: 1, stability: 1 },
      { speed: 999, acceleration: -5, handling: 'fast' },
      { speed: 3, acceleration: 4, handling: 7, stability: 10 },
      null,
      'strong',
    ];
    for (const c of cases) {
      const s = normalizeStats(c);
      expect(total(s)).toBe(LIMITS.statTotal);
      for (const k of STAT_KEYS) {
        expect(Number.isInteger(s[k])).toBe(true);
        expect(s[k]).toBeGreaterThanOrEqual(LIMITS.statMin);
        expect(s[k]).toBeLessThanOrEqual(LIMITS.statMax);
      }
    }
  });

  it('「最強」にしようとしても最強にはならない', () => {
    const s = normalizeStats({ speed: 10, acceleration: 10, handling: 10, stability: 10 });
    expect(s).toEqual({ speed: 6, acceleration: 6, handling: 6, stability: 6 });
  });

  it('合計 24 の stats はそのまま残る', () => {
    expect(normalizeStats({ speed: 3, acceleration: 4, handling: 7, stability: 10 })).toEqual({
      speed: 3,
      acceleration: 4,
      handling: 7,
      stability: 10,
    });
  });

  it('比率はだいたい保たれる', () => {
    const s = normalizeStats({ speed: 10, acceleration: 5, handling: 5, stability: 2 });
    expect(s.speed).toBeGreaterThan(s.acceleration);
    expect(s.stability).toBeLessThan(s.handling);
  });
});

describe('normalizeBlueprint', () => {
  it('手書きサンプルはすべて有効な設計図になる', () => {
    for (const raw of SAMPLE_BLUEPRINTS) {
      const { blueprint } = normalizeBlueprint(raw);
      expect(blueprint.parts.length).toBeGreaterThan(0);
      expect(blueprint.parts.length).toBeLessThanOrEqual(LIMITS.maxParts);
      expect(total(blueprint.stats)).toBe(LIMITS.statTotal);
      for (const p of blueprint.parts) {
        expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
        for (const v of p.position) expect(Math.abs(v)).toBeLessThanOrEqual(LIMITS.coordMax);
        for (const v of p.size) {
          expect(v).toBeGreaterThanOrEqual(LIMITS.sizeMin);
          expect(v).toBeLessThanOrEqual(LIMITS.sizeMax);
        }
      }
    }
  });

  it('壊れたデータでも例外を出さずに車になる', () => {
    const { blueprint, issues } = normalizeBlueprint(BROKEN_SAMPLE);
    expect(issues.length).toBeGreaterThan(0);
    expect(blueprint.name).toBe('ナゾの車');
    expect(blueprint.wheelStyle).toBe('normal');
    expect(blueprint.parts.some((p) => p.role === 'wheel')).toBe(true);
  });

  it('どんな値を渡しても車が出る', () => {
    for (const v of [undefined, null, 42, 'not json', '{"parts": 3}', [], { parts: [] }, { parts: Array(100).fill({}) }]) {
      const { blueprint } = normalizeBlueprint(v);
      expect(blueprint.parts.length).toBeGreaterThan(0);
      expect(blueprint.parts.length).toBeLessThanOrEqual(LIMITS.maxParts);
      expect(blueprint.parts.some((p) => p.role === 'wheel')).toBe(true);
    }
  });

  it('JSON 文字列も受け付ける', () => {
    const { blueprint } = normalizeBlueprint('{"name":"テスト号","parts":[{"shape":"box","size":[1,1,1],"position":[0,0.5,0],"color":"red","role":"body"}]}');
    expect(blueprint.name).toBe('テスト号');
    expect(blueprint.parts[0].color).toBe('#e53935');
  });

  it('車輪が 1 つも無く wheelStyle が none なら浮いたまま', () => {
    const { blueprint } = normalizeBlueprint({
      parts: [{ shape: 'sphere', size: [1], position: [0, 1, 0], color: '#ffffff', role: 'body' }],
      wheelStyle: 'none',
    });
    expect(blueprint.parts.some((p) => p.role === 'wheel')).toBe(false);
  });

  it('回転の無い円柱の車輪は車軸を横向きにする', () => {
    const { blueprint } = normalizeBlueprint({
      parts: [
        { shape: 'box', size: [1, 1, 1], position: [0, 0.5, 0], color: '#fff', role: 'body' },
        { shape: 'cylinder', size: [0.3, 0.2], position: [0.4, 0.3, 0.5], color: '#000', role: 'tire' },
      ],
    });
    const wheel = blueprint.parts.find((p) => p.role === 'wheel');
    expect(wheel?.rotation).toEqual([90, 0, 0]);
  });
});

describe('sanitizeText', () => {
  it('制御文字を消して長さを制限する', () => {
    expect(sanitizeText('a\u0000b\nc', 10, 'x')).toBe('abc');
    expect(sanitizeText('あいうえおかきくけこさ', 5, 'x')).toBe('あいうえお');
    expect(sanitizeText('   ', 5, 'x')).toBe('x');
    expect(sanitizeText(3, 5, 'x')).toBe('x');
  });
});

describe('serialize', () => {
  it('エンコード → デコードで同じ設計図に戻る', () => {
    for (const raw of SAMPLE_BLUEPRINTS) {
      const { blueprint } = normalizeBlueprint(raw);
      const code = encodeBlueprint(blueprint);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeBlueprint(code)).toEqual(normalizeBlueprint(blueprint).blueprint);
    }
  });

  it('壊れた文字列は null', () => {
    expect(decodeBlueprint('%%%')).toBeNull();
  });
});
