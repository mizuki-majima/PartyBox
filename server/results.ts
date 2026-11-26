/**
 * 勝者の記録
 *
 * 懇親会では、卓ごとに通常のゲームを遊んで1位を決める。あとで「何時何分に、誰が1位になったか」を
 * 見返せるように、ゲームが最後まで終わるたびに結果を1件ずつ残す（/results のページで見る）。
 *
 * - 残すのは、最後まで遊んだ通常のゲームだけ。途中で打ち切られたゲーム、懇親会（司会が進める企画）、デモは残さない
 * - 置き場は PARTYBOX_STATE_DIR の results.json（ルームの保存 rooms.json とは別のファイル）。
 *   再起動（反映）しても消えないようにするため
 * - 名前は参加者が入れた表示名。ログ（console）には出さない
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameId } from '../shared/games';
import type { GameResult, GameResultRow } from '../shared/results';

const DEFAULT_DIR = '/opt/partybox/state';
const FILE = 'results.json';
/** 残す件数の上限（古いものから捨てる） */
export const MAX_RESULTS = 500;

/**
 * 個人の順位が付くゲーム。
 * 「全員一致を目指せ！」は全員で1チーム、「回答を育てろ」は勝ち負けが無いので、1位は決めない
 */
const RANKED_GAMES: ReadonlySet<GameId> = new Set<GameId>(['whose-answer', 'liar', 'ten-sec-trial']);

export function isRankedGame(gameId: GameId): boolean {
  return RANKED_GAMES.has(gameId);
}

export interface ResultInput {
  gameId: GameId;
  /** 参加した人（途中で抜けた人も含む） */
  players: { name: string; score: number; left: boolean }[];
  /** 順位の付かないゲームの結果のひとこと（チーム得点など） */
  note?: string | null;
  /** 遊んだチーム（ルームに付けたチーム名） */
  label?: string | null;
  at?: number;
}

/** 点の高い順に並べ、同点は同じ順位にする（1位が2人なら、次は3位） */
export function rankPlayers(players: ResultInput['players']): GameResultRow[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((p, i) => {
    const rank = p.score === lastScore ? lastRank : i + 1;
    lastScore = p.score;
    lastRank = rank;
    return { name: p.name, score: p.score, rank, left: p.left };
  });
}

export function buildResult(input: ResultInput, id: string): GameResult {
  const ranked = isRankedGame(input.gameId);
  const ranking = ranked
    ? rankPlayers(input.players)
    : input.players.map((p) => ({ name: p.name, score: p.score, rank: 0, left: p.left }));
  return {
    id,
    at: input.at ?? Date.now(),
    gameId: input.gameId,
    ranked,
    // 途中で抜けた人は1位にしない
    winners: ranked ? ranking.filter((r) => r.rank === 1 && !r.left).map((r) => r.name) : [],
    ranking,
    note: input.note ?? null,
    // チーム名は付けたときだけ入れる（付けていない記録の形は今までと同じ）
    ...(input.label ? { label: input.label } : {}),
  };
}

interface ResultFile {
  version: 1;
  results: GameResult[];
}

function stateDir(): string {
  return process.env.PARTYBOX_STATE_DIR ?? DEFAULT_DIR;
}

function load(): GameResult[] {
  try {
    const parsed = JSON.parse(readFileSync(join(stateDir(), FILE), 'utf8')) as ResultFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.results)) return [];
    return parsed.results.filter((r) => typeof r?.id === 'string' && typeof r.at === 'number' && Array.isArray(r.ranking));
  } catch {
    return []; // 初回・壊れている場合は空から始める
  }
}

/** 途中で落ちても壊れたファイルが残らないよう、別名に書いてから差し替える */
function save(results: GameResult[]): void {
  const dir = stateDir();
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, FILE);
    const body: ResultFile = { version: 1, results };
    writeFileSync(`${path}.tmp`, JSON.stringify(body), 'utf8');
    renameSync(`${path}.tmp`, path);
  } catch (err) {
    console.error('[results] 勝者の記録の保存に失敗しました', err);
  }
}

export class ResultLog {
  private results: GameResult[];
  private seq = 0;

  /** persist が false なら、ディスクを触らない（試験用） */
  constructor(private readonly persist: boolean) {
    this.results = persist ? load() : [];
  }

  add(input: ResultInput): GameResult {
    const result = buildResult(input, `${Date.now().toString(36)}-${(this.seq++).toString(36)}`);
    this.results = [...this.results, result].slice(-MAX_RESULTS);
    if (this.persist) save(this.results);
    return result;
  }

  /** 古い順（終わった順） */
  list(): GameResult[] {
    return [...this.results];
  }
}
