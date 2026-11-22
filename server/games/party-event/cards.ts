/**
 * ビンゴのカードと判定
 *
 * カードは保存せず、種（seed）とカードIDから毎回作り直す。司会はカードIDを聞くだけで
 * 同じカードを再現して確かめられる。式は party-app-aws（および静的版 party/js/common.js）
 * と同じもので、ここを変えると過去のカードIDが別のカードになるので注意。
 */
import { randomInt } from 'node:crypto';

export const MAX_NUMBER = 75;

/** 読み間違えやすい文字（0/O、1/I/L）は使わない */
const CARD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CARD_ID_LENGTH = 4;

export function newCardId(): string {
  return Array.from({ length: CARD_ID_LENGTH }, () => CARD_ALPHABET[randomInt(CARD_ALPHABET.length)]).join('');
}

export function normalizeCardId(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CARD_ID_LENGTH);
}

export function isCardId(id: string): boolean {
  return id.length === CARD_ID_LENGTH && [...id].every((c) => CARD_ALPHABET.includes(c));
}

export const letterOf = (n: number): string => 'BINGO'[Math.min(4, Math.floor((n - 1) / 15))];
export const labelOf = (n: number): string => `${letterOf(n)} ${n}`;

/** 文字列 → 32bit のハッシュ（FNV-1a） */
function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 種が同じなら同じ順で 0〜1 を返す乱数（mulberry32） */
function seededRandom(seed: string): () => number {
  let a = hashString(String(seed)) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr: number[], rand: () => number): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * カードID → 25マス（行優先。まん中 [12] は 0 = FREE）。
 * 列 c は c*15+1 〜 c*15+15 から 5 つ。
 */
export function cardCells(seed: string, cardId: string): number[] {
  const rand = seededRandom(`bingo:${seed}:${cardId}`);
  const cols: number[][] = [];
  for (let c = 0; c < 5; c++) {
    cols.push(seededShuffle(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1), rand).slice(0, 5));
  }
  const cells: number[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) cells.push(r === 2 && c === 2 ? 0 : cols[c][r]);
  }
  return cells;
}

/** 揃いうる12本の線（行5・列5・斜め2） */
export const BINGO_LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return lines;
})();

export interface CardJudgement {
  marked: boolean[];
  lines: number[][];
  bingo: boolean;
  reach: number;
}

/** 呼ばれた番号だけで判定する（参加者のタップは当てにしない） */
export function judgeCard(cells: number[], called: readonly number[]): CardJudgement {
  const hit = new Set(called);
  const marked = cells.map((n) => n === 0 || hit.has(n));
  const lines = BINGO_LINES.filter((line) => line.every((i) => marked[i]));
  const reach = BINGO_LINES.filter((line) => line.filter((i) => marked[i]).length === 4);
  return { marked, lines, bingo: lines.length > 0, reach: reach.length };
}

/** 偏りのない整数（0以上 n 未満）。抽選はすべてこれで引く */
export const drawIndex = (n: number): number => randomInt(n);
