import type { CarStats, WheelStyle } from '../blueprint/types';
import { darken, lighten } from '../blueprint/colors';
import type { Rng } from '../util/rng';
import type { Palette } from './palettes';
import { PartList } from './parts';

/**
 * 車の「形の型」。基本図形の組み合わせで作り、寸法は mods で伸び縮みさせる。
 * 牛車や屋台のような、車の形をしていない乗り物もここに入れる。
 */

export interface Mods {
  /** 長さ・高さ・幅の倍率 */
  length: number;
  height: number;
  width: number;
  /** 全体の倍率（最終的な大きさは組み立て時に範囲内へ収め直される） */
  scale: number;
  /** 角の丸みの倍率（1 が標準、0.2 でシャープ、1.6 でまんまる） */
  round: number;
  /** 車輪の大きさの倍率 */
  wheel: number;
}

export const DEFAULT_MODS: Mods = { length: 1, height: 1, width: 1, scale: 1, round: 1, wheel: 1 };

/** アドオン（飾り）を付けるための目印 */
export interface Anchors {
  frontX: number;
  backX: number;
  halfW: number;
  /** 屋根の上面の高さと中心 */
  roofY: number;
  roofX: number;
  roofLen: number;
  roofW: number;
  /** 車体（ボンネット）の上面 */
  bodyTopY: number;
  /** 顔（ライトや目）を付ける高さ */
  faceY: number;
  /** ボンネットの中心 X */
  hoodX: number;
}

export interface TemplateContext {
  rng: Rng;
  pal: Palette;
  mods: Mods;
  variant?: string;
  /** 入力文で色や配色が指定されたか（されていなければ型ごとの定番色を使ってよい） */
  customColor: boolean;
  list: PartList;
}

export type AnimalKind = 'cat' | 'dog' | 'rabbit' | 'bear' | 'panda' | 'pig' | 'frog';
export const ANIMAL_KINDS: AnimalKind[] = ['cat', 'dog', 'rabbit', 'bear', 'panda', 'pig', 'frog'];

export interface Archetype {
  id: string;
  /** 概要文で使う呼び名 */
  noun: string;
  stats: CarStats;
  wheelStyle: WheelStyle;
  suffixes: string[];
  personality: string[];
  catchphrase: string[];
  /** 最初から付いている飾り */
  addons?: string[];
  /** 車体の色をパレットより優先したいとき（例: 新幹線は白） */
  palette?: Partial<Palette>;
  build(ctx: TemplateContext): Anchors;
}

/** 丸みの倍率をかけて 0〜1 に収める */
function rd(ctx: TemplateContext, base: number): number {
  return Math.min(1, Math.max(0, base * ctx.mods.round));
}

function dims(ctx: TemplateContext, L: number, W: number, H = 1) {
  const m = ctx.mods;
  return { L: L * m.length * m.scale, W: W * m.width * m.scale, H: H * m.height * m.scale, s: m.scale };
}

function headlights(ctx: TemplateContext, x: number, y: number, z: number, r: number) {
  ctx.list.pair((side) => ctx.list.sph(r, [x, y, z * side], '#fff59d', 'light'));
}

function taillights(ctx: TemplateContext, x: number, y: number, z: number, s: number) {
  ctx.list.pair((side) => ctx.list.box([0.05, 0.08 * s, 0.2 * s], [x, y, z * side], '#ff5252', 'light', { round: 0.4 }));
}

function wheels4(ctx: TemplateContext, r: number, t: number, xf: number, xb: number, z: number, rb = r) {
  const col = ctx.pal.wheel;
  for (const side of [1, -1]) {
    ctx.list.wheel(r, t, [xf, r, z * side], col);
    ctx.list.wheel(rb, t, [xb, rb, z * side], col);
  }
}

// ───────────────────────── テンプレート ─────────────────────────

const compact: Archetype = {
  id: 'compact',
  noun: 'ミニカー',
  stats: { speed: 5, acceleration: 7, handling: 6, stability: 6 },
  wheelStyle: 'normal',
  suffixes: ['号', 'くん', 'ダッシュ', 'マル', 'GO', 'ボーイ', 'ミニ'],
  personality: ['元気いっぱいの優等生', 'ちょこまか動くのが得意', '負けず嫌いのがんばり屋', 'いつでもマイペース'],
  catchphrase: ['いっくぞー！', 'ぶっちぎるよ！', 'ブンブン！', 'まだまだ〜！'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 1.8, 1.1);
    const { list, pal } = ctx;
    const wr = 0.34 * ctx.mods.wheel * s;
    const bodyH = 0.55 * H;
    const bottom = wr * 0.75;
    const bodyY = bottom + bodyH / 2;
    const bodyTop = bottom + bodyH;
    const cabL = L * 0.56;
    const cabH = 0.48 * H;
    const cabW = W * 0.84;
    const cabX = -L * 0.08;
    const cabY = bodyTop + cabH / 2 - 0.03;
    list.box([L, bodyH, W], [0, bodyY, 0], pal.body, 'body', { round: rd(ctx, 0.55) });
    list.box([cabL, cabH, cabW], [cabX, cabY, 0], pal.cabin, 'cabin', { round: rd(ctx, 0.7) });
    list.box([cabL * 1.03, cabH * 0.46, cabW * 0.8], [cabX, cabY + cabH * 0.06, 0], pal.window, 'window', { round: rd(ctx, 0.5) });
    list.box([cabL * 0.8, cabH * 0.46, cabW * 1.03], [cabX, cabY + cabH * 0.06, 0], pal.window, 'window', { round: rd(ctx, 0.5) });
    headlights(ctx, L / 2 - 0.03, bodyY + bodyH * 0.12, W * 0.3, 0.1 * s);
    taillights(ctx, -L / 2, bodyY + bodyH * 0.15, W * 0.32, s);
    list.box([0.14 * s, bodyH * 0.32, W * 1.02], [L / 2 + 0.02, bottom + bodyH * 0.12, 0], pal.trim, 'bumper', { round: rd(ctx, 0.8) });
    list.box([0.14 * s, bodyH * 0.32, W * 1.02], [-L / 2 - 0.02, bottom + bodyH * 0.12, 0], pal.trim, 'bumper', { round: rd(ctx, 0.8) });
    wheels4(ctx, wr, 0.28 * s, L * 0.3, -L * 0.3, W / 2 - 0.04);
    return {
      frontX: L / 2,
      backX: -L / 2,
      halfW: W / 2,
      roofY: cabY + cabH / 2,
      roofX: cabX,
      roofLen: cabL,
      roofW: cabW,
      bodyTopY: bodyTop,
      faceY: bodyY + bodyH * 0.12,
      hoodX: L * 0.34,
    };
  },
};

const sports: Archetype = {
  id: 'sports',
  noun: 'スポーツカー',
  stats: { speed: 8, acceleration: 6, handling: 5, stability: 5 },
  wheelStyle: 'sporty',
  suffixes: ['GT', 'R', 'Z', 'RS', 'ターボ', 'エボ', 'スペシャル'],
  personality: ['負けず嫌いのスピード狂', 'クールに見えて熱い', '直線番長', 'ちょっと目立ちたがり'],
  catchphrase: ['前だけ見てろ！', '置いていくぜ', '風になる！', 'アクセル全開！'],
  addons: ['spoiler'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 2.2, 1.1);
    const { list, pal } = ctx;
    const wr = 0.3 * ctx.mods.wheel * s;
    const bodyH = 0.36 * H;
    const bottom = wr * 0.7;
    const bodyY = bottom + bodyH / 2;
    const bodyTop = bottom + bodyH;
    const cabH = 0.3 * H;
    const cabY = bodyTop + cabH * 0.4;
    list.box([L, bodyH, W], [0, bodyY, 0], pal.body, 'body', { round: rd(ctx, 0.35) });
    list.box([L * 0.28, bodyH * 0.55, W * 0.97], [L * 0.44, bottom + bodyH * 0.3, 0], pal.body, 'body', {
      rotation: [0, 0, -8],
      round: rd(ctx, 0.3),
    });
    list.box([L * 1.005, bodyH * 1.02, W * 0.14], [0, bodyY, 0], pal.accent, 'deco', { round: rd(ctx, 0.35) });
    list.box([L * 0.4, cabH, W * 0.78], [-L * 0.06, cabY, 0], darken(pal.window, 0.35), 'window', { material: 'glass', round: rd(ctx, 0.7) });
    list.pair((side) => list.box([0.05, 0.07 * s, 0.22 * s], [L / 2 + 0.01, bodyY + 0.02, W * 0.32 * side], '#fffde7', 'light', { round: 0.3 }));
    taillights(ctx, -L / 2, bodyY + 0.04, W * 0.3, s);
    list.cyl(0.05 * s, 0.2 * s, [-L / 2 - 0.06, bottom + 0.05, W * 0.24], '#b0bec5', 'exhaust', { rotation: [0, 0, 90], material: 'metal' });
    wheels4(ctx, wr, 0.26 * s, L * 0.3, -L * 0.3, W / 2, wr * 1.08);
    return {
      frontX: L / 2,
      backX: -L / 2,
      halfW: W / 2,
      roofY: cabY + cabH / 2,
      roofX: -L * 0.06,
      roofLen: L * 0.4,
      roofW: W * 0.78,
      bodyTopY: bodyTop,
      faceY: bodyY,
      hoodX: L * 0.3,
    };
  },
};

const formula: Archetype = {
  id: 'formula',
  noun: 'フォーミュラカー',
  stats: { speed: 9, acceleration: 6, handling: 6, stability: 3 },
  wheelStyle: 'sporty',
  suffixes: ['F1', 'レーサー', 'GP', 'R', 'ワン'],
  personality: ['レースのために生まれた', 'ストイックな職人肌', '勝つことしか考えていない'],
  catchphrase: ['ポールポジションはいただく', 'コンマ1秒を削り出す', 'ラップタイムがすべてだ'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 2.4, 1.0);
    const { list, pal } = ctx;
    const wf = 0.28 * ctx.mods.wheel * s;
    const wb = 0.34 * ctx.mods.wheel * s;
    const y = 0.42 * H;
    list.capsule(0.17 * H, L * 0.55, [L * 0.12, y, 0], pal.body, 'body', { rotation: [0, 0, 90] });
    list.box([L * 0.38, 0.32 * H, 0.5 * W], [-L * 0.12, y + 0.02, 0], pal.body, 'body', { round: rd(ctx, 0.5) });
    list.pair((side) => list.box([L * 0.3, 0.26 * H, 0.26 * s], [-L * 0.15, y - 0.06, 0.36 * W * side], pal.accent, 'body', { round: rd(ctx, 0.6) }));
    list.sph(0.16 * s, [-L * 0.08, y + 0.28 * H, 0], pal.accent, 'deco');
    list.sph([0.1 * s, 0.07 * s, 0.13 * s], [-L * 0.08 + 0.08, y + 0.3 * H, 0], darken(pal.window, 0.4), 'window', { material: 'glass' });
    list.box([0.28 * s, 0.05 * s, 1.3 * W], [L * 0.44, 0.16 * s, 0], pal.trim, 'spoiler', { round: 0.1 });
    list.box([0.3 * s, 0.06 * s, 1.05 * W], [-L * 0.42, y + 0.5 * H, 0], pal.accent, 'spoiler', { round: 0.1 });
    list.pair((side) => list.box([0.05, 0.4 * H, 0.05], [-L * 0.42, y + 0.28 * H, 0.25 * W * side], '#263238', 'spoiler', { round: 0 }));
    list.box([L * 0.2, 0.25 * H, 0.3 * s], [-L * 0.3, y + 0.12, 0], pal.body, 'body', { round: rd(ctx, 0.6) });
    wheels4(ctx, wf, 0.26 * s, L * 0.33, -L * 0.3, 0.62 * W, wb);
    return {
      frontX: L / 2 + 0.1,
      backX: -L / 2,
      halfW: 0.35 * W,
      roofY: y + 0.45 * H,
      roofX: -L * 0.08,
      roofLen: 0.4,
      roofW: 0.4,
      bodyTopY: y + 0.18 * H,
      faceY: y,
      hoodX: L * 0.25,
    };
  },
};

const truck: Archetype = {
  id: 'truck',
  noun: '軽トラ',
  stats: { speed: 5, acceleration: 5, handling: 5, stability: 9 },
  wheelStyle: 'normal',
  suffixes: ['号', 'トラ', 'ライナー', '丸', 'ワークス'],
  personality: ['働き者で力持ち', '畑から直行してきた', '寡黙な職人', 'おおらかで細かいことは気にしない'],
  catchphrase: ['荷台は満載だ！', 'よっこいしょ', '朝採れ野菜、お届けだべ', 'のんびり行くべ'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 2.1, 1.1);
    const { list, pal, rng } = ctx;
    const wr = 0.3 * ctx.mods.wheel * s;
    const bottom = wr * 0.8;
    const cabL = L * 0.36;
    const cabH = 0.85 * H;
    const cabX = L * 0.32;
    list.box([cabL, cabH, W], [cabX, bottom + cabH / 2, 0], pal.body, 'body', { round: rd(ctx, 0.45) });
    list.box([cabL * 1.03, cabH * 0.34, W * 0.82], [cabX, bottom + cabH * 0.68, 0], pal.window, 'window', { round: rd(ctx, 0.4) });
    list.box([cabL * 0.72, cabH * 0.34, W * 1.03], [cabX, bottom + cabH * 0.68, 0], pal.window, 'window', { round: rd(ctx, 0.4) });
    const bedL = L * 0.62;
    const bedX = -L * 0.19;
    list.box([bedL, 0.18 * s, W], [bedX, bottom + 0.09 * s, 0], pal.accent, 'body', { round: rd(ctx, 0.2) });
    list.pair((side) => list.box([bedL, 0.26 * H, 0.06 * s], [bedX, bottom + 0.3 * H, (W / 2 - 0.03) * side], pal.accent, 'body', { round: 0.2 }));
    list.box([0.06 * s, 0.26 * H, W], [-L / 2 + 0.03, bottom + 0.3 * H, 0], pal.accent, 'body', { round: 0.2 });
    // 荷台の積み荷
    const cargo = ctx.variant ?? rng.pick(['watermelon', 'boxes', 'hay', 'veggies']);
    const cy = bottom + 0.18 * s;
    if (cargo === 'gifts') {
      list.box([0.38 * s, 0.34 * s, 0.38 * s], [bedX + 0.12, cy + 0.17 * s, 0.14 * s], '#e53935', 'deco', { round: 0.15 });
      list.box([0.39 * s, 0.35 * s, 0.08 * s], [bedX + 0.12, cy + 0.17 * s, 0.14 * s], '#ffd54f', 'deco', { round: 0.1 });
      list.box([0.32 * s, 0.3 * s, 0.32 * s], [bedX - 0.32 * s, cy + 0.15 * s, -0.16 * s], '#43a047', 'deco', { round: 0.15 });
      list.box([0.08 * s, 0.31 * s, 0.33 * s], [bedX - 0.32 * s, cy + 0.15 * s, -0.16 * s], '#fafafa', 'deco', { round: 0.1 });
    } else if (cargo === 'watermelon') {
      list.sph(0.26 * s, [bedX, cy + 0.24 * s, 0], '#2e7d32', 'deco');
      list.sph(0.2 * s, [bedX - 0.4 * s, cy + 0.18 * s, 0.2 * s], '#388e3c', 'deco');
    } else if (cargo === 'boxes') {
      list.box([0.4 * s, 0.34 * s, 0.4 * s], [bedX + 0.1, cy + 0.17 * s, 0.15 * s], '#c8a165', 'deco', { round: 0.1 });
      list.box([0.34 * s, 0.28 * s, 0.34 * s], [bedX - 0.35 * s, cy + 0.14 * s, -0.18 * s], '#d7b27a', 'deco', { round: 0.1 });
    } else if (cargo === 'hay') {
      list.cyl(0.24 * s, 0.7 * s, [bedX, cy + 0.24 * s, 0], '#f2cf5b', 'deco', { rotation: [90, 0, 0], material: 'cloth' });
    } else {
      list.sph(0.16 * s, [bedX + 0.2, cy + 0.14 * s, 0.15 * s], '#ff7043', 'deco');
      list.sph(0.14 * s, [bedX - 0.1, cy + 0.12 * s, -0.2 * s], '#8bc34a', 'deco');
      list.sph(0.15 * s, [bedX - 0.4 * s, cy + 0.13 * s, 0.1 * s], '#ab47bc', 'deco');
    }
    headlights(ctx, cabX + cabL / 2, bottom + cabH * 0.25, W * 0.32, 0.09 * s);
    list.box([0.12 * s, 0.14 * s, W * 1.02], [cabX + cabL / 2 + 0.03, bottom + 0.05, 0], pal.trim, 'bumper', { round: 0.8 });
    wheels4(ctx, wr, 0.26 * s, L * 0.3, -L * 0.28, W / 2 - 0.02);
    return {
      frontX: cabX + cabL / 2,
      backX: -L / 2,
      halfW: W / 2,
      roofY: bottom + cabH,
      roofX: cabX,
      roofLen: cabL,
      roofW: W,
      bodyTopY: bottom + 0.4 * H,
      faceY: bottom + cabH * 0.25,
      hoodX: cabX,
    };
  },
};

const bus: Archetype = {
  id: 'bus',
  noun: 'ワゴン',
  stats: { speed: 5, acceleration: 4, handling: 5, stability: 10 },
  wheelStyle: 'normal',
  suffixes: ['号', 'ライナー', 'エクスプレス', 'ファミリー', 'ボックス'],
  personality: ['みんなを乗せて走る頼れる兄貴', '安全運転がモットー', '大らかで面倒見がいい'],
  catchphrase: ['発車オーライ！', '次は〜ゴール、ゴールです', '安全第一！', 'みんな乗った？'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 2.2, 1.05);
    const { list, pal } = ctx;
    const wr = 0.28 * ctx.mods.wheel * s;
    const bottom = wr * 0.7;
    const bodyH = 1.0 * H;
    list.box([L, bodyH, W], [0, bottom + bodyH / 2, 0], pal.body, 'body', { round: rd(ctx, 0.45) });
    list.box([L * 0.86, bodyH * 0.3, W * 1.02], [-L * 0.02, bottom + bodyH * 0.68, 0], pal.window, 'window', { round: rd(ctx, 0.4) });
    list.box([L * 1.01, bodyH * 0.34, W * 0.84], [0, bottom + bodyH * 0.66, 0], pal.window, 'window', { round: rd(ctx, 0.4) });
    list.box([L * 1.01, bodyH * 0.1, W * 1.02], [0, bottom + bodyH * 0.35, 0], pal.accent, 'deco', { round: rd(ctx, 0.3) });
    list.box([L * 0.96, 0.07 * s, W * 0.96], [0, bottom + bodyH + 0.01, 0], pal.cabin, 'roof', { round: rd(ctx, 0.6) });
    headlights(ctx, L / 2 - 0.02, bottom + bodyH * 0.18, W * 0.32, 0.09 * s);
    taillights(ctx, -L / 2, bottom + bodyH * 0.2, W * 0.34, s);
    list.box([0.12 * s, 0.14 * s, W * 1.02], [L / 2 + 0.03, bottom + 0.04, 0], pal.trim, 'bumper', { round: 0.8 });
    wheels4(ctx, wr, 0.26 * s, L * 0.33, -L * 0.33, W / 2 - 0.02);
    return {
      frontX: L / 2,
      backX: -L / 2,
      halfW: W / 2,
      roofY: bottom + bodyH + 0.04,
      roofX: 0,
      roofLen: L * 0.9,
      roofW: W * 0.9,
      bodyTopY: bottom + bodyH,
      faceY: bottom + bodyH * 0.18,
      hoodX: L * 0.3,
    };
  },
};

const gissha: Archetype = {
  id: 'gissha',
  noun: '牛車',
  stats: { speed: 3, acceleration: 4, handling: 7, stability: 10 },
  wheelStyle: 'wooden',
  suffixes: ['号', '丸', '之助', '衛門'],
  personality: ['のんびり屋。でも最後まで諦めない', '雅を愛する風流人', '義理と人情に厚い'],
  catchphrase: ['急がば回れでござる', 'いざ、参る！', 'よきにはからえ', 'もぉ〜、負けぬでござる'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 1.0, 1.0);
    const { list, pal, rng } = ctx;
    const wr = 0.55 * ctx.mods.wheel * s;
    const cx = -0.2 * L;
    list.box([1.3 * L, 0.8 * H, W], [cx, 0.95 * H, 0], pal.body, 'body', { material: 'wood', round: rd(ctx, 0.1) });
    list.sph([0.8 * L, 0.26 * H, 0.66 * W], [cx, 0.95 * H + 0.43 * H, 0], darken(pal.cabin, 0.4), 'roof');
    list.box([1.66 * L, 0.05, 1.3 * W], [cx, 1.37 * H, 0], pal.cabin, 'roof', { material: 'wood', round: 0 });
    list.box([0.04, 0.5 * H, 0.8 * W], [cx + 0.66 * L, 0.98 * H, 0], pal.window, 'deco', { material: 'cloth', round: 0 });
    list.pair((side) => list.sph(0.08 * s, [cx + 0.7 * L, 1.2 * H, 0.45 * W * side], pal.accent, 'deco'));
    list.pair((side) => list.wheel(wr, 0.12 * s, [cx, wr, (0.5 * W + 0.12) * side], pal.wheel, 'wood'));
    list.pair((side) => list.box([1.3 * s, 0.06, 0.06], [cx + 1.15 * L, 0.62 * s, 0.3 * s * side], darken(pal.body, 0.3), 'deco', { material: 'wood', round: 0 }));
    // 牛
    const ox = rng.pick(['#3e3e3e', '#6d4c41', '#f5f5f5']);
    const ox2 = ox === '#f5f5f5' ? '#3e3e3e' : ox;
    const oxX = cx + 1.8 * L;
    list.sph([0.42 * s, 0.32 * s, 0.28 * s], [oxX, 0.6 * s, 0], ox, 'deco');
    list.sph(0.2 * s, [oxX + 0.4 * s, 0.72 * s, 0], ox, 'deco');
    list.sph([0.08 * s, 0.06 * s, 0.1 * s], [oxX + 0.56 * s, 0.66 * s, 0], '#f8bbd0', 'deco');
    list.pair((side) => list.cone(0.04 * s, 0.2 * s, [oxX + 0.4 * s, 0.92 * s, 0.12 * s * side], '#fff8e1', 'deco', { rotation: [-35 * side, 0, 0] }));
    for (const dx of [-0.2, 0.2]) {
      list.pair((side) => list.cyl(0.06 * s, 0.4 * s, [oxX + dx * s, 0.2 * s, 0.15 * s * side], ox2, 'deco'));
    }
    return {
      frontX: oxX + 0.6 * s,
      backX: cx - 0.65 * L,
      halfW: 0.5 * W,
      roofY: 1.6 * H,
      roofX: cx,
      roofLen: 1.2 * L,
      roofW: 0.9 * W,
      bodyTopY: 1.35 * H,
      faceY: 0.72 * s,
      hoodX: oxX,
    };
  },
};

const yatai: Archetype = {
  id: 'yatai',
  noun: '屋台カー',
  stats: { speed: 4, acceleration: 6, handling: 6, stability: 8 },
  wheelStyle: 'wooden',
  suffixes: ['号', '屋', '亭', '丸', 'スペシャル'],
  personality: ['人情に厚い。おなかがすくと本気を出す', 'お祭り大好き', '商売上手のおしゃべり好き'],
  catchphrase: ['へい、らっしゃい！', 'できたてアツアツ！', '売り切れ御免！', 'いい匂いでしょ？'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 1.0, 1.0);
    const { list, pal } = ctx;
    const wr = 0.42 * ctx.mods.wheel * s;
    list.box([1.6 * L, 0.5 * H, W], [0, wr + 0.18 * H, 0], pal.body, 'body', { material: 'wood', round: rd(ctx, 0.1) });
    const top = wr + 0.43 * H;
    list.box([1.7 * L, 0.08, 1.1 * W], [0, top + 0.04, 0], darken(pal.body, 0.3), 'body', { material: 'wood', round: 0 });
    for (const x of [0.75, -0.75]) {
      list.pair((side) => list.box([0.06, 0.8 * H, 0.06], [x * L, top + 0.46 * H, 0.48 * W * side], darken(pal.body, 0.4), 'deco', { material: 'wood', round: 0 }));
    }
    const roofY = top + 0.9 * H;
    list.box([1.9 * L, 0.14 * s, 1.35 * W], [0, roofY, 0], pal.accent, 'roof', { round: rd(ctx, 0.3) });
    list.pair((side) => list.box([1.5 * L, 0.32 * H, 0.03], [0, roofY - 0.23 * H, 0.52 * W * side], pal.cabin, 'deco', { material: 'cloth', round: 0 }));
    list.sph([0.14 * s, 0.2 * s, 0.14 * s], [0.88 * L, roofY - 0.35 * H, 0.56 * W], '#ff7043', 'light');
    // 売り物
    const goods = ctx.variant ?? 'ramen';
    const gx = -0.3 * L;
    if (goods === 'takoyaki') {
      list.box([0.6 * s, 0.1 * s, 0.4 * s], [gx, top + 0.13, 0], '#424242', 'deco', { material: 'metal', round: 0.2 });
      for (const [dx, dz] of [[-0.15, -0.08], [0, 0.08], [0.15, -0.08]]) list.sph(0.07 * s, [gx + dx * s, top + 0.22, dz * s], '#c77d3a', 'deco');
    } else {
      const soup = goods === 'curry' ? '#d18a00' : goods === 'oden' ? '#c8a165' : '#f0c27b';
      list.cyl(0.26 * s, 0.3 * s, [gx, top + 0.23 * s, 0], '#b0bec5', 'deco', { material: 'metal' });
      list.cyl(0.24 * s, 0.03, [gx, top + 0.38 * s, 0], soup, 'deco');
      list.sph(0.09 * s, [gx, top + 0.52 * s, 0], '#ffffff', 'deco');
      list.sph(0.07 * s, [gx + 0.06 * s, top + 0.66 * s, 0.04 * s], '#ffffff', 'deco');
    }
    list.pair((side) => list.box([0.6 * s, 0.05, 0.05], [0.8 * L + 0.25 * s, wr + 0.3 * H, 0.4 * W * side], darken(pal.body, 0.4), 'deco', { material: 'wood', round: 0 }));
    list.pair((side) => list.wheel(wr, 0.1 * s, [-0.1 * L, wr, (0.5 * W + 0.08) * side], pal.wheel, 'wood'));
    return {
      frontX: 0.8 * L,
      backX: -0.8 * L,
      halfW: 0.5 * W,
      roofY: roofY + 0.07 * s,
      roofX: 0,
      roofLen: 1.6 * L,
      roofW: 1.1 * W,
      bodyTopY: top,
      faceY: wr + 0.25 * H,
      hoodX: 0.35 * L,
    };
  },
};

const ufo: Archetype = {
  id: 'ufo',
  noun: 'UFOカー',
  stats: { speed: 7, acceleration: 5, handling: 9, stability: 3 },
  wheelStyle: 'none',
  suffixes: ['号', 'X', 'ギャラクシー', 'スター', 'コスモ'],
  personality: ['地球の重力にまだ慣れていない', '好奇心のかたまり', '宇宙規模のマイペース'],
  catchphrase: ['ワレワレハ、ハヤイ', 'ピコピコピー', '地球のレース、たのしい', 'ワープ準備よし'],
  palette: { body: '#b0bec5', window: '#80deea', bodyMaterial: 'metal' },
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 1.0, 1.0);
    const { list, pal } = ctx;
    const y = 0.5 * H;
    list.sph([1.0 * L, 0.24 * H, 1.0 * W], [0, y, 0], pal.body, 'body', { material: pal.bodyMaterial ?? 'metal' });
    list.sph(0.45 * s, [0, y + 0.22 * H, 0], pal.window, 'window', { material: 'glass' });
    list.sph(0.16 * s, [0.05, y + 0.36 * H, 0], '#9ccc65', 'deco');
    list.torus(0.86 * L, 0.05 * s, [0, y, 0], pal.accent, 'light', { rotation: [90, 0, 0] });
    for (const [x, z] of [[0.72, 0], [-0.72, 0], [0, 0.72], [0, -0.72]]) list.sph(0.07 * s, [x * L, y - 0.08 * H, z * W], '#ffeb3b', 'light');
    list.cone(0.35 * s, 0.3 * s, [0, y - 0.22 * H, 0], darken(pal.body, 0.2), 'body', { rotation: [180, 0, 0], material: 'metal' });
    return {
      frontX: 1.0 * L,
      backX: -1.0 * L,
      halfW: 1.0 * W,
      roofY: y + 0.67 * H,
      roofX: 0,
      roofLen: 0.6,
      roofW: 0.6,
      bodyTopY: y + 0.2 * H,
      faceY: y,
      hoodX: 0.6 * L,
    };
  },
};

const rocket: Archetype = {
  id: 'rocket',
  noun: 'ロケットカー',
  stats: { speed: 10, acceleration: 7, handling: 3, stability: 4 },
  wheelStyle: 'sporty',
  suffixes: ['号', 'ロケット', 'ジェット', 'ブースター', 'ONE'],
  personality: ['止まることを知らない', 'せっかちで一直線', 'カーブはちょっと苦手'],
  catchphrase: ['3、2、1、発射！', '大気圏を突破するぞ', 'ブースト全開！', '曲がるのは苦手だ！'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 1.0, 1.0);
    const { list, pal } = ctx;
    const r = 0.36 * H;
    const y = 0.62 * H;
    list.capsule(r, 1.2 * L, [0, y, 0], pal.body, 'body', { rotation: [0, 0, 90] });
    list.cone(r, 0.6 * L, [0.9 * L, y, 0], pal.accent, 'body', { rotation: [0, 0, -90] });
    list.sph([0.22 * s, 0.16 * s, 0.2 * s], [0.35 * L, y + r * 0.8, 0], pal.window, 'window', { material: 'glass' });
    list.box([0.45 * s, 0.35 * s, 0.05], [-0.7 * L, y + r + 0.12 * s, 0], pal.accent, 'deco', { rotation: [0, 0, 20], round: 0.2 });
    list.pair((side) => list.box([0.45 * s, 0.28 * s, 0.05], [-0.7 * L, y - 0.1 * s, (r + 0.08 * s) * side], pal.accent, 'deco', { rotation: [35 * side, 0, 15], round: 0.2 }));
    list.taper(0.16 * s, 0.24 * s, 0.24 * s, [-0.98 * L, y, 0], '#90a4ae', 'exhaust', { rotation: [0, 0, 90], material: 'metal' });
    list.cone(0.17 * s, 0.5 * s, [-1.3 * L, y, 0], '#ff9800', 'light', { rotation: [0, 0, 90] });
    list.cone(0.09 * s, 0.35 * s, [-1.3 * L, y, 0], '#fff176', 'light', { rotation: [0, 0, 90] });
    wheels4(ctx, 0.2 * ctx.mods.wheel * s, 0.16 * s, 0.5 * L, -0.5 * L, 0.3 * W);
    return {
      frontX: 1.2 * L,
      backX: -1.05 * L,
      halfW: r,
      roofY: y + r,
      roofX: -0.1 * L,
      roofLen: 0.6,
      roofW: 0.4,
      bodyTopY: y + r,
      faceY: y,
      hoodX: 0.55 * L,
    };
  },
};

const ANIMAL_LOOK: Record<AnimalKind, { body: string; sub: string; noun: string }> = {
  cat: { body: '#ffb74d', sub: '#fff3e0', noun: 'ねこカー' },
  dog: { body: '#d7a86e', sub: '#8d6e63', noun: 'わんこカー' },
  rabbit: { body: '#fafafa', sub: '#f8bbd0', noun: 'うさぎカー' },
  bear: { body: '#8d6e63', sub: '#d7ccc8', noun: 'くまカー' },
  panda: { body: '#fafafa', sub: '#212121', noun: 'パンダカー' },
  pig: { body: '#f8bbd0', sub: '#f48fb1', noun: 'ぶたカー' },
  frog: { body: '#7cb342', sub: '#fafafa', noun: 'かえるカー' },
};

export function animalNoun(kind: AnimalKind): string {
  return ANIMAL_LOOK[kind].noun;
}

const animal: Archetype = {
  id: 'animal',
  noun: 'どうぶつカー',
  stats: { speed: 5, acceleration: 8, handling: 7, stability: 4 },
  wheelStyle: 'cute',
  suffixes: ['ちゃん', 'くん', 'まる', 'ぴょん', '号'],
  personality: ['人なつっこい甘えん坊', '好奇心旺盛でよそ見がち', 'ごはんの時間には正確'],
  catchphrase: ['がんばるにゃ！', 'わんだふる！', 'ぴょーんと抜かすよ', 'おやつはゴールのあと！'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 1.0, 1.0);
    const { list, pal } = ctx;
    const kind = (ctx.variant as AnimalKind) ?? 'cat';
    const look = ANIMAL_LOOK[kind] ?? ANIMAL_LOOK.cat;
    // 色の指定があればそちらを優先し、無ければその動物らしい色にする
    const body = ctx.customColor ? pal.body : look.body;
    const sub = look.sub;
    const wr = 0.26 * ctx.mods.wheel * s;
    const by = wr + 0.45 * H;
    const hx = 0.72 * L;
    const hy = wr + 0.8 * H;
    list.sph([0.85 * L, 0.5 * H, 0.55 * W], [-0.05 * L, by, 0], body, 'body');
    list.sph(0.42 * s, [hx, hy, 0], body, 'body');
    if (kind === 'frog') {
      list.pair((side) => list.sph(0.14 * s, [hx, hy + 0.36 * s, 0.18 * s * side], sub, 'deco'));
      list.pair((side) => list.sph(0.07 * s, [hx + 0.1 * s, hy + 0.4 * s, 0.18 * s * side], '#212121', 'deco'));
      list.sph([0.06 * s, 0.03 * s, 0.22 * s], [hx + 0.38 * s, hy - 0.08 * s, 0], '#e57373', 'deco');
    } else {
      if (kind === 'panda') {
        list.pair((side) => list.sph([0.06 * s, 0.11 * s, 0.09 * s], [hx + 0.34 * s, hy + 0.08 * s, 0.15 * s * side], sub, 'deco'));
        list.pair((side) => list.sph(0.035 * s, [hx + 0.39 * s, hy + 0.1 * s, 0.15 * s * side], '#ffffff', 'deco'));
      } else {
        list.pair((side) => list.sph(0.065 * s, [hx + 0.36 * s, hy + 0.08 * s, 0.15 * s * side], '#212121', 'deco'));
      }
      const muzzle = kind === 'dog' || kind === 'bear' || kind === 'pig';
      if (muzzle) list.sph([0.16 * s, 0.12 * s, 0.2 * s], [hx + 0.36 * s, hy - 0.1 * s, 0], kind === 'pig' ? sub : lighten(body, 0.5), 'deco');
      list.sph(0.05 * s, [hx + (muzzle ? 0.52 : 0.41) * s, hy - (muzzle ? 0.04 : 0.04) * s, 0], kind === 'pig' ? darken(sub, 0.3) : '#4e342e', 'deco');
      list.pair((side) => list.sph([0.08 * s, 0.05 * s, 0.08 * s], [hx + 0.3 * s, hy - 0.1 * s, 0.28 * s * side], '#ff80ab', 'deco'));
    }
    // 耳
    if (kind === 'cat') list.pair((side) => list.cone(0.12 * s, 0.22 * s, [hx - 0.04 * s, hy + 0.4 * s, 0.2 * s * side], body, 'deco', { rotation: [-15 * side, 0, 0] }));
    if (kind === 'dog') list.pair((side) => list.sph([0.1 * s, 0.22 * s, 0.07 * s], [hx - 0.06 * s, hy + 0.12 * s, 0.38 * s * side], sub, 'deco', { rotation: [-25 * side, 0, 0] }));
    if (kind === 'rabbit') list.pair((side) => list.capsule(0.07 * s, 0.45 * s, [hx - 0.1 * s, hy + 0.6 * s, 0.13 * s * side], body, 'deco', { rotation: [-10 * side, 0, -10] }));
    if (kind === 'bear' || kind === 'panda') list.pair((side) => list.sph(0.13 * s, [hx - 0.06 * s, hy + 0.35 * s, 0.3 * s * side], kind === 'panda' ? sub : body, 'deco'));
    if (kind === 'pig') list.pair((side) => list.cone(0.1 * s, 0.16 * s, [hx - 0.02 * s, hy + 0.4 * s, 0.22 * s * side], sub, 'deco', { rotation: [-20 * side, 0, 0] }));
    // しっぽ
    const tx = -0.9 * L;
    if (kind === 'cat') list.capsule(0.05 * s, 0.5 * s, [tx, by + 0.3 * H, 0], body, 'deco', { rotation: [0, 0, 40] });
    else if (kind === 'dog') list.capsule(0.06 * s, 0.3 * s, [tx, by + 0.25 * H, 0], body, 'deco', { rotation: [0, 0, 50] });
    else if (kind === 'pig') list.torus(0.07 * s, 0.025 * s, [tx, by + 0.1 * H, 0], sub, 'deco', { rotation: [0, 90, 0] });
    else if (kind !== 'frog') list.sph(0.12 * s, [tx, by + 0.1 * H, 0], kind === 'rabbit' ? '#ffffff' : body, 'deco');
    wheels4(ctx, wr, 0.2 * s, 0.45 * L, -0.45 * L, 0.42 * W);
    return {
      frontX: hx + 0.42 * s,
      backX: -0.9 * L,
      halfW: 0.55 * W,
      roofY: by + 0.5 * H,
      roofX: -0.15 * L,
      roofLen: 0.8,
      roofW: 0.6,
      bodyTopY: by + 0.45 * H,
      faceY: hy,
      hoodX: hx,
    };
  },
};

const cake: Archetype = {
  id: 'cake',
  noun: 'ケーキカー',
  stats: { speed: 4, acceleration: 8, handling: 6, stability: 6 },
  wheelStyle: 'cute',
  suffixes: ['ちゃん', 'スイーツ', 'デラックス', '号', 'ショート'],
  personality: ['甘い顔してけっこう速い', 'みんなを笑顔にしたい', 'クリームが崩れないか心配性'],
  catchphrase: ['あま〜い走り、見せてあげる', 'いちご多めでおねがい！', 'デザートは別腹！'],
  palette: { body: '#f5d6a0', trim: '#ffffff', accent: '#ff3b5c' },
  build(ctx) {
    const { L, H, s } = dims(ctx, 1.0, 1.0);
    const { list, pal } = ctx;
    const wr = 0.26 * ctx.mods.wheel * s;
    const R = 0.85 * L;
    const y0 = wr + 0.25 * H;
    list.cyl(R, 0.42 * H, [0, y0, 0], pal.body, 'body');
    list.cyl(R * 1.02, 0.07 * s, [0, y0 + 0.23 * H, 0], pal.trim, 'deco');
    list.cyl(R * 0.7, 0.34 * H, [0, y0 + 0.43 * H, 0], pal.body, 'body');
    list.cyl(R * 0.72, 0.05 * s, [0, y0 + 0.61 * H, 0], pal.trim, 'deco');
    list.torus(R * 0.62, 0.06 * s, [0, y0 + 0.63 * H, 0], pal.trim, 'deco', { rotation: [90, 0, 0] });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      list.sph([0.09 * s, 0.11 * s, 0.09 * s], [Math.cos(a) * R * 0.45, y0 + 0.72 * H, Math.sin(a) * R * 0.45], pal.accent, 'deco');
    }
    list.cyl(0.03 * s, 0.28 * s, [0, y0 + 0.78 * H, 0], '#90caf9', 'deco');
    list.sph([0.04 * s, 0.07 * s, 0.04 * s], [0, y0 + 0.97 * H, 0], '#ffb300', 'light');
    // 車輪はケーキの外側にはみ出させて、脚ではなく車輪に見えるようにする
    wheels4(ctx, wr, 0.2 * s, 0.45 * R, -0.45 * R, 0.92 * R);
    return {
      frontX: R,
      backX: -R,
      halfW: R,
      roofY: y0 + 0.64 * H,
      roofX: -0.35 * L,
      roofLen: 0.4,
      roofW: 0.4,
      bodyTopY: y0 + 0.21 * H,
      faceY: y0,
      hoodX: 0.6 * R,
    };
  },
};

const boat: Archetype = {
  id: 'boat',
  noun: '水陸両用カー',
  stats: { speed: 6, acceleration: 5, handling: 5, stability: 8 },
  wheelStyle: 'normal',
  suffixes: ['丸', '号', 'マリン', 'クルーザー', 'シップ'],
  personality: ['陸でも海でもおかまいなし', '豪快な海の男', '風まかせの自由人'],
  catchphrase: ['ヨーソロー！', '面舵いっぱーい！', '波に乗るぜ', '錨を上げろ！'],
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 2.0, 0.9);
    const { list, pal } = ctx;
    const wr = 0.28 * ctx.mods.wheel * s;
    const hullH = 0.45 * H;
    const hy = wr + 0.22 * H;
    list.box([L * 0.8, hullH, W], [-0.08 * L, hy, 0], pal.body, 'body', { round: rd(ctx, 0.6), material: pal.bodyMaterial });
    list.sph([0.32 * L, hullH / 2, W / 2], [0.3 * L, hy, 0], pal.body, 'body', { material: pal.bodyMaterial });
    list.box([L * 0.81, 0.07 * s, W * 1.02], [-0.08 * L, hy - 0.08 * H, 0], pal.accent, 'deco', { round: 0.4 });
    list.box([L * 0.72, 0.04, W * 0.88], [-0.08 * L, hy + hullH / 2, 0], '#d7b27a', 'deco', { material: 'wood', round: 0 });
    list.box([0.5 * s, 0.34 * H, 0.52 * W], [-0.3 * L, hy + hullH / 2 + 0.17 * H, 0], pal.cabin, 'cabin', { round: rd(ctx, 0.4) });
    list.box([0.52 * s, 0.12 * H, 0.54 * W], [-0.3 * L, hy + hullH / 2 + 0.22 * H, 0], pal.window, 'window', { round: 0.4 });
    const mastY = hy + hullH / 2;
    list.cyl(0.035 * s, 1.3 * H, [0.1 * L, mastY + 0.65 * H, 0], '#6d4c41', 'deco', { material: 'wood' });
    list.box([0.55 * s, 0.8 * H, 0.03], [-0.03 * L + 0.02, mastY + 0.72 * H, 0], pal.trim, 'deco', { material: 'cloth', round: 0.1 });
    list.box([0.25 * s, 0.14 * s, 0.02], [0.1 * L + 0.14 * s, mastY + 1.25 * H, 0], pal.accent, 'deco', { material: 'cloth', round: 0 });
    wheels4(ctx, wr, 0.22 * s, 0.25 * L, -0.33 * L, W / 2);
    return {
      frontX: 0.62 * L,
      backX: -0.48 * L,
      halfW: W / 2,
      roofY: hy + hullH / 2 + 0.34 * H,
      roofX: -0.3 * L,
      roofLen: 0.5 * s,
      roofW: 0.5 * W,
      bodyTopY: hy + hullH / 2,
      faceY: hy,
      hoodX: 0.35 * L,
    };
  },
};

const shinkansen: Archetype = {
  id: 'shinkansen',
  noun: '新幹線カー',
  stats: { speed: 9, acceleration: 5, handling: 6, stability: 4 },
  wheelStyle: 'normal',
  suffixes: ['号', 'のぞみ', 'ひかり', 'ライナー', 'エクスプレス'],
  personality: ['時間に正確な几帳面', '直線ではだれにも負けない', 'まじめで礼儀正しい'],
  catchphrase: ['まもなく、ゴールです', '定刻どおり参ります', '白線の内側までお下がりください'],
  palette: { body: '#fafafa', accent: '#1e5aa8', window: '#263238', cabin: '#fafafa' },
  build(ctx) {
    const { L, W, H, s } = dims(ctx, 1.6, 0.9);
    const { list, pal } = ctx;
    const wr = 0.22 * ctx.mods.wheel * s;
    const bodyH = 0.7 * H;
    const y = wr + 0.3 * H;
    const loco = ctx.variant === 'loco';
    list.box([L, bodyH, W], [-0.25 * L, y, 0], pal.body, 'body', { round: rd(ctx, 0.6) });
    if (loco) {
      list.cyl(0.3 * H, 0.9 * L, [0.55 * L, y - 0.05, 0], pal.body, 'body', { rotation: [0, 0, 90] });
      list.cyl(0.32 * H, 0.08, [0.98 * L, y - 0.05, 0], pal.accent, 'deco', { rotation: [0, 0, 90] });
      list.sph(0.08 * s, [1.03 * L, y + 0.05, 0], '#fff59d', 'light');
      list.box([0.2 * s, 0.12 * s, W * 1.05], [1.08 * L, wr * 0.8, 0], pal.accent, 'bumper', { round: 0.2 });
    } else {
      list.sph([0.55 * L, 0.3 * H, 0.45 * W], [0.3 * L, y - 0.05 * H, 0], pal.body, 'body');
      list.sph([0.3 * L, 0.12 * H, 0.3 * W], [0.36 * L, y + 0.18 * H, 0], pal.window, 'window', { material: 'glass' });
      headlights(ctx, 0.8 * L, y - 0.12 * H, 0.16 * W, 0.06 * s);
      list.sph([0.56 * L, 0.06 * H, 0.46 * W], [0.3 * L, y - 0.1 * H, 0], pal.accent, 'deco');
    }
    list.box([L * 0.9, 0.18 * H, W * 1.02], [-0.25 * L, y + 0.15 * H, 0], pal.window, 'window', { round: 0.4 });
    list.box([L * 1.01, 0.07 * s, W * 1.02], [-0.25 * L, y - 0.14 * H, 0], pal.accent, 'deco', { round: 0.4 });
    list.pair((side) => list.box([0.04, 0.2 * s, 0.04], [-0.3 * L, y + bodyH / 2 + 0.1 * s, 0.15 * W * side], '#546e7a', 'deco', { rotation: [25 * side, 0, 0], round: 0 }));
    wheels4(ctx, wr, 0.2 * s, 0.35 * L, -0.6 * L, 0.42 * W);
    return {
      frontX: 0.85 * L,
      backX: -0.75 * L,
      halfW: W / 2,
      roofY: y + bodyH / 2,
      roofX: -0.35 * L,
      roofLen: 0.7 * L,
      roofW: 0.8 * W,
      bodyTopY: y + bodyH / 2,
      faceY: y,
      hoodX: loco ? 0.6 * L : 0.45 * L,
    };
  },
};

export const ARCHETYPES = {
  compact,
  sports,
  formula,
  truck,
  bus,
  gissha,
  yatai,
  ufo,
  rocket,
  animal,
  cake,
  boat,
  shinkansen,
} satisfies Record<string, Archetype>;

export type ArchetypeId = keyof typeof ARCHETYPES;

/** 辞書に何も無いときに引く型と重み */
export const RANDOM_ARCHETYPES: [ArchetypeId, number][] = [
  ['compact', 3],
  ['sports', 2],
  ['truck', 1.4],
  ['bus', 1.2],
  ['formula', 1],
  ['animal', 1.2],
  ['rocket', 0.7],
  ['boat', 0.6],
  ['cake', 0.5],
  ['shinkansen', 0.5],
  ['ufo', 0.4],
  ['yatai', 0.3],
];
