/**
 * 広告をすり抜けろ！ のページ作りと当たり判定（純粋関数。試験の対象）
 *
 * - 1ラウンドのページは、ラウンドの種（seed）から作る。全員が同じ種なので、全員に同じページが同じ順で出る
 * - 1ページ = 罠1つ。ページは1つ以上の「段」でできている（閉じても次が出る広告・確認の窓が2回出る など）
 * - 段 = 見た目（AdElement。スマホに送る）＋ 当たり判定（Zone。サーバーだけが持つ）
 *   本物の「次へ」がどこかはスマホに送らない。スマホは押した場所（論理座標）を送るだけ
 * - 見た目と判定は、段が始まってからの時間で変わることがある（割り込み広告・スキップの待ち時間）
 */
import { AD_STAGE_H, AD_STAGE_W, type AdElement, type AdTrapKind } from '../../../shared/games/views';
import data from '../../data/ad-dodge.json';

/** exit = この段を抜ける / step = 罰なしで次の段へ（逃げる✕など） / trap = 広告が開く */
export type ZoneAct = 'exit' | 'step' | 'trap';

export interface Zone {
  act: ZoneAct;
  x: number;
  y: number;
  w: number;
  h: number;
  from?: number;
  until?: number;
  shift?: { at: number; dx: number; dy: number };
}

export interface StepDef {
  els: AdElement[];
  zones: Zone[];
}

export interface PageDef {
  kind: AdTrapKind;
  site: string;
  headline: string;
  steps: StepDef[];
}

export const TRAP_INFO: Record<AdTrapKind, { label: string; tip: string; tier: 1 | 2 | 3 }> = {
  'tiny-x': { label: '極小の✕', tip: '✕は広告の角に、小さく薄く出ます。広告の真ん中は押さない。', tier: 1 },
  'fake-x': { label: '偽の✕', tip: '広告の枠の中にある✕や「閉じる」は絵です。本物は枠の外の小さな灰色の✕。', tier: 1 },
  'big-next': { label: '大きな「次へ」は広告', tip: '大きくて派手なボタンには小さく「広告」「PR」と書いてあります。本物は記事の中の青い文字。', tier: 1 },
  countdown: { label: '偽のスキップ', tip: '最初から出ている「スキップ」は広告。数え終わってから出るのが本物です。', tier: 2 },
  cookie: { label: 'クッキーの同意', tip: '「すべて同意」は大きく、断る道は小さな灰色の文字に隠れています。', tier: 2 },
  shame: { label: '断りにくいボタン', tip: '「損をしたい」のような言い方の小さな文字が、進むための本物です。', tier: 2 },
  virus: { label: '偽のウイルス警告', tip: 'ページの中に出る警告は絵です。どのボタンも押さず、下の「次のページへ」を。', tier: 2 },
  shift: { label: '割り込み広告', tip: '押す直前に広告が割り込み、ボタンが下にずれます。ずれ終わってから押す。', tier: 3 },
  escape: { label: '逃げる✕', tip: '✕を押すと逃げます。追いかけて3回押せば閉じます（逃げるだけなら罰はなし）。', tier: 3 },
  chain: { label: '閉じても閉じても', tip: '閉じると次の広告が出ます。✕はだんだん小さくなります。', tier: 3 },
  misregister: { label: '判定ずれ', tip: '見えている広告と、押せる場所がずれています。薄い点線の枠の✕が本物。', tier: 3 },
};

export const TRAP_KINDS = Object.keys(TRAP_INFO) as AdTrapKind[];

/* ---------------- 乱数（種から同じ並びを作る） ---------------- */

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32。種が同じなら、どのサーバーでも同じ並びになる */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

/* ---------------- 当たり判定 ---------------- */

/** その時刻の、判定の四角（ずれる広告は、ずれたあとの位置） */
export function zoneRectAt(z: Zone, t: number): { x: number; y: number; w: number; h: number } | null {
  if (z.from != null && t < z.from) return null;
  if (z.until != null && t >= z.until) return null;
  const moved = z.shift && t >= z.shift.at;
  return { x: z.x + (moved ? z.shift!.dx : 0), y: z.y + (moved ? z.shift!.dy : 0), w: z.w, h: z.h };
}

/** 押した場所にある判定のうち、いちばん上（配列の後ろ）のもの。何も無ければ null（罰なし） */
export function hitTest(zones: readonly Zone[], x: number, y: number, t: number): Zone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const r = zoneRectAt(zones[i], t);
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return zones[i];
  }
  return null;
}

/** 試験用: その時刻に押せば進める場所の真ん中 */
export function passPoint(zones: readonly Zone[], t: number): { x: number; y: number } | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z.act === 'trap') continue;
    const r = zoneRectAt(z, t);
    if (!r) continue;
    const p = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    // 上に重なった罠が無いことを確かめる
    if (hitTest(zones, p.x, p.y, t) === z) return p;
  }
  return null;
}

/** 試験用: その時刻に押すと広告が開く場所の真ん中（罠が無ければ null） */
export function trapPoint(zones: readonly Zone[], t: number): { x: number; y: number } | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z.act !== 'trap') continue;
    const r = zoneRectAt(z, t);
    if (!r) continue;
    const p = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    if (hitTest(zones, p.x, p.y, t) === z) return p;
  }
  return null;
}

/* ---------------- ページ作り ---------------- */

type Rect = { x: number; y: number; w: number; h: number };

/** 判定を、見た目より少し大きくする（指で押せるように）。中心は同じ */
function pad(r: Rect, n: number): Rect {
  return { x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 };
}

function zone(act: ZoneAct, r: Rect, extra: Partial<Zone> = {}): Zone {
  return { act, x: r.x, y: r.y, w: r.w, h: r.h, ...extra };
}

interface Ctx {
  rng: Rng;
  /** 段の中の時間（ms）を、ルームの時間の速さに合わせる（試験では短くなる） */
  ms: (n: number) => number;
  id: () => string;
}

function adCopy(c: Ctx) {
  return c.rng.pick(data.ads);
}

function sheetEl(c: Ctx, r: Rect, extra: Partial<AdElement> = {}): AdElement {
  const ad = adCopy(c);
  return { id: c.id(), shape: 'sheet', ...r, label: ad.label, sub: ad.sub, cta: ad.cta, variant: c.rng.int(0, 5), ...extra };
}

/** 広告の四角の角に置く✕の位置 */
function corner(r: Rect, size: number, inset: number, which: 'tr' | 'tl' | 'br' | 'bl'): Rect {
  const x = which.endsWith('r') ? r.x + r.w - inset - size : r.x + inset;
  const y = which.startsWith('t') ? r.y + inset : r.y + r.h - inset - size;
  return { x, y, w: size, h: size };
}

const CORNERS = ['tr', 'tl', 'br', 'bl'] as const;

/** 極小の✕: 全面の広告の角に、小さく薄い✕。広告の残りはすべて罠 */
function tinyX(c: Ctx): StepDef[] {
  const sheet: Rect = { x: 16, y: 56, w: 328, h: 440 };
  const x = corner(sheet, 12, 7, c.rng.pick(['tr', 'tr', 'tl', 'br'] as const));
  return [
    {
      els: [sheetEl(c, sheet), { id: c.id(), shape: 'x', ...x, tone: 'faint' }],
      zones: [zone('trap', sheet), zone('exit', pad(x, 6))],
    },
  ];
}

/** 偽の✕: 枠の中の✕や「閉じる」はすべて絵（罠）。本物は枠の外の小さな灰色の✕ */
function fakeX(c: Ctx): StepDef[] {
  const sheet: Rect = { x: 28, y: 96, w: 304, h: 372 };
  const drawn = corner(sheet, 38, 10, 'tr');
  const red = corner(sheet, 30, 12, 'tl');
  const closeBtn: Rect = { x: sheet.x + 32, y: sheet.y + sheet.h - 70, w: sheet.w - 64, h: 50 };
  const where = c.rng.pick(['above-r', 'above-l', 'below'] as const);
  const real: Rect =
    where === 'above-r'
      ? { x: sheet.x + sheet.w - 18, y: sheet.y - 24, w: 18, h: 18 }
      : where === 'above-l'
        ? { x: sheet.x, y: sheet.y - 24, w: 18, h: 18 }
        : { x: sheet.x + sheet.w / 2 - 28, y: sheet.y + sheet.h + 10, w: 56, h: 20 };
  const realEl: AdElement =
    where === 'below'
      ? { id: c.id(), shape: 'link', ...real, label: '閉じる', tone: 'muted' }
      : { id: c.id(), shape: 'x', ...real, tone: 'plain' };
  // 見た目の並び順は、本物かどうかが分からないように混ぜる（DOM の順で見分けられないように）
  const els = c.rng.shuffle<AdElement>([
    { id: c.id(), shape: 'x', ...drawn, tone: 'drawn' },
    { id: c.id(), shape: 'x', ...red, tone: 'red' },
    { id: c.id(), shape: 'btn', ...closeBtn, label: '✕ 閉じる', tone: 'loud' },
    realEl,
  ]);
  return [{ els: [sheetEl(c, sheet), ...els], zones: [zone('trap', sheet), zone('exit', pad(real, 8))] }];
}

/** 大きな「次へ」は広告: 派手なボタンは広告。本物は記事の中の青い文字のリンク */
function bigNext(c: Ctx): StepDef[] {
  const bigY = c.rng.int(170, 230);
  const big: Rect = { x: 24, y: bigY, w: 312, h: 76 };
  const dl: Rect = { x: 54, y: bigY + 104, w: 252, h: 56 };
  const realY = c.rng.int(420, 500);
  const realLeft = c.rng.next() < 0.5;
  const real: Rect = { x: realLeft ? 24 : 200, y: realY, w: 136, h: 26 };
  const pr: Rect = { x: realLeft ? 200 : 24, y: realY + c.rng.int(-30, 30), w: 136, h: 26 };
  return [
    {
      els: [
        { id: c.id(), shape: 'btn', ...big, label: '次へ進む ▶', sub: '広告', tone: 'loud', variant: 1 },
        { id: c.id(), shape: 'btn', ...dl, label: '無料ダウンロード', sub: 'PR', tone: 'loud', variant: 3 },
        ...c.rng.shuffle<AdElement>([
          { id: c.id(), shape: 'link', ...real, label: '次のページへ →', tone: 'article' },
          { id: c.id(), shape: 'link', ...pr, label: '次のページへ(PR)', tone: 'article' },
        ]),
      ],
      zones: [zone('trap', big), zone('trap', dl), zone('trap', pad(pr, 4)), zone('exit', pad(real, 6))],
    },
  ];
}

/** 割り込み広告: 押そうとした瞬間に広告が割り込み、ボタンが下にずれる。広告はボタンにそっくり */
function shift(c: Ctx): StepDef[] {
  const at = c.ms(c.rng.int(650, 1000));
  const btn: Rect = { x: 60, y: 262, w: 240, h: 56 };
  const banner: Rect = { x: 16, y: 246, w: 328, h: 112 };
  const move = { at, dx: 0, dy: 132 };
  return [
    {
      els: [
        { id: c.id(), shape: 'btn', ...btn, label: '次のページへ', tone: 'plain', shift: move },
        { id: c.id(), shape: 'banner', ...banner, label: '次のページへ ▶', sub: '広告', variant: c.rng.int(0, 5), from: at },
      ],
      zones: [zone('exit', pad(btn, 4), { shift: move }), zone('trap', banner, { from: at })],
    },
  ];
}

/** 逃げる✕: ✕を押すと別の場所へ逃げる（罰なし）。3回目で閉じる */
function escape(c: Ctx): StepDef[] {
  const sheet: Rect = { x: 20, y: 60, w: 320, h: 430 };
  const spots = c.rng.shuffle<Rect>([
    corner(sheet, 26, 8, 'tr'),
    corner(sheet, 26, 8, 'tl'),
    corner(sheet, 26, 8, 'br'),
    corner(sheet, 26, 8, 'bl'),
    { x: sheet.x + sheet.w / 2 - 13, y: sheet.y + 8, w: 26, h: 26 },
    { x: sheet.x + sheet.w - 34, y: sheet.y + sheet.h / 2 - 13, w: 26, h: 26 },
  ]);
  const ad = sheetEl(c, sheet);
  return [0, 1, 2].map((i) => {
    const x = spots[i];
    return {
      els: [{ ...ad, id: c.id() }, { id: c.id(), shape: 'x', ...x, tone: 'plain' }],
      zones: [zone('trap', sheet), zone(i < 2 ? 'step' : 'exit', pad(x, 5))],
    };
  });
}

/** 偽のスキップ: 最初から出ている「スキップ」は広告。数え終わってから隅に出るのが本物 */
function countdown(c: Ctx): StepDef[] {
  const wait = c.ms(4000);
  const video: Rect = { x: 16, y: 84, w: 328, h: 252 };
  const fake: Rect = { x: 40, y: 372, w: 280, h: 62 };
  const real: Rect = { x: video.x + video.w - 134, y: video.y + video.h - 44, w: 126, h: 34 };
  const ad = adCopy(c);
  return [
    {
      els: [
        { id: c.id(), shape: 'video', ...video, label: ad.label, sub: ad.sub, variant: c.rng.int(0, 5) },
        { id: c.id(), shape: 'text', ...real, label: 'スキップまで', countdownTo: wait, until: wait },
        { id: c.id(), shape: 'btn', ...real, label: '広告をスキップ ›', tone: 'plain', from: wait },
        { id: c.id(), shape: 'btn', ...fake, label: 'スキップ ▶▶', sub: '広告', tone: 'loud', variant: 2 },
      ],
      // 待ち時間のあいだに本物の場所を押すと、動画（広告）を押したことになる
      zones: [zone('trap', video), zone('trap', fake), zone('exit', pad(real, 4), { from: wait })],
    },
  ];
}

/** 断りにくいボタン: 進むのは「損をしたい」と書かれた小さな文字。2回目の確認では左右が入れ替わることも */
function shame(c: Ctx): StepDef[] {
  const box: Rect = { x: 30, y: 120, w: 300, h: 300 };
  const join: Rect = { x: 50, y: 318, w: 260, h: 52 };
  const no: Rect = { x: 80, y: 384, w: 200, h: 22 };
  const swap = c.rng.next() < 0.5;
  const left: Rect = { x: 44, y: 340, w: 132, h: 52 };
  const right: Rect = { x: 184, y: 340, w: 132, h: 52 };
  const again = swap ? right : left;
  const yes = swap ? left : right;
  return [
    {
      els: [
        { id: c.id(), shape: 'dialog', ...box, label: '会員登録で特典ゲット!', sub: '登録すると、続きのページが読めます。' },
        { id: c.id(), shape: 'btn', ...join, label: '無料で登録して進む', tone: 'loud', variant: 1 },
        { id: c.id(), shape: 'link', ...no, label: 'いいえ、損をしたいです', tone: 'muted' },
      ],
      zones: [zone('trap', join), zone('step', pad(no, 5))],
    },
    {
      els: [
        { id: c.id(), shape: 'dialog', ...box, label: '本当によろしいですか?', sub: '特典 3,000円ぶんが受け取れなくなります。' },
        { id: c.id(), shape: 'btn', ...again, label: 'やっぱり登録', tone: 'loud', variant: 1 },
        { id: c.id(), shape: 'btn', ...yes, label: 'はい、損します', tone: 'plain' },
      ],
      zones: [zone('trap', again), zone('exit', yes)],
    },
  ];
}

/** 偽のウイルス警告: 警告の窓はどこを押しても広告。本物はページの下の「次のページへ」 */
function virus(c: Ctx): StepDef[] {
  const box: Rect = { x: 24, y: c.rng.int(140, 180), w: 312, h: 214 };
  const del: Rect = { x: box.x + 30, y: box.y + box.h - 50, w: 132, h: 36 };
  const ok: Rect = { x: box.x + 180, y: box.y + box.h - 50, w: 100, h: 36 };
  const title: Rect = { x: box.x + box.w - 26, y: box.y + 5, w: 20, h: 18 };
  const real: Rect = { x: c.rng.int(40, 200), y: c.rng.int(470, 510), w: 136, h: 26 };
  return [
    {
      els: [
        { id: c.id(), shape: 'alert', ...box, label: 'システムの警告', sub: `ウイルスが ${c.rng.int(2, 9)} 件見つかりました。今すぐ削除してください。` },
        { id: c.id(), shape: 'btn', ...del, label: '今すぐ削除', tone: 'plain' },
        { id: c.id(), shape: 'btn', ...ok, label: 'OK', tone: 'plain' },
        { id: c.id(), shape: 'x', ...title, tone: 'title' },
        { id: c.id(), shape: 'link', ...real, label: '次のページへ →', tone: 'article' },
      ],
      zones: [zone('trap', box), zone('exit', pad(real, 6))],
    },
  ];
}

/** 閉じても閉じても: 閉じると次の広告が出る（3つ）。✕はだんだん小さくなる */
function chain(c: Ctx): StepDef[] {
  const sizes = [26, 20, 14];
  return sizes.map((size, i) => {
    const w = c.rng.int(230, 300);
    const h = c.rng.int(230, 320);
    const sheet: Rect = { x: c.rng.int(8, AD_STAGE_W - w - 8), y: c.rng.int(60, AD_STAGE_H - h - 16), w, h };
    const x = corner(sheet, size, 7, c.rng.pick(CORNERS));
    return {
      els: [sheetEl(c, sheet), { id: c.id(), shape: 'x', ...x, tone: i === 2 ? 'faint' : 'plain' }],
      zones: [zone('trap', sheet), zone(i < sizes.length - 1 ? 'step' : 'exit', pad(x, 6))],
    };
  });
}

/** クッキーの同意: 「すべて同意」は罠。「設定を管理する」→「必要なものだけ保存」が本物 */
function cookie(c: Ctx): StepDef[] {
  const panel: Rect = { x: 0, y: 330, w: 360, h: 230 };
  const all: Rect = { x: 24, y: 436, w: 312, h: 54 };
  const manage: Rect = { x: 110, y: 506, w: 140, h: 24 };
  const list: Rect = { x: 20, y: 80, w: 320, h: 400 };
  const save: Rect = { x: 40, y: 380, w: 280, h: 48 };
  const needed: Rect = { x: 90, y: 442, w: 180, h: 24 };
  return [
    {
      els: [
        { id: c.id(), shape: 'sheet', ...panel, tone: 'cookie', label: 'このサイトはクッキーを使います', sub: `よりよい体験のため、パートナー ${c.rng.int(300, 999)} 社とデータを共有します。` },
        { id: c.id(), shape: 'btn', ...all, label: 'すべて同意して続ける', tone: 'loud', variant: 4 },
        { id: c.id(), shape: 'link', ...manage, label: '設定を管理する', tone: 'muted' },
      ],
      zones: [zone('trap', all), zone('step', pad(manage, 5))],
    },
    {
      els: [
        { id: c.id(), shape: 'toggles', ...list, label: 'クッキーの設定', sub: '広告のパーソナライズ|行動の分析|パートナーとの共有|位置情報' },
        { id: c.id(), shape: 'btn', ...save, label: 'すべて同意して保存', tone: 'loud', variant: 4 },
        { id: c.id(), shape: 'link', ...needed, label: '必要なものだけ保存', tone: 'muted' },
      ],
      zones: [zone('trap', save), zone('exit', pad(needed, 5))],
    },
  ];
}

/** 判定ずれ: 広告の絵が、押せる場所からずれて描かれている。薄い点線の枠が本当の位置 */
function misregister(c: Ctx): StepDef[] {
  const real: Rect = { x: c.rng.int(46, 64), y: c.rng.int(76, 100), w: 268, h: 360 };
  const dx = -c.rng.int(20, 26);
  const dy = c.rng.int(20, 26);
  const drawn: Rect = { x: real.x + dx, y: real.y + dy, w: real.w, h: real.h };
  const realX = corner(real, 24, 6, 'tr');
  const drawnX = corner(drawn, 24, 6, 'tr');
  return [
    {
      els: [
        { id: c.id(), shape: 'ghost', ...real },
        { id: c.id(), shape: 'x', ...realX, tone: 'ghost' },
        sheetEl(c, drawn),
        { id: c.id(), shape: 'x', ...drawnX, tone: 'plain' },
      ],
      zones: [zone('trap', real), zone('exit', pad(realX, 5))],
    },
  ];
}

const BUILDERS: Record<AdTrapKind, (c: Ctx) => StepDef[]> = {
  'tiny-x': tinyX,
  'fake-x': fakeX,
  'big-next': bigNext,
  shift,
  escape,
  countdown,
  shame,
  virus,
  chain,
  cookie,
  misregister,
};

/**
 * 1ラウンドのページを作る。罠は重ならないように選び、やさしいものから難しいものへ並べる
 * （同じ段階の中の順番は種で混ぜる）
 */
export function generateRound(seed: number, count: number, ms: (n: number) => number = (n) => n): PageDef[] {
  const rng = createRng(seed);
  let n = 0;
  const c: Ctx = { rng, ms, id: () => `e${++n}` };
  // ページ数が罠の種類より多いときは、2巡目に入る（同じ罠でも位置や文言が変わる）
  const kinds: AdTrapKind[] = [];
  while (kinds.length < count) kinds.push(...rng.shuffle(TRAP_KINDS));
  const ordered = kinds.slice(0, count).sort((a, b) => TRAP_INFO[a].tier - TRAP_INFO[b].tier);
  return ordered.map((kind) => ({
    kind,
    site: rng.pick(data.sites),
    headline: rng.pick(data.headlines),
    steps: BUILDERS[kind](c),
  }));
}

/**
 * 広告を押したあとに開くページ。ロックが解けると左上に小さな「← 戻る」が出る。
 * 大きな「今すぐ受け取る」は、また広告（もう一度ロック）
 */
export function landingStep(rng: Rng, lockMs: number): StepDef {
  const copy = rng.pick(data.landings);
  const bait: Rect = { x: 30, y: rng.int(330, 420), w: 300, h: 66 };
  const back: Rect = { x: 8, y: 8, w: 88, h: 34 };
  return {
    els: [
      { id: 'l1', shape: 'landing', x: 0, y: 0, w: AD_STAGE_W, h: AD_STAGE_H, label: copy.label, sub: copy.sub, variant: rng.int(0, 5) },
      { id: 'l2', shape: 'text', ...back, label: 'もどれるまで', countdownTo: lockMs, until: lockMs },
      { id: 'l3', shape: 'btn', ...back, label: '← 戻る', tone: 'plain', from: lockMs },
      { id: 'l4', shape: 'btn', ...bait, label: '今すぐ受け取る', tone: 'loud', variant: rng.int(0, 5) },
    ],
    zones: [zone('trap', bait), zone('exit', pad(back, 4), { from: lockMs })],
  };
}
