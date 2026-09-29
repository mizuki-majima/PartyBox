/** 車の性能。各 1〜10。 */
export interface CarStats {
  /** 最高速度 */
  speed: number;
  /** 加速の速さ */
  acceleration: number;
  /** カーブでの減速の少なさ */
  handling: number;
  /** ハプニング（スピン、コースアウト）の起きにくさ */
  stability: number;
}

export const STAT_KEYS = ['speed', 'acceleration', 'handling', 'stability'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
