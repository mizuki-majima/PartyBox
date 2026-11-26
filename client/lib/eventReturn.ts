/**
 * 懇親会の画面から通常のゲームへ行ったときに、端末に覚えておくこと（localStorage）。
 * - チームで遊ぶ: 「このチームでゲームを遊ぶ」で選んだチーム名と戻り先。作るルームにチーム名を付けて、勝者の記録に残す
 * - 最後に開いた懇親会のルーム: 招待で入ったゲームのルームからも「懇親会の画面に戻る」を出すため
 * どちらも12時間で忘れる（翌日以降に作るルームにチーム名が付かないように）。読めない・書けないときは何もしない
 */
const TEAM_KEY = 'partybox:teamPlay';
const EVENT_KEY = 'partybox:lastEventRoom';
const TTL_MS = 12 * 60 * 60 * 1000;

export interface TeamPlay {
  eventCode: string;
  team: string;
}

function save(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch {
    // 保存できなくても、ゲームは遊べる
  }
}

function load(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.savedAt !== 'number' || Date.now() - v.savedAt > TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

export function setTeamPlay(eventCode: string, team: string): void {
  save(TEAM_KEY, { eventCode, team });
}

export function getTeamPlay(): TeamPlay | null {
  const v = load(TEAM_KEY);
  return v && typeof v.eventCode === 'string' && typeof v.team === 'string' && v.eventCode && v.team
    ? { eventCode: v.eventCode, team: v.team }
    : null;
}

export function clearTeamPlay(): void {
  try {
    localStorage.removeItem(TEAM_KEY);
  } catch {
    // 何もしない
  }
}

/** 懇親会のルームを開いたら覚えておく */
export function rememberEventRoom(code: string): void {
  save(EVENT_KEY, { code });
}

export function getLastEventRoom(): string | null {
  const v = load(EVENT_KEY);
  return v && typeof v.code === 'string' && v.code ? v.code : null;
}
