/**
 * ビンゴの規則（party-app-aws backend/src/bingo.mjs の移植）
 *
 * - 抽選はすべてサーバーで引く
 * - 「ビンゴ！」の判定は呼ばれた番号だけで行う。参加者のタップは当てにしない
 */
import type { BingoView, BingoCardView } from '../../../shared/games/views';
import type { BingoConfig } from '../../event/config';
import { MAX_NUMBER, cardCells, drawIndex, judgeCard, labelOf, newCardId } from './cards';

export interface BingoClaimEntry {
  cardId: string;
  name: string;
  at: number;
  ok: boolean;
  lines: number;
}

export interface BingoState {
  called: number[];
  claims: BingoClaimEntry[];
  prizes: BingoView['prizes'];
  /** プレイヤーID → カードID。入室した順に配る */
  cards: Record<string, string>;
}

export function emptyBingo(): BingoState {
  return { called: [], claims: [], prizes: null, cards: {} };
}

/** まだカードを持っていなければ配る。他の人とぶつからないIDにする */
export function ensureCard(state: BingoState, playerId: string): string {
  const existing = state.cards[playerId];
  if (existing) return existing;
  const used = new Set(Object.values(state.cards));
  let id = newCardId();
  for (let i = 0; i < 50 && used.has(id); i++) id = newCardId();
  state.cards[playerId] = id;
  return id;
}

/** 番号を1つ引く。残りが無ければ null */
export function draw(state: BingoState): number | null {
  const called = new Set(state.called);
  const rest: number[] = [];
  for (let n = 1; n <= MAX_NUMBER; n++) if (!called.has(n)) rest.push(n);
  if (!rest.length) return null;
  const number = rest[drawIndex(rest.length)];
  state.called.push(number);
  return number;
}

/** 直前の番号を戻す（読み間違えたとき） */
export function undoDraw(state: BingoState): number | null {
  return state.called.pop() ?? null;
}

export interface ClaimResult {
  duplicated: boolean;
  rejected: boolean;
  entry: BingoClaimEntry;
  rank: number | null;
}

/** 参加者の「ビンゴ！」。呼ばれた番号だけで検証する */
export function claim(state: BingoState, cfg: BingoConfig, cardId: string, name: string): ClaimResult {
  const already = state.claims.find((c) => c.cardId === cardId);
  if (already) return { duplicated: true, rejected: false, entry: already, rank: state.claims.indexOf(already) + 1 };

  const cells = cardCells(cfg.seed, cardId);
  const { bingo, lines } = judgeCard(cells, state.called);
  const entry: BingoClaimEntry = { cardId, name: name.slice(0, 40), at: Date.now(), ok: bingo, lines: lines.length };
  if (!bingo) return { duplicated: false, rejected: true, entry, rank: null };

  state.claims.push(entry);
  return { duplicated: false, rejected: false, entry, rank: state.claims.length };
}

/** 司会が誤って記録したときに消す */
export function removeClaim(state: BingoState, cardId: string): boolean {
  const before = state.claims.length;
  state.claims = state.claims.filter((c) => c.cardId !== cardId);
  if (state.claims.length === before) return false;
  state.prizes = null; // 並びが変わるので景品は引き直し
  return true;
}

/** 景品のくじ引き。上位 winnersCount 名に1つずつ割り当てる */
export function drawPrizes(state: BingoState, cfg: BingoConfig): BingoView['prizes'] {
  const winners = state.claims.slice(0, cfg.winnersCount);
  if (!winners.length) return null;

  const pool = [...cfg.prizes];
  const assigned = winners.map((w) => ({
    cardId: w.cardId,
    name: w.name,
    prize: pool.length ? pool.splice(drawIndex(pool.length), 1)[0] : null,
  }));
  state.prizes = { assigned, leftover: pool, at: Date.now() };
  return state.prizes;
}

export function resetBingo(state: BingoState): void {
  state.called = [];
  state.claims = [];
  state.prizes = null;
  // 配ったカードは残す（参加者の手元のカードと食い違わないように）
}

export function cardView(cfg: BingoConfig, state: BingoState, cardId: string): BingoCardView {
  const cells = cardCells(cfg.seed, cardId);
  const { marked, lines, bingo, reach } = judgeCard(cells, state.called);
  return { cardId, cells, marked, lines: lines.length, bingo, reach };
}

export function bingoView(
  state: BingoState,
  cfg: BingoConfig,
  isHost: boolean,
  myCardId: string | null,
  inspectedId: string | null,
): BingoView {
  return {
    title: cfg.title,
    called: [...state.called],
    last: state.called.at(-1) ?? null,
    lastLabel: state.called.length ? labelOf(state.called.at(-1)!) : null,
    remaining: MAX_NUMBER - state.called.length,
    winnersCount: cfg.winnersCount,
    claims: state.claims.map((c, i) => ({
      rank: i + 1,
      name: c.name,
      at: c.at,
      ok: c.ok,
      inPrize: i < cfg.winnersCount,
      cardId: isHost ? c.cardId : null, // カードIDは司会にだけ
    })),
    prizes: state.prizes,
    prizeList: [...cfg.prizes],
    myCard: myCardId ? cardView(cfg, state, myCardId) : null,
    // 受付ずみかはカードで見る（名前は同じ人がいることがある）
    myRank: myCardId ? state.claims.findIndex((c) => c.cardId === myCardId) + 1 || null : null,
    inspected: isHost && inspectedId ? cardView(cfg, state, inspectedId) : null,
  };
}
