/**
 * 勝者の記録（GET /api/results で配り、/results のページで見せる）
 */
import type { GameId } from './games';

export interface GameResultRow {
  name: string;
  score: number;
  /** 順位（同点は同じ順位）。順位の付かないゲームでは 0 */
  rank: number;
  /** 途中で抜けた人 */
  left: boolean;
}

export interface GameResult {
  id: string;
  /** ゲームが終わった時刻（サーバーの時計。epoch ms） */
  at: number;
  gameId: GameId;
  /** 個人の順位が付くゲームか（協力ゲーム・勝ち負けの無いゲームは false） */
  ranked: boolean;
  /** 1位の人の名前（同点なら複数。順位の付かないゲームでは空） */
  winners: string[];
  ranking: GameResultRow[];
  /** 順位の付かないゲームの結果のひとこと（チーム得点など） */
  note: string | null;
}

export interface ResultsResponse {
  /** 古い順（終わった順） */
  results: GameResult[];
  serverNow: number;
}
