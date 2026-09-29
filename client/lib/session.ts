import type { SessionInfo } from '../../shared/protocol';

/**
 * リロード・再接続用のセッション保存（localStorage）
 * room code / player ID / 再接続トークン / 名前 を保存する。
 */
const key = (code: string) => `partybox:session:${code.toUpperCase()}`;
const NAME_KEY = 'partybox:lastName';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function saveSession(session: SessionInfo): void {
  safe(() => {
    localStorage.setItem(key(session.code), JSON.stringify({ ...session, savedAt: Date.now() }));
    localStorage.setItem(NAME_KEY, session.name);
  }, undefined);
}

export function loadSession(code: string): SessionInfo | null {
  return safe(() => {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionInfo & { savedAt?: number };
    // 1日以上前のセッションは破棄
    if (parsed.savedAt && Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key(code));
      return null;
    }
    return parsed;
  }, null);
}

export function clearSession(code: string): void {
  safe(() => localStorage.removeItem(key(code)), undefined);
}

export function getLastName(): string {
  return safe(() => localStorage.getItem(NAME_KEY) ?? '', '');
}

export function setLastName(name: string): void {
  safe(() => localStorage.setItem(NAME_KEY, name), undefined);
}
