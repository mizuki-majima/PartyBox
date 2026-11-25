import { useEffect, useState } from 'react';

/**
 * 常設の懇親会ルームがあるか（サーバーの設定 room.json）。
 * あるときは、懇親会のルームとデモを新しく作る入口を出さず、「コードで参加」だけを出す
 * （コードを知らない人に、名簿やクイズを見せないため。サーバーでも作れないようにしてある）。
 * 分かるまで・読めなかったときは null（今までどおりの入口を出す）
 */
export function useFixedEventRoom(): boolean | null {
  const [fixed, setFixed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/event', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ fixedRoom?: unknown }>) : null))
      .then((body) => {
        if (!cancelled && body) setFixed(body.fixedRoom === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return fixed;
}
