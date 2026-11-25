import type { ReactNode } from 'react';
import type { GameId } from '../../shared/games';

/**
 * アイコン（絵文字の代わり）。線だけの SVG で、色は文字の色（currentColor）に従うので、
 * どのテーマでも周りの文字と同じ色・同じ濃さで出る。飾りなので読み上げからは外す
 */
const PATHS = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.900 1.900 6.500 5.500" />
      <circle cx="17.500" cy="9" r="2.500" />
      <path d="M17.500 14.500c2.200.200 3.600 1.700 4 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.500l3.500 2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
    </>
  ),
  crown: <path d="M3 18h18M4 15l-1-9 5 4 4-6 4 6 5-4-1 9z" />,
  qr: (
    <>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M14 14h2.500v2.500H14zM18 14h2v2M14 18.500h2M18 18h2v2h-2z" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M5 12v8h14v-8" />
    </>
  ),
  play: <path d="M7 4.500v15l12-7.500z" />,
  next: <path d="M5 5v14l9-7zM18 5v14" />,
  undo: <path d="M8 5L3 10l5 5M3 10h11a6 6 0 0 1 0 12h-3" />,
  check: <path d="M4 12.500l5 5L20 6.500" />,
  close: <path d="M5 5l14 14M19 5L5 19" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  pencil: <path d="M4 20l1-4.500L16.500 4 20 7.500 8.500 19zM14 6.500l3.500 3.500" />,
  home: <path d="M3 11.500L12 4l9 7.500M5.500 10v10h13V10M10 20v-6h4v6" />,
  eye: (
    <>
      <path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  repeat: <path d="M4 11V9a4 4 0 0 1 4-4h11M16 2l3 3-3 3M20 13v2a4 4 0 0 1-4 4H5M8 22l-3-3 3-3" />,
  gift: <path d="M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-1.500-4-6-4-6-1.500S9 7 12 7zm0 0c1.500-4 6-4 6-1.500S15 7 12 7z" />,
  phone: (
    <>
      <rect x="7" y="2.500" width="10" height="19" rx="2" />
      <path d="M11 18.500h2" />
    </>
  ),
  signal: <path d="M4 20v-3M9 20v-7M14 20V9M19 20V4" />,
  search: (
    <>
      <circle cx="10.500" cy="10.500" r="6.500" />
      <path d="M15.500 15.500L21 21" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.500 8.500l-2 5-5 2 2-5z" />
    </>
  ),
  wave: <path d="M7 11V6.500a1.500 1.500 0 0 1 3 0V11m0-1V4.500a1.500 1.500 0 0 1 3 0V10m0 0V5.500a1.500 1.500 0 0 1 3 0V12m0-2a1.500 1.500 0 0 1 3 0v4a7 7 0 0 1-7 7c-3 0-4.500-1.500-6-4l-2.500-4.500a1.500 1.500 0 0 1 2.500-1.500L7 13" />,
  quiz: (
    <>
      <path d="M5 3.500h14v17H5z" />
      <path d="M9.500 9a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 .900-1 1.700M12 16.500v.500" />
    </>
  ),
  seat: <path d="M7 3v9h10V3M5 12h14v4H5zM7 16v5M17 16v5" />,
  bingo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.500" />
      <path d="M12 3v5.500M12 15.500V21" />
    </>
  ),
  pause: <path d="M8 5v14M16 5v14" />,
  trophy: <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4c0 3 1.500 4.500 3.500 5M17 6h3c0 3-1.500 4.500-3.500 5M12 14v4M8 21h8M9.500 18h5" />,
  draw: <path d="M4 17c3-6 5 3 8-3s4 2 8-4M5 21h14" />,
  flag: <path d="M5 21V4M5 5c5-3 8 3 14 0v9c-6 3-9-3-14 0" />,
  puzzle: <path d="M9 4h6v3a2 2 0 1 0 4 0h0v6h-3a2 2 0 1 0 0 4h3v3H5v-6h3a2 2 0 1 0 0-4H5V4h4" />,
  headphones: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 14h3v6H4zM17 14h3v6h-3z" />,
  alert: <path d="M12 3l10 18H2zM12 10v5M12 17.500v.500" />,
  spark: <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
} as const satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-[1.1em] w-[1.1em]' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ゲームの印（トップのカードや開始の画面に出す、図形だけの絵）              */
/* ------------------------------------------------------------------ */
type EmblemId = GameId | 'prompt-grand-prix' | 'soon';

/** 色は周りの文字の色と、そのテーマの強調色（--t-accent / --t-ok / --t-hi）から取る */
const EMBLEMS: Record<EmblemId, ReactNode> = {
  // 誰の答えでしょう？: 3枚のメモと「？」
  'whose-answer': (
    <>
      <rect x="10" y="26" width="34" height="42" transform="rotate(-8 27 47)" fill="var(--t-panel)" stroke="currentColor" strokeWidth="3" />
      <rect x="56" y="24" width="34" height="42" transform="rotate(7 73 45)" fill="var(--t-panel)" stroke="currentColor" strokeWidth="3" />
      <rect x="32" y="16" width="38" height="50" fill="var(--t-hi)" stroke="currentColor" strokeWidth="3" />
      <path d="M44 34a7.500 7.500 0 1 1 10.500 6.900c-2.300 1.100-3.500 2.600-3.500 5.100M51 54v1" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // 全員一致を目指せ！: 同じ形が3つそろう
  unanimous: (
    <>
      <rect x="8" y="26" width="26" height="26" fill="var(--t-accent)" stroke="currentColor" strokeWidth="4" />
      <rect x="37" y="26" width="26" height="26" fill="var(--t-accent)" stroke="currentColor" strokeWidth="4" />
      <rect x="66" y="26" width="26" height="26" fill="var(--t-accent)" stroke="currentColor" strokeWidth="4" />
      <path d="M14 39l5 5 9-10M43 39l5 5 9-10M72 39l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 64h84" stroke="currentColor" strokeWidth="4" />
    </>
  ),
  // 嘘つきは誰だ？: 並んだ顔のうち1つだけ仮面
  liar: (
    <>
      <circle cx="22" cy="42" r="13" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="78" cy="42" r="13" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M34 28h32v16a16 16 0 0 1-32 0z" fill="var(--t-accent)" stroke="currentColor" strokeWidth="3" />
      <path d="M40 38h8M52 38h8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M17 40h2M25 40h2M73 40h2M81 40h2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // 回答を育てろ: 絵 → 言葉 → 絵
  'grow-answer': (
    <>
      <rect x="6" y="22" width="26" height="34" fill="var(--t-panel)" stroke="currentColor" strokeWidth="3" />
      <path d="M11 46c4-10 7 2 10-6s4 0 6-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="37" y="22" width="26" height="34" fill="var(--t-hi)" stroke="currentColor" strokeWidth="3" />
      <path d="M42 32h16M42 39h16M42 46h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="68" y="22" width="26" height="34" fill="var(--t-panel)" stroke="currentColor" strokeWidth="3" />
      <circle cx="81" cy="38" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M32 64h6M62 64h6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // 10秒裁判: 木づち
  'ten-sec-trial': (
    <>
      <rect x="34" y="16" width="32" height="18" transform="rotate(-30 50 25)" fill="var(--t-accent)" stroke="currentColor" strokeWidth="3" />
      <path d="M52 34l20 26" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M14 66h44" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M22 58h28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // 懇親会: 波線・三角・丸・四角
  'party-event': (
    <>
      <path d="M8 22q7-10 14 0t14 0 14 0" fill="none" stroke="var(--t-ok)" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 12l16 26H56z" fill="var(--t-hi)" stroke="currentColor" strokeWidth="3" />
      <circle cx="26" cy="54" r="14" fill="var(--t-accent)" stroke="currentColor" strokeWidth="3" />
      <rect x="52" y="46" width="22" height="22" fill="var(--t-panel)" stroke="currentColor" strokeWidth="3" />
      <path d="M80 56q5-7 10 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // プロンプト・グランプリ: 車と市松模様の旗
  'prompt-grand-prix': (
    <>
      <path d="M10 52h70l-8-14H40l-10 8H14z" fill="var(--t-accent)" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="28" cy="56" r="8" fill="var(--t-panel)" stroke="currentColor" strokeWidth="3" />
      <circle cx="64" cy="56" r="8" fill="var(--t-panel)" stroke="currentColor" strokeWidth="3" />
      <path d="M84 12v30" stroke="currentColor" strokeWidth="3" />
      <path d="M84 12h12v6H84zM84 24h12v6H84z" fill="currentColor" />
    </>
  ),
  // 準備中
  soon: (
    <>
      <rect x="20" y="20" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 5" />
      <rect x="54" y="34" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 5" />
    </>
  ),
};

export function GameEmblem({ id, className = 'h-24 w-32' }: { id: string; className?: string }) {
  const art = (EMBLEMS as Record<string, ReactNode | undefined>)[id] ?? EMBLEMS.soon;
  return (
    <svg viewBox="0 0 100 80" className={`shrink-0 ${className}`} aria-hidden>
      {art}
    </svg>
  );
}
