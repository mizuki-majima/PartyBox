import { useId } from 'react';

/**
 * 「広告をすり抜けろ！」の当たり判定の見本（説明用の絵。実際のゲームのデータではない）。
 *
 * 左はスマホに配る見た目、右はサーバーだけが持っている当たり判定。
 * 見本の罠は「判定ずれ」: 見えている ✕ の位置と、本当に押せる場所がずれていて、しかも小さい。
 * 座標はゲームと同じ 360×560 の論理座標。
 */

const W = 360;
const H = 560;

/** 見本の罠の形（論理座標） */
const AD = { x: 36, y: 132, w: 288, h: 272 };
const SHOWN_X = { x: 290, y: 140, w: 26, h: 26 };
const REAL_EXIT = { x: 258, y: 170, w: 18, h: 18 };
const BIG_NEXT = { x: 72, y: 324, w: 216, h: 56 };
const TAP = { x: 302, y: 152 };

function Stage({ mode }: { mode: 'visual' | 'zones' }) {
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const zones = mode === 'zones';
  return (
    <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="h-auto w-full" role="img" aria-label={zones ? 'サーバーだけが持つ当たり判定' : 'スマホに見えている画面'}>
      <defs>
        <pattern id={hatchId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="var(--t-accent)" strokeWidth="3" />
        </pattern>
      </defs>
      {/* 画面の枠と、ふつうの記事（何も起きない所） */}
      <rect x="0" y="0" width={W} height={H} fill="var(--t-panel)" stroke="var(--t-fg)" strokeWidth="2" />
      <g opacity={zones ? 0.35 : 1}>
        <rect x="0" y="0" width={W} height="40" fill="var(--t-fg)" />
        <text x="14" y="26" fontSize="15" fontWeight="700" fill="var(--t-bg)">
          まとめ速報 3/8
        </text>
        <rect x="20" y="62" width="240" height="18" fill="var(--t-fg)" />
        {[96, 112, 428, 444, 460, 476].map((y) => (
          <rect key={y} x="20" y={y} width={y % 32 === 0 ? 260 : 310} height="8" fill="var(--t-panel-3)" />
        ))}
        <text x="252" y="532" fontSize="14" fill="var(--t-fg)" textDecoration="underline">
          次のページ →
        </text>
      </g>

      {/* 広告 */}
      <g opacity={zones ? 0.35 : 1}>
        <rect x={AD.x} y={AD.y} width={AD.w} height={AD.h} fill="var(--t-panel-2)" stroke="var(--t-fg)" strokeWidth="2" />
        <text x={AD.x + 20} y={AD.y + 64} fontSize="26" fontWeight="900" fill="var(--t-fg)">
          今だけ 90%OFF!!
        </text>
        <text x={AD.x + 20} y={AD.y + 98} fontSize="14" fill="var(--t-fg)">
          本日かぎり。あと 2 名さま
        </text>
        <text x={AD.x + 20} y={AD.y + 120} fontSize="11" fill="var(--t-muted)">
          広告
        </text>
        <rect x={BIG_NEXT.x} y={BIG_NEXT.y} width={BIG_NEXT.w} height={BIG_NEXT.h} fill="var(--t-fg)" />
        <text x={BIG_NEXT.x + BIG_NEXT.w / 2} y={BIG_NEXT.y + 36} fontSize="22" fontWeight="900" textAnchor="middle" fill="var(--t-bg)">
          次へ ▶
        </text>
        {/* 見えている ✕ */}
        <rect x={SHOWN_X.x} y={SHOWN_X.y} width={SHOWN_X.w} height={SHOWN_X.h} fill="var(--t-panel)" stroke="var(--t-fg)" strokeWidth="1.5" />
        <path
          d={`M${SHOWN_X.x + 7} ${SHOWN_X.y + 7}l12 12M${SHOWN_X.x + 19} ${SHOWN_X.y + 7}l-12 12`}
          stroke="var(--t-fg)"
          strokeWidth="2.5"
        />
      </g>

      {zones && (
        <g>
          {/* 罠（広告が開く）: 広告の面ぜんぶ。見えている ✕ と大きな「次へ ▶」も罠 */}
          <rect x={AD.x} y={AD.y} width={AD.w} height={AD.h} fill={`url(#${hatchId})`} opacity="0.55" />
          <rect x={AD.x} y={AD.y} width={AD.w} height={AD.h} fill="none" stroke="var(--t-accent)" strokeWidth="2" />
          {/* 本物の出口（小さく、ずれた所） */}
          <rect x={REAL_EXIT.x - 3} y={REAL_EXIT.y - 3} width={REAL_EXIT.w + 6} height={REAL_EXIT.h + 6} fill="var(--t-panel)" />
          <rect x={REAL_EXIT.x} y={REAL_EXIT.y} width={REAL_EXIT.w} height={REAL_EXIT.h} fill="var(--t-panel)" stroke="var(--t-fg)" strokeWidth="3" />
          <line x1={REAL_EXIT.x + REAL_EXIT.w} y1={REAL_EXIT.y} x2={SHOWN_X.x} y2={SHOWN_X.y + SHOWN_X.h} stroke="var(--t-fg)" strokeWidth="1.5" strokeDasharray="4 3" />
          <rect x={REAL_EXIT.x - 128} y={REAL_EXIT.y + 28} width="150" height="24" fill="var(--t-fg)" />
          <text x={REAL_EXIT.x - 120} y={REAL_EXIT.y + 45} fontSize="13" fontWeight="700" fill="var(--t-bg)">
            本物の出口（ここだけ）
          </text>
          {/* 記事の「次のページ →」も、この罠では何も起きない所 */}
          <rect x="16" y="416" width="328" height="126" fill="none" stroke="var(--t-fg)" strokeWidth="1.5" strokeDasharray="6 4" />
          <rect x="24" y="424" width="214" height="22" fill="var(--t-panel)" />
          <text x="30" y="440" fontSize="12" fontWeight="700" fill="var(--t-fg)">
            何もない場所（押しても何も起きない）
          </text>
          {/* タップの例 */}
          <circle cx={TAP.x} cy={TAP.y} r="9" fill="none" stroke="var(--t-accent)" strokeWidth="3" />
          <circle cx={TAP.x} cy={TAP.y} r="2.5" fill="var(--t-accent)" />
          <rect x="150" y="84" width="196" height="40" fill="var(--t-accent)" />
          <text x="158" y="100" fontSize="12" fontWeight="700" fill="var(--t-on-accent)">
            tap x=302 y=152 t=820
          </text>
          <text x="158" y="117" fontSize="12" fontWeight="700" fill="var(--t-on-accent)">
            → 罠：広告が開く（3秒）
          </text>
        </g>
      )}
    </svg>
  );
}

export function HitZoneFigure() {
  return (
    <figure className="border-t-4 border-line pt-3" data-testid="tech-hitzone">
      <figcaption className="font-display text-xl leading-tight">例：見えている ✕ と、実際の当たり判定</figcaption>
      <p className="mt-1 text-sm text-muted">説明用の図です（実際のページは、ラウンドごとにサーバーが生成します）。</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-extrabold">スマホに配るもの（見た目だけ）</p>
          <Stage mode="visual" />
        </div>
        <div>
          <p className="mb-2 text-sm font-extrabold">サーバーだけが持つもの（当たり判定）</p>
          <Stage mode="zones" />
        </div>
      </div>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <li className="flex items-center gap-2">
          <span className="inline-block h-4 w-6 shrink-0 border-2 border-fg bg-panel" aria-hidden /> 本物の出口（配らない）
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-6 shrink-0 border-2 border-accent"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--t-accent) 0 2px, transparent 2px 6px)' }}
            aria-hidden
          />
          罠：広告が開く（配らない）
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-4 w-6 shrink-0 border-2 border-dashed border-fg" aria-hidden /> 何もない場所
        </li>
      </ul>
    </figure>
  );
}
