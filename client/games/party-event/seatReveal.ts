import { useEffect, useState } from 'react';

/** 回している時間。長すぎると次の人が待つので、3秒弱にする */
export const REVEAL_MS = 2600;
/** 動きを減らす設定の人には、回さずに少しだけ待って出す */
const REDUCED_MS = 600;

const keyOf = (code: string, personId: string, table: number) => `partybox:seat-revealed:${code}:${personId}:${table}`;

function wasRevealed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function markRevealed(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // 保存できなくても、演出がもう一度出るだけ
  }
}

/**
 * スロットの1コマずつの時刻と名前。速く回して、だんだん遅くし（止まる直前がいちばんドキドキする）、
 * **最後のコマが決まったテーブル**になるように、並びを後ろから逆算する（別の名前で止まってから結果に変わると、がっかりするため）
 */
export function reelSchedule(names: string[], final: string): { at: number; name: string }[] {
  const times: number[] = [];
  let at = 0;
  let delay = 60;
  while (at < REVEAL_MS - 350) {
    times.push(at);
    at += delay;
    delay = Math.min(420, Math.round(delay * 1.14));
  }
  const finalIndex = Math.max(0, names.indexOf(final));
  const n = names.length || 1;
  return times.map((t, k) => ({
    at: t,
    name: names.length ? names[(((finalIndex - (times.length - 1 - k)) % n) + n) % n] : final,
  }));
}

/**
 * 自分の席が「未定 → 決定」になったら、テーブル名をスロットのように回してから出す（自分で引いた・司会が引いた のどちらでも）。
 * 同じ結果は2回演出しない（画面を開き直すたびに待たされないように。sessionStorage に「演出ずみ」を残す）。
 * spinning の間は label に回っているテーブル名が入る。justRevealed は止まった直後の数秒だけ true（紙吹雪を出す）
 */
export function useSeatReveal(
  code: string,
  personId: string | null,
  table: number | null,
  names: string[],
): { spinning: boolean; label: string | null; justRevealed: boolean } {
  const key = personId !== null && table !== null ? keyOf(code, personId, table) : null;
  const [finished, setFinished] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [justRevealed, setJustRevealed] = useState(false);
  const namesKey = names.join('\u0000');
  // 回すかどうかは描画の時点で決める（効果の中で決めると、席が決まった直後の1回の描画で結果が先に見えてしまう）
  const spinning = key !== null && finished !== key && !wasRevealed(key);

  useEffect(() => {
    if (key === null || wasRevealed(key)) return;
    const list = namesKey.split('\u0000');
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    // 動きを減らす設定の人には回さず「？」を出す（ほかのテーブル名を出すと、結果と食い違うため）
    setLabel(reduce ? null : (list[0] ?? null));
    if (!reduce && table !== null) {
      for (const frame of reelSchedule(list, list[table] ?? '')) {
        timers.push(window.setTimeout(() => setLabel(frame.name), frame.at));
      }
    }
    timers.push(
      window.setTimeout(
        () => {
          markRevealed(key);
          setFinished(key);
          setJustRevealed(true);
          try {
            navigator.vibrate?.(120);
          } catch {
            // 震えない端末はそのまま
          }
          timers.push(window.setTimeout(() => setJustRevealed(false), 3500));
        },
        reduce ? REDUCED_MS : REVEAL_MS,
      ),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [key, namesKey, table]);

  return { spinning, label, justRevealed };
}
