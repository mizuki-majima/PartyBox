import type { GameId } from '../../shared/games';
import type { Ack } from '../../shared/protocol';
import { clearSession, loadSession, saveSession } from './session';
import { SOLO_MAX, soloName, soloSeat } from './soloDemo';
import { type PartySocket, openSocket, requestOn } from './socket';

/**
 * 1人で試すデモ（/demo/<id>）のルームづくり。
 *
 * 司会1人と参加者 n 人を、それぞれ別のソケットでルームに入れ、セッションを枠（seat）ごとに
 * 保存してからソケットを閉じる。そのあと各枠の iframe（/room/<CODE>?seat=<枠>）が、保存された
 * セッションで同じ人として入り直す。催し物のルームは回線が切れた人を外さないので、
 * 入り直すまでのあいだに外れることはない。
 *
 * ルームはサーバー側で demo として作る（保存せず、誰もいなくなって30分で片付く）。
 */

export const HOST_SEAT = 'host';
export const guestSeat = (n: number): string => String(n);
const guestName = (n: number): string => `参加者${n}`;

/** 並べられる参加者の台数 */
export const GUEST_COUNTS = [1, 2, 3, 5] as const;
export const MAX_GUESTS = GUEST_COUNTS[GUEST_COUNTS.length - 1];

export interface DemoRoom {
  code: string;
  hostToken: string;
  /** ルームに入れ終わった参加者の数（枠 1〜guests） */
  guests: number;
}

function unwrap<T>(res: Ack<T>): { ok: true } & T {
  if (!res.ok) throw new Error(res.error);
  return res;
}

/** 参加者を1人入れて、その枠のセッションを保存する */
async function joinGuest(code: string, n: number): Promise<PartySocket> {
  const s = await openSocket();
  try {
    const joined = unwrap(await requestOn(s, 'room:join', { code, name: guestName(n) }));
    saveSession(joined.session, guestSeat(n));
    return s;
  } catch (err) {
    s.disconnect();
    throw err;
  }
}

/** デモのルームを作り、参加者を入れて、懇親会を始めたところまで進める */
export async function createDemoRoom(gameId: GameId, guests: number): Promise<DemoRoom> {
  const opened: PartySocket[] = [];
  try {
    const host = await openSocket();
    opened.push(host);
    const created = unwrap(await requestOn(host, 'room:create', { gameId, name: '司会', demo: true }));
    const { code, hostToken } = created.session;
    if (!hostToken) throw new Error('司会用URLを受け取れませんでした');
    saveSession(created.session, HOST_SEAT);

    // 開始の時点で繋がっている人が参加者になるので、参加者を入れてから始める
    for (let n = 1; n <= guests; n++) opened.push(await joinGuest(code, n));
    unwrap(await requestOn(host, 'room:start', {}));
    return { code, hostToken, guests };
  } finally {
    for (const s of opened) s.disconnect();
  }
}

/** 参加者の枠を増やす（始まったあとに入った人も、懇親会では参加者になる） */
export async function addDemoGuests(room: DemoRoom, upTo: number): Promise<DemoRoom> {
  let guests = room.guests;
  while (guests < upTo) {
    const s = await joinGuest(room.code, guests + 1);
    s.disconnect();
    guests++;
  }
  return { ...room, guests };
}

/** ホストの枠のセッションで入り直して、ルームを閉じる（失敗しても、誰もいなければ30分で片付くので気にしない） */
async function closeAsHost(code: string, seat: string): Promise<void> {
  const session = loadSession(code, seat);
  if (!session) return;
  let s: PartySocket | null = null;
  try {
    s = await openSocket();
    const res = await requestOn(s, 'room:rejoin', { code, playerId: session.playerId, token: session.token });
    if (res.ok) await requestOn(s, 'room:close', {});
  } catch {
    /* 片付けは任意 */
  } finally {
    s?.disconnect();
  }
}

/** 使い終わったデモのルームを閉じる */
export async function closeDemoRoom(room: DemoRoom): Promise<void> {
  await closeAsHost(room.code, HOST_SEAT);
  clearSession(room.code, HOST_SEAT);
  for (let n = 1; n <= MAX_GUESTS; n++) clearSession(room.code, guestSeat(n));
}

/* ---------------- 通常のゲームを1人で試す ---------------- */

/** 通常のゲームのデモのルーム。全員ぶんの枠（1人目がホスト）を並べる */
export interface SoloDemoRoom {
  code: string;
  /** 入れた人数（枠 1〜players） */
  players: number;
}

/**
 * 通常のゲームのデモのルームを作り、全員を入れて、ロビーのまま返す（設定と開始は、ホストの枠で本人に押してもらう）。
 * 各枠のセッションを保存してからソケットを閉じ、そのあと各枠の iframe（/room/<CODE>?seat=<枠>）が同じ人として入り直す。
 * 通常のゲームは切断して3分で外れ、ホストは30秒で移るが、枠は数秒で入り直すので間に合う
 */
export async function createSoloDemoRoom(gameId: GameId, players: number): Promise<SoloDemoRoom> {
  const opened: PartySocket[] = [];
  try {
    const host = await openSocket();
    opened.push(host);
    const created = unwrap(await requestOn(host, 'room:create', { gameId, name: soloName(1), demo: true }));
    const { code } = created.session;
    saveSession(created.session, soloSeat(1));
    for (let n = 2; n <= players; n++) {
      const s = await openSocket();
      opened.push(s);
      const joined = unwrap(await requestOn(s, 'room:join', { code, name: soloName(n) }));
      saveSession(joined.session, soloSeat(n));
    }
    return { code, players };
  } finally {
    for (const s of opened) s.disconnect();
  }
}

/** 使い終わった通常のゲームのデモのルームを閉じ、全部の枠のセッションを消す */
export async function closeSoloDemoRoom(room: SoloDemoRoom): Promise<void> {
  await closeAsHost(room.code, soloSeat(1));
  for (let n = 1; n <= SOLO_MAX; n++) clearSession(room.code, soloSeat(n));
}
