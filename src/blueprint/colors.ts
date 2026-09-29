/** 色の名前（英語・日本語）→ #rrggbb。LLM が色名で返してきたときの救済用。 */
const NAMED: Record<string, string> = {
  red: '#e53935',
  blue: '#1e88e5',
  green: '#43a047',
  yellow: '#fdd835',
  orange: '#fb8c00',
  purple: '#8e24aa',
  pink: '#f48fb1',
  brown: '#795548',
  black: '#263238',
  white: '#fafafa',
  gray: '#9e9e9e',
  grey: '#9e9e9e',
  silver: '#cfd8dc',
  gold: '#ffc107',
  navy: '#1a237e',
  cyan: '#26c6da',
  skyblue: '#81d4fa',
  lime: '#c6ff00',
  beige: '#e8d5b0',
  赤: '#e53935',
  青: '#1e88e5',
  緑: '#43a047',
  黄: '#fdd835',
  黄色: '#fdd835',
  橙: '#fb8c00',
  紫: '#8e24aa',
  桃色: '#f48fb1',
  茶: '#795548',
  茶色: '#795548',
  黒: '#263238',
  白: '#fafafa',
  灰色: '#9e9e9e',
  銀: '#cfd8dc',
  金: '#ffc107',
};

/** 色っぽい文字列を #rrggbb に。解釈できなければ null */
export function parseColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = /^#?([0-9a-f]{6})$/.exec(v);
  if (long) return `#${long[1]}`;
  return NAMED[v] ?? NAMED[value.trim()] ?? null;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 2 色を t で混ぜる */
export function mixColor(a: string, b: string, t: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

export const lighten = (c: string, t: number) => mixColor(c, '#ffffff', t);
export const darken = (c: string, t: number) => mixColor(c, '#000000', t);

/** 明るい色か（文字色を決めるときなどに使う） */
export function isLight(hex: string): boolean {
  const [r, g, b] = toRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

/** 設計図の「いちばん目立つ色」（順位表の色玉などに使う） */
export function mainColor(bp: { parts: { role?: string; color: string }[] }): string {
  return (bp.parts.find((p) => p.role === 'body') ?? bp.parts[0])?.color ?? '#ff7043';
}
