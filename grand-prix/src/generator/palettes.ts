import type { PartMaterial } from '../blueprint/types';

/** 車の配色。テンプレートは色を直接持たず、必ずパレット経由で塗る。 */
export interface Palette {
  body: string;
  accent: string;
  cabin: string;
  window: string;
  wheel: string;
  trim: string;
  bodyMaterial?: PartMaterial;
  /** 虹色: 車体系のパーツを順番に塗り分ける */
  rainbow?: boolean;
}

export const PALETTES = {
  toy: { body: '#ff5a5a', accent: '#ffd23f', cabin: '#fff3e0', window: '#9fd3ff', wheel: '#333333', trim: '#eceff1' },
  sky: { body: '#3fa7ff', accent: '#ffffff', cabin: '#e3f2fd', window: '#bbdefb', wheel: '#37474f', trim: '#eceff1' },
  lime: { body: '#7ed957', accent: '#ffeb3b', cabin: '#f1f8e9', window: '#b3e5fc', wheel: '#33691e', trim: '#fafafa' },
  orange: { body: '#ff9f43', accent: '#5d4037', cabin: '#fff8e1', window: '#b3e5fc', wheel: '#3e2723', trim: '#fafafa' },
  grape: { body: '#b36bff', accent: '#ffd23f', cabin: '#f3e5f5', window: '#e1bee7', wheel: '#311b92', trim: '#fafafa' },
  mint: { body: '#6fe3c1', accent: '#ff8a80', cabin: '#fffde7', window: '#b2ebf2', wheel: '#455a64', trim: '#ffffff' },
  pastel: { body: '#f8bbd0', accent: '#b3e5fc', cabin: '#fff9c4', window: '#b3e5fc', wheel: '#8d6e63', trim: '#ffffff' },
  cool: { body: '#263238', accent: '#00e5ff', cabin: '#37474f', window: '#1c313a', wheel: '#111111', trim: '#b0bec5' },
  edo: { body: '#5d4037', accent: '#c62828', cabin: '#3e2723', window: '#e8d5b0', wheel: '#4e342e', trim: '#d7ccc8', bodyMaterial: 'wood' },
  curry: { body: '#e0a100', accent: '#7b4a12', cabin: '#fff3c4', window: '#ffe082', wheel: '#4e342e', trim: '#fafafa' },
  gold: { body: '#ffc107', accent: '#fff59d', cabin: '#ffe082', window: '#fff8e1', wheel: '#5d4037', trim: '#ffecb3', bodyMaterial: 'metal' },
  silver: { body: '#cfd8dc', accent: '#546e7a', cabin: '#eceff1', window: '#90caf9', wheel: '#263238', trim: '#ffffff', bodyMaterial: 'metal' },
  police: { body: '#fafafa', accent: '#212121', cabin: '#212121', window: '#90caf9', wheel: '#212121', trim: '#fafafa' },
  fire: { body: '#e53935', accent: '#fafafa', cabin: '#ffcdd2', window: '#bbdefb', wheel: '#212121', trim: '#b0bec5' },
  ambulance: { body: '#fafafa', accent: '#e53935', cabin: '#fafafa', window: '#90caf9', wheel: '#37474f', trim: '#e53935' },
  sakura: { body: '#ffb7c5', accent: '#ffffff', cabin: '#fff0f5', window: '#f8bbd0', wheel: '#6d4c41', trim: '#ffffff' },
  ocean: { body: '#1e88e5', accent: '#ffffff', cabin: '#e1f5fe', window: '#80deea', wheel: '#0d47a1', trim: '#ffffff' },
  pirate: { body: '#5d4037', accent: '#212121', cabin: '#3e2723', window: '#ffe082', wheel: '#3e2723', trim: '#ffd54f', bodyMaterial: 'wood' },
  winter: { body: '#e53935', accent: '#fafafa', cabin: '#ffffff', window: '#b3e5fc', wheel: '#1b5e20', trim: '#fafafa' },
  halloween: { body: '#ff8f00', accent: '#6a1b9a', cabin: '#311b92', window: '#ffeb3b', wheel: '#212121', trim: '#4a148c' },
  neon: { body: '#1a1a2e', accent: '#ff00e5', cabin: '#16213e', window: '#00fff0', wheel: '#0f0f0f', trim: '#00fff0' },
  rusty: { body: '#a1664b', accent: '#6d4c41', cabin: '#bcaaa4', window: '#90a4ae', wheel: '#3e2723', trim: '#8d6e63' },
  retro: { body: '#a8e6cf', accent: '#fdffab', cabin: '#fffdf5', window: '#dcedc1', wheel: '#5d4037', trim: '#ffd3b6' },
  ninja: { body: '#212121', accent: '#7e57c2', cabin: '#311b92', window: '#424242', wheel: '#111111', trim: '#9575cd' },
  sweets: { body: '#f5d6a0', accent: '#ff5a7a', cabin: '#fffaf0', window: '#ffc1cc', wheel: '#8d6e63', trim: '#ffffff' },
  wood: { body: '#b0835a', accent: '#6d4c41', cabin: '#d7b899', window: '#e8d5b0', wheel: '#4e342e', trim: '#efebe9', bodyMaterial: 'wood' },
  rainbow: { body: '#ff5a5a', accent: '#ffd23f', cabin: '#ffffff', window: '#b3e5fc', wheel: '#333333', trim: '#fafafa', rainbow: true },
  forest: { body: '#2e7d32', accent: '#a5d6a7', cabin: '#e8f5e9', window: '#c8e6c9', wheel: '#3e2723', trim: '#fafafa' },
  night: { body: '#1a237e', accent: '#ffeb3b', cabin: '#283593', window: '#fff59d', wheel: '#111111', trim: '#c5cae9' },
} satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;

/** 辞書に何も引っかからなかったときにランダムで選ぶ候補 */
export const RANDOM_PALETTES: PaletteId[] = ['toy', 'sky', 'lime', 'orange', 'grape', 'mint', 'pastel', 'sakura', 'ocean', 'retro', 'forest'];

export const RAINBOW = ['#ff5a5a', '#ff9f43', '#ffd23f', '#7ed957', '#3fa7ff', '#b36bff'];

/** 色の単語 → 色 */
export const COLOR_WORDS: { patterns: string[]; color: string; palette?: PaletteId }[] = [
  { patterns: ['赤', '赤い', 'あかい', 'レッド', '真っ赤', 'まっか'], color: '#e53935' },
  { patterns: ['青', '青い', 'あおい', 'ブルー', '真っ青'], color: '#1e88e5' },
  { patterns: ['水色', 'みずいろ', 'スカイブルー', '空色'], color: '#4fc3f7' },
  { patterns: ['紺', '紺色', 'ネイビー'], color: '#1a237e' },
  { patterns: ['黄', '黄色', 'きいろ', 'イエロー'], color: '#fdd835' },
  { patterns: ['緑', 'みどり', 'グリーン'], color: '#43a047' },
  { patterns: ['黒', '黒い', 'くろい', 'ブラック', '真っ黒', 'まっくろ'], color: '#263238' },
  { patterns: ['白', '白い', 'しろい', 'ホワイト', '真っ白', 'まっしろ'], color: '#fafafa' },
  { patterns: ['ピンク', '桃色', 'ももいろ'], color: '#f06292' },
  { patterns: ['紫', 'むらさき', 'パープル'], color: '#8e24aa' },
  { patterns: ['オレンジ', '橙', 'だいだい'], color: '#fb8c00' },
  { patterns: ['茶色', 'ちゃいろ', 'ブラウン'], color: '#795548' },
  { patterns: ['灰色', 'はいいろ', 'グレー', 'グレイ'], color: '#90a4ae' },
  { patterns: ['金', '金色', 'きんいろ', 'ゴールド', '黄金', '金ピカ', 'きんぴか'], color: '#ffc107', palette: 'gold' },
  { patterns: ['銀', '銀色', 'ぎんいろ', 'シルバー'], color: '#cfd8dc', palette: 'silver' },
  { patterns: ['虹', '虹色', 'にじいろ', 'レインボー', 'カラフル', '七色'], color: '#ff5a5a', palette: 'rainbow' },
];

export const PART_MATERIAL_FOR_PALETTE = (p: Palette): PartMaterial => p.bodyMaterial ?? 'plastic';
