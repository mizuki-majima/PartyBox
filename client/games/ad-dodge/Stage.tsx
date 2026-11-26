/**
 * 広告をすり抜けろ！ のページ（ブラウザの窓の中身）を描く
 *
 * - サーバーから届くのは見た目（AdElement）だけ。どれが本物かは、この画面は知らない
 * - 押したら、押した場所を論理座標（AD_STAGE_W × AD_STAGE_H）に直して送るだけ。判定はサーバー
 * - 見た目の時間の動き（割り込み広告・スキップの数え・戻るボタン）は、段が始まった時刻（サーバー時刻）からの経過で決める。
 *   サーバーの判定も同じ時刻を使うので、見えているとおりに判定される
 */
import { useContext, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AD_STAGE_H, AD_STAGE_W, type AdElement } from '../../../shared/games/views';
import { ClockContext, useServerNow } from '../../lib/clock';


function visibleAt(el: AdElement, t: number): boolean {
  return (el.from == null || t >= el.from) && (el.until == null || t < el.until);
}

function rectStyle(el: AdElement, t: number): CSSProperties {
  const moved = el.shift && t >= el.shift.at;
  return {
    left: `${((el.x + (moved ? el.shift!.dx : 0)) / AD_STAGE_W) * 100}%`,
    top: `${((el.y + (moved ? el.shift!.dy : 0)) / AD_STAGE_H) * 100}%`,
    width: `${(el.w / AD_STAGE_W) * 100}%`,
    height: `${(el.h / AD_STAGE_H) * 100}%`,
  };
}

/** ✕の印（文字ではなく線で描く。端末の文字によって太さが変わらないように） */
function Cross({ weight = 2.4 }: { weight?: number }) {
  return (
    <svg viewBox="0 0 10 10" className="h-[62%] w-[62%]" aria-hidden>
      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth={weight} strokeLinecap="square" fill="none" />
    </svg>
  );
}

function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`adx-tag absolute ${className}`}>{children}</span>;
}

/** 文字列から決まった数を作る（記事の行の長さなど、毎回同じ見た目にするため） */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function AdSheet({ el }: { el: AdElement }) {
  return (
    <div className={`adx-v${el.variant ?? 0} relative flex h-full w-full flex-col items-center justify-center gap-[3cqw] overflow-hidden px-[5cqw] text-center`}>
      <Tag className="top-[1.5cqw] left-[1.5cqw]">広告</Tag>
      <span className="adx-starburst absolute top-[40%] right-[3%] flex h-[16cqw] w-[16cqw] items-center justify-center text-[3.4cqw] font-bold">
        <span className="adx-blink">今だけ</span>
      </span>
      <p className="adx-ad-text text-[8.4cqw] leading-tight">{el.label}</p>
      <div className="adx-art h-[22%] w-[60%] opacity-70" />
      <p className="text-[4cqw] font-bold">{el.sub}</p>
      {el.cta && <span className="adx-cta px-[6cqw] py-[2.4cqw] text-[4.6cqw]">{el.cta} ▶</span>}
    </div>
  );
}

function Element({ el, t }: { el: AdElement; t: number }) {
  switch (el.shape) {
    case 'sheet':
      if (el.tone === 'cookie') {
        return (
          <div className="adx-cookie flex h-full w-full flex-col gap-[2cqw] px-[5cqw] pt-[4cqw]">
            <p className="text-[4.6cqw] font-bold">{el.label}</p>
            <p className="text-[3.4cqw] leading-snug opacity-80">{el.sub}</p>
          </div>
        );
      }
      return <AdSheet el={el} />;
    case 'banner':
      return (
        <div className={`adx-v${el.variant ?? 0} relative flex h-full w-full items-center justify-center gap-[3cqw] overflow-hidden`}>
          <Tag className="top-[1cqw] right-[1cqw]">{el.sub ?? '広告'}</Tag>
          <span className="adx-starburst flex h-[16cqw] w-[16cqw] shrink-0 items-center justify-center text-[3cqw] font-bold">
            <span className="adx-blink">NEW</span>
          </span>
          <span className="adx-ad-text text-[6.6cqw]">{el.label}</span>
        </div>
      );
    case 'x':
      return (
        <div className={`adx-x-${el.tone ?? 'plain'} flex h-full w-full items-center justify-center`}>
          <Cross weight={el.tone === 'faint' || el.tone === 'ghost' ? 1.6 : 2.4} />
        </div>
      );
    case 'btn':
      if (el.tone === 'loud') {
        return (
          <div className={`adx-loud adx-v${el.variant ?? 1} relative flex h-full w-full items-center justify-center text-[5.4cqw]`}>
            {el.label}
            {el.sub && <Tag className="top-[0.8cqw] right-[1.6cqw]">{el.sub}</Tag>}
          </div>
        );
      }
      return <div className="adx-raised flex h-full w-full items-center justify-center text-[4cqw] font-bold">{el.label}</div>;
    case 'link':
      return (
        <div className={`flex h-full w-full items-center ${el.tone === 'muted' ? 'adx-muted justify-center text-[3.4cqw]' : 'adx-link text-[4cqw] font-bold'}`}>
          {el.label}
        </div>
      );
    case 'text': {
      const left = el.countdownTo != null ? Math.max(1, Math.ceil((el.countdownTo - t) / 1000)) : null;
      return (
        <div className="flex h-full w-full items-center justify-center adx-count text-[3.4cqw] font-bold">
          {el.label}
          {left != null && <span className="ml-[1.5cqw] font-display text-[4.6cqw] tabular-nums">{left}</span>}
        </div>
      );
    }
    case 'video':
      return (
        <div className="adx-video relative flex h-full w-full flex-col overflow-hidden">
          <Tag className="top-[1.5cqw] left-[1.5cqw]">動画広告</Tag>
          <div className={`adx-v${el.variant ?? 0} m-[3cqw] mt-[8cqw] flex flex-1 flex-col items-center justify-center gap-[2cqw] text-center`}>
            <p className="adx-ad-text text-[7cqw]">{el.label}</p>
            <p className="text-[3.6cqw] font-bold">{el.sub}</p>
          </div>
          <div className="adx-progress mx-[3cqw] mb-[14cqw] h-[1.2cqw]">
            <div className="adx-progress-fill h-full" style={{ width: `${Math.min(100, (t / 8000) * 100)}%` }} />
          </div>
        </div>
      );
    case 'alert':
      return (
        <div className="adx-raised flex h-full w-full flex-col p-[0.8cqw]">
          <div className="adx-alert-title flex items-center px-[1.6cqw] py-[1cqw] text-[3.6cqw] font-bold">{el.label}</div>
          <div className="flex flex-1 items-start gap-[3cqw] p-[4cqw]">
            <svg viewBox="0 0 24 22" className="h-[11cqw] w-[11cqw] shrink-0" aria-hidden>
              <path d="M12 1l11 20H1z" fill="#ffff00" stroke="#000" strokeWidth="1.400" strokeLinejoin="round" />
              <path d="M12 8v6M12 16.500v1.500" stroke="#000" strokeWidth="2.200" />
            </svg>
            <p className="text-[3.8cqw] leading-snug">{el.sub}</p>
          </div>
        </div>
      );
    case 'dialog':
      return (
        <div className="adx-dialog flex h-full w-full flex-col overflow-hidden">
          <div className="adx-dialog-head px-[4cqw] py-[3cqw] text-center text-[5cqw] font-bold">{el.label}</div>
          <p className="px-[5cqw] pt-[5cqw] text-center text-[3.8cqw] leading-snug">{el.sub}</p>
        </div>
      );
    case 'toggles':
      return (
        <div className="adx-dialog flex h-full w-full flex-col overflow-hidden">
          <div className="adx-divider border-b px-[5cqw] py-[3.5cqw] text-[5cqw] font-bold">{el.label}</div>
          <ul className="flex flex-col gap-[3.4cqw] px-[5cqw] pt-[4cqw]">
            {(el.sub ?? '').split('|').map((row) => (
              <li key={row} className="flex items-center justify-between text-[3.8cqw]">
                {row}
                <span className="adx-toggle relative inline-block h-[5.6cqw] w-[10cqw]" />
              </li>
            ))}
          </ul>
        </div>
      );
    case 'ghost':
      return <div className="adx-ghost h-full w-full" />;
    case 'landing':
      return (
        <div className={`adx-v${el.variant ?? 0} relative flex h-full w-full flex-col items-center gap-[4cqw] overflow-hidden px-[6cqw] pt-[22cqw] text-center`}>
          <span className="adx-starburst absolute top-[14cqw] right-[4cqw] flex h-[20cqw] w-[20cqw] items-center justify-center text-[3.6cqw] font-bold">
            <span className="adx-blink">当選!</span>
          </span>
          <p className="adx-ad-text adx-blink text-[9cqw] leading-tight">{el.label}</p>
          <p className="max-w-[80%] text-[4.2cqw] font-bold leading-snug">{el.sub}</p>
          <div className="adx-art mt-[2cqw] h-[22%] w-[70%] opacity-60" />
        </div>
      );
  }
}

/** 記事（ページの地）。押しても何も起きない、ふつうのサイトに見える部分 */
function Article({ site, headline }: { site: string; headline: string }) {
  const h = hash(site + headline);
  const hue = h % 360;
  const lines = Array.from({ length: 14 }, (_, i) => 55 + ((h >> (i % 24)) % 40));
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex h-[11.4cqw] items-center px-[4cqw] adx-sitebar text-[4cqw] font-bold" style={{ ["--adx-hue" as string]: hue }}>
        {site.replace('.example', '')}
      </div>
      <div className="flex flex-col gap-[2.4cqw] px-[5cqw] pt-[4cqw]">
        <p className="text-[5.4cqw] leading-snug font-bold">{headline}</p>
        <p className="adx-date text-[3cqw]">2026.11.27　編集部</p>
        <div className="adx-art h-[26cqw] w-full" />
        {lines.map((w, i) => (
          <div key={i} className="adx-line" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function StageCanvas({
  startedAt,
  els,
  article,
  onTap,
  testId,
  stepKey,
  debug,
}: {
  startedAt: number;
  els: AdElement[];
  article?: { site: string; headline: string };
  onTap: (x: number, y: number, t: number) => void;
  testId: string;
  /** 段の見分け（試験で「進んだか」を見るため） */
  stepKey: string;
  /** 通しの試験のときだけ届く、押せば進める場所（本番では null） */
  debug?: { x: number; y: number; at: number; trap?: { x: number; y: number } | null } | null;
}) {
  const offset = useContext(ClockContext);
  const now = useServerNow(50);
  const t = now - startedAt;
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  return (
    <div
      // 幅は外の窓が決める（画面の高さに収まる大きさ）。縦横の比は論理座標と同じ
      className="adx-stage relative w-full overflow-hidden"
      style={{ aspectRatio: `${AD_STAGE_W} / ${AD_STAGE_H}` }}
      data-testid={testId}
      data-key={stepKey}
      data-debug-x={debug?.x}
      data-debug-y={debug?.y}
      data-debug-at={debug ? debug.at - offset : undefined}
      data-debug-trap-x={debug?.trap?.x}
      data-debug-trap-y={debug?.trap?.y}
      // 押した瞬間に送る（click だと指を離すまで待つので遅い）
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * AD_STAGE_W;
        const y = ((e.clientY - rect.top) / rect.height) * AD_STAGE_H;
        onTap(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(Date.now() + offset - startedAt));
        const id = ++seq.current;
        setRipples((r) => [...r.slice(-3), { id, x, y }]);
        setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 500);
      }}
    >
      {article && <Article {...article} />}
      {els.map((el) =>
        visibleAt(el, t) ? (
          <div
            key={el.id}
            className="absolute transition-[top,left] duration-75"
            style={rectStyle(el, t)}
            data-shape={el.shape}
          >
            <Element el={el} t={t} />
          </div>
        ) : null,
      )}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="adx-ripple absolute h-[12cqw] w-[12cqw]"
          style={{ left: `${(r.x / AD_STAGE_W) * 100}%`, top: `${(r.y / AD_STAGE_H) * 100}%` }}
          aria-hidden
        />
      ))}
    </div>
  );
}

