import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface DrawingCanvasHandle {
  toDataURL(): string;
  isEmpty(): boolean;
}

interface Point {
  x: number;
  y: number;
}
interface Stroke {
  color: string;
  size: number;
  points: Point[];
}

const W = 800;
const H = 600;
const BG = '#ffffff';
const COLORS = ['#111827', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e', '#9ca3af', '#fcd9b6'];
const SIZES = [
  { value: 4, label: '細' },
  { value: 10, label: '中' },
  { value: 24, label: '太' },
];

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = s.points;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  // 中点を結ぶ二次曲線でなめらかに
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** タッチ・マウス両対応のお絵描きキャンバス */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, { disabled?: boolean }>(function DrawingCanvas({ disabled }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1].value);
  const [eraser, setEraser] = useState(false);
  const [count, setCount] = useState(0);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const redraw = useCallback(() => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);
    for (const s of strokes.current) drawStroke(c, s);
    if (current.current) drawStroke(c, current.current);
  }, []);

  useEffect(() => redraw(), [redraw]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    isEmpty: () => strokes.current.length === 0 && !current.current,
  }));

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * W * 10) / 10,
      y: Math.round(((e.clientY - rect.top) / rect.height) * H * 10) / 10,
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    current.current = { color: eraser ? BG : color, size: eraser ? size * 2 : size, points: [toPoint(e)] };
    redraw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    e.preventDefault();
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) current.current.points.push(toPoint(ev));
    redraw();
  };
  const onUp = () => {
    if (!current.current) return;
    strokes.current.push(current.current);
    current.current = null;
    setCount(strokes.current.length);
    redraw();
  };

  const undo = () => {
    strokes.current.pop();
    setCount(strokes.current.length);
    redraw();
  };
  const clear = () => {
    strokes.current = [];
    setCount(0);
    redraw();
  };

  return (
    <div className="relative z-[1] flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-4 ring-white/10">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={(e) => e.buttons === 0 && onUp()}
          className={`block aspect-[4/3] w-full touch-none select-none ${disabled ? 'opacity-60' : 'cursor-crosshair'}`}
          data-testid="drawing-canvas"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-panel p-2.5 ring-1 ring-line">
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`色 ${c}`}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
              className={`h-8 w-8 rounded-full ring-2 transition ${!eraser && color === c ? 'scale-110 ring-white' : 'ring-white/15'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="mx-1 hidden h-8 w-px bg-line sm:block" />
        <div className="flex gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSize(s.value)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${size === s.value ? 'bg-white text-ink' : 'bg-white/8'}`}
              aria-label={`太さ ${s.label}`}
            >
              <span className="rounded-full bg-current" style={{ width: Math.min(22, s.value), height: Math.min(22, s.value) }} />
            </button>
          ))}
          <button
            onClick={() => setEraser((v) => !v)}
            className={`h-9 rounded-xl px-3 text-sm font-extrabold ${eraser ? 'bg-white text-ink' : 'bg-white/8'}`}
          >
            消しゴム
          </button>
        </div>
        <div className="ml-auto flex gap-1.5">
          <button onClick={undo} disabled={count === 0} className="h-9 rounded-xl bg-white/8 px-3 text-sm font-extrabold disabled:opacity-30">
            ↩ 戻す
          </button>
          <button onClick={clear} disabled={count === 0} className="h-9 rounded-xl bg-white/8 px-3 text-sm font-extrabold disabled:opacity-30">
            全消し
          </button>
        </div>
      </div>
    </div>
  );
});
