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
  /** 遊んだチーム（懇親会の夕食のチームのルームで遊んだとき）。付けていない記録・古い記録には無い */
  label?: string;
}

export interface ResultsResponse {
  /** 古い順（終わった順） */
  results: GameResult[];
  serverNow: number;
}

/** チームごとの1位（同じチームで遊んだゲームの1位を、終わった順に） */
export interface TeamWins {
  label: string;
  wins: { gameId: GameId; winners: string[]; at: number }[];
}

/**
 * 夕食のチームで遊んだ記録を、チームごとにまとめる（勝者の記録のページの上に出す）。
 * 順位の付くゲームで1位がいる記録だけ。チーム名の無い記録は入れない。チームの並びは名前順（数字は数として）
 */
export function winnersByLabel(results: GameResult[]): TeamWins[] {
  const byLabel = new Map<string, TeamWins['wins']>();
  for (const r of [...results].sort((a, b) => a.at - b.at)) {
    if (!r.label || !r.ranked || !r.winners.length) continue;
    byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), { gameId: r.gameId, winners: r.winners, at: r.at }]);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ja', { numeric: true }))
    .map(([label, wins]) => ({ label, wins }));
}
