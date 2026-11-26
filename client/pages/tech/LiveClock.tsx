import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';

/**
 * このページを開いている端末とサーバーの間を、その場で測って見せる。
 * - 往復: /api/health を5回たずねた時間の中央値
 * - 時計のずれ: /api/results が返す serverNow（サーバーの時刻）と端末の時刻の差。
 *   ゲームの画面と同じ求め方（serverNow − 受け取った時刻）と、往復の半分で直した値の両方を出す
 * サーバーには何も足していない（もとからある API だけを使う）
 */

interface Measure {
  rtt: number;
  /** ゲームの画面と同じ求め方 */
  offsetApp: number;
  /** 往復の半分で直した値（NTP と同じ考え方） */
  offsetMid: number;
  at: number;
}

const SAMPLES = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function measure(): Promise<Measure> {
  const rtts: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    await res.json();
    rtts.push(performance.now() - t0);
  }
  const sent = Date.now();
  const res = await fetch('/api/results', { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { serverNow?: unknown };
  const received = Date.now();
  if (typeof body.serverNow !== 'number') throw new Error('no serverNow');
  return {
    rtt: median(rtts),
    offsetApp: body.serverNow - received,
    offsetMid: body.serverNow - (sent + received) / 2,
    at: received,
  };
}

const ms = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))} ms`;

export function LiveClock() {
  const [m, setM] = useState<Measure | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setM(await measure());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="border-2 border-line bg-panel p-4" data-testid="tech-live-clock">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-[0.2em] text-accent-ink uppercase">Live</p>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-1 border-2 border-line px-3 text-sm font-extrabold hover:bg-fg hover:text-bg disabled:opacity-50"
        >
          <Icon name="repeat" /> {busy ? '計測中…' : 'もう一度計測'}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">この端末とサーバーの間で、いま計測した値です。</p>
      {failed && <p className="mt-3 text-sm font-bold text-danger-ink">計測できませんでした（サーバーに接続できません）。</p>}
      {m && (
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="border-t border-line pt-2">
            <dt className="text-xs font-bold text-muted">往復時間（{SAMPLES}回の中央値）</dt>
            <dd className="font-display text-3xl tabular-nums">{Math.round(m.rtt)} ms</dd>
          </div>
          <div className="border-t border-line pt-2">
            <dt className="text-xs font-bold text-muted">時計のずれ（ゲーム画面と同じ計算）</dt>
            <dd className="font-display text-3xl tabular-nums">{ms(m.offsetApp)}</dd>
          </div>
          <div className="border-t border-line pt-2">
            <dt className="text-xs font-bold text-muted">時計のずれ（往復時間の半分で補正）</dt>
            <dd className="font-display text-3xl tabular-nums">{ms(m.offsetMid)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
