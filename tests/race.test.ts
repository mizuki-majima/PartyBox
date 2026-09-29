import { describe, expect, it } from 'vitest';
import { EXAMPLE_PROMPTS, RIVAL_PROMPTS } from '../src/generator';
import { designCar } from '../src/generator/MockCarGenerator';
import { buildHighlights } from '../src/race/highlights';
import { RaceSim, type RacerInput } from '../src/race/RaceSim';
import { getTrack } from '../src/track/TrackData';
import { Rng } from '../src/util/rng';

const prompts = [...EXAMPLE_PROMPTS, ...RIVAL_PROMPTS];
const cars = prompts.map((p) => designCar(p));
const racers = (idx: number[]): RacerInput[] => idx.map((i, k) => ({ id: String(i), name: cars[i].name, stats: cars[i].stats, isPlayer: k === 0 }));

describe('RaceSim', () => {
  it('3 周で全車がゴールし、1〜2 分程度で終わる', () => {
    const rng = new Rng(7);
    for (let r = 0; r < 40; r++) {
      const idx = rng.shuffle(cars.map((_, i) => i)).slice(0, 4);
      const sim = new RaceSim(getTrack(), racers(idx), { seed: r });
      const res = sim.runToEnd();
      expect(res).not.toBeNull();
      expect(res!.entries).toHaveLength(4);
      expect(res!.entries.map((e) => e.position)).toEqual([1, 2, 3, 4]);
      const winner = res!.entries[0];
      expect(winner.time).toBeGreaterThan(50);
      expect(winner.time).toBeLessThan(100);
      expect(winner.lapTimes).toHaveLength(3);
      // タイム順に並んでいる
      for (let i = 1; i < 4; i++) expect(res!.entries[i].time).toBeGreaterThanOrEqual(res!.entries[i - 1].time);
    }
  });

  it('同じ種なら同じ展開になる', () => {
    const a = new RaceSim(getTrack(), racers([0, 1, 2, 3]), { seed: 42 }).runToEnd()!;
    const b = new RaceSim(getTrack(), racers([0, 1, 2, 3]), { seed: 42 }).runToEnd()!;
    expect(a.entries).toEqual(b.entries);
  });

  it('弱い車にも勝つチャンスがあり、強い車でも負けることがある', () => {
    const wins = new Map<number, number>();
    const runs = new Map<number, number>();
    const rng = new Rng(3);
    for (let r = 0; r < 400; r++) {
      const idx = rng.shuffle(cars.map((_, i) => i)).slice(0, 4);
      const res = new RaceSim(getTrack(), racers(idx), { seed: 1000 + r, countdown: 0 }).runToEnd()!;
      idx.forEach((i) => runs.set(i, (runs.get(i) ?? 0) + 1));
      const w = idx[res.entries[0].index];
      wins.set(w, (wins.get(w) ?? 0) + 1);
    }
    for (const [i, n] of runs) {
      const rate = (wins.get(i) ?? 0) / n;
      expect(rate, prompts[i]).toBeGreaterThan(0.02);
      expect(rate, prompts[i]).toBeLessThan(0.6);
    }
  });

  it('イベント（追い抜き・ラップなど）が記録され、ハイライトが作れる', () => {
    const res = new RaceSim(getTrack(), racers([0, 1, 2, 3]), { seed: 5 }).runToEnd()!;
    const types = new Set(res.events.map((e) => e.type));
    expect(types.has('start')).toBe(true);
    expect(types.has('lap')).toBe(true);
    expect(types.has('finish')).toBe(true);
    expect(buildHighlights(res).length).toBeGreaterThan(0);
  });

  it('タイトル用のエンドレスモードは終わらず、イベントもためない', () => {
    const sim = new RaceSim(getTrack(), racers([0, 1, 2, 3]), { endless: true, seed: 1 });
    for (let i = 0; i < 60 * 200; i++) sim.step(1 / 60);
    expect(sim.phase).toBe('racing');
    expect(sim.drainEvents()).toHaveLength(0);
  });
});
