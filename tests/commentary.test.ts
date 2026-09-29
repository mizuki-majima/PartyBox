import { describe, expect, it } from 'vitest';
import { RIVAL_PROMPTS } from '../src/generator';
import { designCar } from '../src/generator/MockCarGenerator';
import { Commentary } from '../src/race/Commentary';
import { RaceSim } from '../src/race/RaceSim';
import { getTrack } from '../src/track/TrackData';

describe('Commentary', () => {
  it('レースの出来事から実況の文が次々に出て、車の名前が入る', () => {
    const bps = RIVAL_PROMPTS.slice(0, 4).map((p) => designCar(p));
    const sim = new RaceSim(
      getTrack(),
      bps.map((bp, i) => ({ id: String(i), name: bp.name, stats: bp.stats, isPlayer: i === 0 })),
      { seed: 11 },
    );
    const com = new Commentary(sim, bps, 1);
    const shown: string[] = [];
    let last = null;
    const dt = 1 / 60;
    while (sim.phase !== 'finished') {
      sim.step(dt);
      for (const e of sim.drainEvents()) com.handle(e);
      com.update(dt);
      if (com.current && com.current !== last) shown.push(com.current.text);
      last = com.current;
    }
    expect(shown.length).toBeGreaterThan(8);
    expect(shown[0]).toMatch(/スタート|レース開始|始まりました/);
    for (const line of shown) expect(line.length).toBeGreaterThan(3);
    const names = bps.map((b) => b.name);
    expect(shown.filter((l) => names.some((n) => l.includes(n))).length).toBeGreaterThan(shown.length / 2);
    expect(shown.some((l) => l.includes('優勝') || l.includes('チェッカー'))).toBe(true);
  });
});
