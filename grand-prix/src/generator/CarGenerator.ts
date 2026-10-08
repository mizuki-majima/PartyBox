import type { CarBlueprint } from '../blueprint/types';

export interface GenerateOptions {
  /** 「パーツを組み立て中…」のような途中経過を受け取る */
  onProgress?: (message: string) => void;
  /** 途中でやめたいとき */
  signal?: AbortSignal;
}

/**
 * 話し言葉 → 車の設計図。
 * 実装を差し替えられるようにインターフェースで分けてある。
 * - MockCarGenerator: キーワード辞書＋ハッシュ乱数（API を呼ばない。現在の既定）
 * - ClaudeCarGenerator: Claude API＋PartyBox サーバーの /api/generate-car（将来追加。README 参照）
 *
 * どの実装も「必ず何かしらの車を返す」こと。失敗したら例外ではなくフォールバックの車を返す。
 */
export interface CarGenerator {
  /** 画面に出す「デモ版」などの表示用ラベル */
  readonly label: string;
  generate(prompt: string, options?: GenerateOptions): Promise<CarBlueprint>;
}
