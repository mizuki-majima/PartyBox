/**
 * 「このチームでゲームを遊ぶ」で懇親会の画面から通常のゲームへ行ったときの、チーム名と戻り先（懇親会のルームコード）。
 * ゲームのルームにチーム名を付けて勝者の記録に残し、遊んだあと懇親会の画面に戻れるようにする。
 * 端末に残すだけ（localStorage）。読めない・書けないときは何もしない（チーム名が付かないだけ）
 */
const KEY = 'partybox:teamPlay';

export interface TeamPlay {
  eventCode: string;
  team: string;
}

export function setTeamPlay(eventCode: string, team: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ eventCode, team } satisfies TeamPlay));
  } catch {
    // 保存できなくても、ゲームは遊べる
  }
}

export function getTeamPlay(): TeamPlay | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<TeamPlay>;
    return typeof v.eventCode === 'string' && typeof v.team === 'string' && v.eventCode && v.team ? { eventCode: v.eventCode, team: v.team } : null;
  } catch {
    return null;
  }
}

export function clearTeamPlay(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
