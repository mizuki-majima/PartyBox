import type { CarGenerator } from './CarGenerator';
import { MockCarGenerator } from './MockCarGenerator';

export type { CarGenerator, GenerateOptions } from './CarGenerator';

/**
 * 使う生成器を決める場所。
 * 将来 ClaudeCarGenerator を作ったら、ここで切り替える（README「AI 生成の組み込み方」参照）。
 * 例:
 *   if (import.meta.env.VITE_CAR_API_URL) return new ClaudeCarGenerator(import.meta.env.VITE_CAR_API_URL);
 */
export function createCarGenerator(): CarGenerator {
  return new MockCarGenerator();
}

/** 車づくり画面の入力例ボタン */
export const EXAMPLE_PROMPTS = [
  'かっこいい車',
  'ヒラぺったい車',
  '江戸時代にあるような車',
  'カレーの匂いがしそうな車',
  'ねこみたいなかわいい車',
  '宇宙から来たUFOみたいな車',
];

/** ライバル（CPU）の車を作るためのプロンプト */
export const RIVAL_PROMPTS = [
  'ロケットみたいに速そうな車',
  'おばあちゃんちの軽トラ',
  'お祭りの屋台みたいな車',
  'ケーキみたいに甘い車',
  'パンダのぬいぐるみみたいな車',
  '赤いスポーツカー',
  '海賊船みたいな車',
  'ピカピカ光る近未来の車',
  'のんびり走る黄色いバス',
  '新幹線みたいな車',
  'ワイルドなオフロード車',
  '王様が乗っていそうな金ピカの車',
  'サンタさんのそり代わりの車',
  'ドリフトが得意な峠の車',
];
