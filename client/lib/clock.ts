import { createContext, useContext, useEffect, useState } from 'react';

/** サーバー時刻 − ローカル時刻（ms）。タイマーの表示ずれを補正する */
export const ClockContext = createContext<number>(0);

export function useServerNow(intervalMs = 200): number {
  const offset = useContext(ClockContext);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), intervalMs);
    setNow(Date.now() + offset);
    return () => clearInterval(id);
  }, [offset, intervalMs]);
  return now;
}

/** 締切までの残り時間（ms）。締切なしは null */
export function useRemaining(deadline: number | null): number | null {
  const now = useServerNow();
  if (deadline == null) return null;
  return Math.max(0, deadline - now);
}
