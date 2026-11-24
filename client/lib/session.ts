import type { SessionInfo } from '../../shared/protocol';

/**
 * リロード・再接続用のセッション保存（localStorage）
 * room code / player ID / 再接続トークン / 名前 を保存する。
 *
 * デモ（/demo/<id>）では、1つのブラウザの中に司会と参加者の画面を iframe で並べる。
 * 同じオリジンの iframe は localStorage を共有するので、URL の `?seat=<枠>` で保存のキーを分け、
 * 枠ごとに別の端末として振る舞わせる（ページを読み込んだときの値を、そのページの間ずっと使う）。
 */
const SEAT_PATTERN = /^[a-z0-9]{1,8}$/i;

function readSeat(): string | null {
  try {
    const seat = new URLSearchParams(window.location.search).get('seat');
    return seat && SEAT_PATTERN.test(seat) ? seat : null;
  } catch {
    return null;
  }
}

/** この画面の枠（デモの iframe の中だけ。ふだんは null） */
export const SEAT = readSeat();

const suffix = (seat: string | null) => (seat ? `:seat:${seat}` : '');
const key = (code: string, seat: string | null) => `partybox:session:${code.toUpperCase()}${suffix(seat)}`;
const nameKey = (seat: string | null) => `partybox:lastName${suffix(seat)}`;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** seat を渡すと、その枠のセッションとして保存する（デモの画面が各枠の分を用意するときに使う） */
export function saveSession(session: SessionInfo, seat: string | null = SEAT): void {
  safe(() => {
    localStorage.setItem(key(session.code, seat), JSON.stringify({ ...session, savedAt: Date.now() }));
    localStorage.setItem(nameKey(seat), session.name);
  }, undefined);
}

const SESSION_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export function loadSession(code: string, seat: string | null = SEAT): SessionInfo | null {
  return safe(() => {
    const raw = localStorage.getItem(key(code, seat));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionInfo & { savedAt?: number };
    // 古いセッションは破棄する。懇親会のルームは7日残る（前日に作って QR を配れる）ので、それより長めにとる。
    // 消えたルームのセッションは、再参加に失敗した時点で消えるので、長くても困らない
    if (parsed.savedAt && Date.now() - parsed.savedAt > SESSION_MAX_AGE_MS) {
      localStorage.removeItem(key(code, seat));
      return null;
    }
    return parsed;
  }, null);
}

export function clearSession(code: string, seat: string | null = SEAT): void {
  safe(() => localStorage.removeItem(key(code, seat)), undefined);
}

export function getLastName(): string {
  return safe(() => localStorage.getItem(nameKey(SEAT)) ?? '', '');
}

export function setLastName(name: string): void {
  safe(() => localStorage.setItem(nameKey(SEAT), name), undefined);
}
