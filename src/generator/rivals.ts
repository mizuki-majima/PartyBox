import type { CarBlueprint } from '../blueprint/types';
import { Rng } from '../util/rng';
import { RIVAL_PROMPTS } from './index';
import { designCar } from './MockCarGenerator';

/**
 * ライバル（CPU）の車を用意する。
 * 用意したプロンプトから重複なしで選び、MockCarGenerator と同じ仕組みで車にする。
 * （ライバルは待ち時間なしで出したいので、演出の無い designCar を直接使う）
 */
export function pickRivals(count: number, seed = Math.floor(Math.random() * 1e9), exclude: string[] = []): CarBlueprint[] {
  const rng = new Rng(seed);
  const prompts = rng.shuffle(RIVAL_PROMPTS.filter((p) => !exclude.includes(p))).slice(0, count);
  return prompts.map((p) => designCar(p));
}
