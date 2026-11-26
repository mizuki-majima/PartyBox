import { useEffect } from 'react';

/**
 * 画面を消さないでおく段。嘘つきは誰だ？は1つのお題で何周も話すので、話を聞いている間に
 * スマホが自動でロックすると接続が切れ、自分の番が飛ばされる（3分たつとルームから外れる）ため
 */
const AWAKE_PHASES: Partial<Record<string, ReadonlySet<string>>> = {
  liar: new Set(['ROLE', 'TALK', 'VOTE', 'LIAR_GUESS']),
};

export function keepAwakeIn(gameId: string, phase: string): boolean {
  return AWAKE_PHASES[gameId]?.has(phase) ?? false;
}

/**
 * active の間、画面を消さないよう端末に頼む（Screen Wake Lock）。
 * 使えない端末・断られたときは何もしない。画面を切り替えて戻ってきたら頼み直す（裏に回ると端末が手放すため）
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (stopped) await s.release();
        else sentinel = s;
      } catch {
        // 電池の残りが少ない・設定で止められている などのときは、そのまま
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
