/**
 * 通常のゲームを「1人で試す」（/demo/<ゲーム>）の決まり。
 * 全員ぶんの画面を1ページに並べるので、何人ぶん並べるか・各枠の名前と保存のキー（seat）をここで決める。
 * 画面やソケットに触らない純粋な関数だけを置く（試験から直接呼べるように）
 */

/** 並べる画面の数の上限（PC の画面に並べて操作できる数） */
export const SOLO_MAX = 6;
const SOLO_PREFERRED = 4;

type PlayerRange = { minPlayers: number; maxPlayers: number };

/** 選べる人数: そのゲームの最少人数〜6人（ゲームの上限が6より少なければ、その上限まで） */
export function soloCounts(meta: PlayerRange): number[] {
  const max = Math.min(SOLO_MAX, meta.maxPlayers);
  const out: number[] = [];
  for (let n = meta.minPlayers; n <= max; n++) out.push(n);
  return out;
}

/** 最初に並べる人数: 4人。選べる範囲に無ければ、範囲の中でいちばん近い数 */
export function soloDefault(meta: PlayerRange): number {
  const counts = soloCounts(meta);
  return Math.min(Math.max(SOLO_PREFERRED, counts[0]), counts[counts.length - 1]);
}

/** n 人目の名前（1 始まり。1人目がホスト） */
export function soloName(n: number): string {
  return `プレイヤー${n}`;
}

/** n 人目の枠（保存のキー）。1人目は懇親会のデモの司会と同じ 'host' */
export function soloSeat(n: number): string {
  return n === 1 ? 'host' : String(n);
}
