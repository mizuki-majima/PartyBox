import type { GameId } from '../../shared/games';
import type { Ack } from '../../shared/protocol';
import { clearSession, loadSession, saveSession } from './session';
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

/** 使い終わったデモのルームを閉じる（失敗しても、誰もいなければ30分で片付くので気にしない） */
export async function closeDemoRoom(room: DemoRoom): Promise<void> {
  const session = loadSession(room.code, HOST_SEAT);
  if (session) {
    let s: PartySocket | null = null;
    try {
      s = await openSocket();
      const res = await requestOn(s, 'room:rejoin', { code: room.code, playerId: session.playerId, token: session.token });
      if (res.ok) await requestOn(s, 'room:close', {});
    } catch {
      /* 片付けは任意 */
    } finally {
      s?.disconnect();
    }
  }
  clearSession(room.code, HOST_SEAT);
  for (let n = 1; n <= MAX_GUESTS; n++) clearSession(room.code, guestSeat(n));
}
