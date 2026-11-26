import { describe, expect, it } from 'vitest';
import { getGameMeta } from '../shared/games';
import { SOLO_MAX, soloCounts, soloDefault, soloName, soloSeat } from '../client/lib/soloDemo';

/**
 * 通常のゲームを「1人で試す」（/demo/<ゲーム>）の決まり。全員ぶんの画面を並べるときの人数・名前・枠
 */
describe('1人で試す: 人数・名前・枠', () => {
  it('人数は最少人数〜6人、既定は4人（範囲に無ければ範囲の中でいちばん近い数）', () => {
    expect(soloCounts(getGameMeta('whose-answer')!)).toEqual([3, 4, 5, 6]);
    expect(soloCounts(getGameMeta('liar')!)).toEqual([4, 5, 6]);
    expect(soloCounts(getGameMeta('ad-dodge')!)).toEqual([2, 3, 4, 5, 6]);
    expect(soloDefault(getGameMeta('liar')!)).toBe(4);
    expect(soloDefault(getGameMeta('ad-dodge')!)).toBe(4);
    expect(soloDefault({ minPlayers: 5, maxPlayers: 8 })).toBe(5);
    expect(soloDefault({ minPlayers: 2, maxPlayers: 3 })).toBe(3);
    expect(SOLO_MAX).toBe(6);
  });

  it('1人目がホスト。名前と枠は番号で決まる', () => {
    expect(soloName(1)).toBe('プレイヤー1');
    expect(soloName(4)).toBe('プレイヤー4');
    expect(soloSeat(1)).toBe('host');
    expect(soloSeat(4)).toBe('4');
  });
});
