import { darken } from '../blueprint/colors';
import type { Palette } from './palettes';
import type { PartList } from './parts';
import type { Anchors } from './templates';

/**
 * 型の上に後から載せる飾り（スポイラー、ツノ、王冠など）。
 * テンプレートが返す Anchors を目印に置くので、どの型にも付けられる。
 */
interface AddonContext {
  list: PartList;
  pal: Palette;
  a: Anchors;
  s: number;
}

interface Addon {
  /** 使うパーツ数（上限を超えるなら付けない） */
  parts: number;
  build(ctx: AddonContext): void;
}

export const ADDONS = {
  spoiler: {
    parts: 3,
    build({ list, pal, a, s }) {
      const x = a.backX + 0.12 * s;
      const y = a.bodyTopY + 0.28 * s;
      list.box([0.26 * s, 0.05 * s, a.halfW * 2.1], [x, y, 0], darken(pal.body, 0.55), 'spoiler', { round: 0.1 });
      list.pair((side) => list.box([0.06, 0.28 * s, 0.06], [x, y - 0.15 * s, a.halfW * 0.6 * side], '#263238', 'spoiler', { round: 0 }));
    },
  },
  wings: {
    parts: 2,
    build({ list, pal, a, s }) {
      list.pair((side) => list.box([0.5 * s, 0.05 * s, 0.7 * s], [(a.frontX + a.backX) / 2, a.bodyTopY - 0.12 * s, (a.halfW + 0.3 * s) * side], pal.accent, 'spoiler', { rotation: [8 * side, 0, 0], round: 0.3 }));
    },
  },
  horns: {
    parts: 2,
    build({ list, a, s }) {
      list.pair((side) => list.cone(0.08 * s, 0.32 * s, [a.roofX + a.roofLen * 0.2, a.roofY + 0.13 * s, a.roofW * 0.3 * side], '#fff8e1', 'deco', { rotation: [-25 * side, 0, 0] }));
    },
  },
  catEars: {
    parts: 2,
    build({ list, pal, a, s }) {
      list.pair((side) => list.cone(0.12 * s, 0.22 * s, [a.roofX + a.roofLen * 0.15, a.roofY + 0.09 * s, a.roofW * 0.32 * side], pal.body, 'deco', { rotation: [-12 * side, 0, 0] }));
    },
  },
  antenna: {
    parts: 2,
    build({ list, pal, a, s }) {
      const x = a.roofX - a.roofLen * 0.3;
      list.cyl(0.018 * s, 0.45 * s, [x, a.roofY + 0.22 * s, 0], '#90a4ae', 'deco');
      list.sph(0.07 * s, [x, a.roofY + 0.46 * s, 0], pal.accent, 'light');
    },
  },
  crown: {
    parts: 5,
    build({ list, a, s }) {
      const y = a.roofY + 0.09 * s;
      list.taper(0.2 * s, 0.16 * s, 0.17 * s, [a.roofX, y, 0], '#ffc107', 'deco', { material: 'metal' });
      for (const [dx, dz] of [[0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]]) {
        list.cone(0.05 * s, 0.14 * s, [a.roofX + dx * s, y + 0.14 * s, dz * s], '#ffc107', 'deco', { material: 'metal' });
      }
    },
  },
  flag: {
    parts: 2,
    build({ list, pal, a, s }) {
      const x = a.backX + 0.15 * s;
      const z = -a.halfW * 0.6;
      list.cyl(0.02 * s, 0.9 * s, [x, a.bodyTopY + 0.45 * s, z], '#eceff1', 'deco');
      list.box([0.32 * s, 0.2 * s, 0.02], [x - 0.17 * s, a.bodyTopY + 0.8 * s, z], pal.accent, 'deco', { material: 'cloth', round: 0 });
    },
  },
  booster: {
    parts: 4,
    build({ list, a, s }) {
      list.pair((side) => {
        const z = a.halfW * 0.45 * side;
        list.cyl(0.11 * s, 0.3 * s, [a.backX - 0.08 * s, a.bodyTopY - 0.12 * s, z], '#78909c', 'exhaust', { rotation: [0, 0, 90], material: 'metal' });
        list.cone(0.09 * s, 0.35 * s, [a.backX - 0.38 * s, a.bodyTopY - 0.12 * s, z], '#ff9800', 'light', { rotation: [0, 0, 90] });
      });
    },
  },
  lightBar: {
    parts: 3,
    build({ list, a, s }) {
      const y = a.roofY + 0.04 * s;
      list.box([0.2 * s, 0.07 * s, a.roofW * 0.7], [a.roofX, y, 0], '#37474f', 'deco', { round: 0.3 });
      list.box([0.16 * s, 0.09 * s, a.roofW * 0.3], [a.roofX, y + 0.06 * s, a.roofW * 0.18], '#ff1744', 'light', { round: 0.5 });
      list.box([0.16 * s, 0.09 * s, a.roofW * 0.3], [a.roofX, y + 0.06 * s, -a.roofW * 0.18], '#2979ff', 'light', { round: 0.5 });
    },
  },
  eyes: {
    parts: 4,
    build({ list, a, s }) {
      list.pair((side) => {
        list.sph(0.13 * s, [a.frontX - 0.04 * s, a.faceY + 0.12 * s, a.halfW * 0.42 * side], '#ffffff', 'deco');
        list.sph(0.065 * s, [a.frontX + 0.07 * s, a.faceY + 0.12 * s, a.halfW * 0.42 * side], '#263238', 'deco');
      });
    },
  },
  cheeks: {
    parts: 2,
    build({ list, a, s }) {
      list.pair((side) => list.sph([0.08 * s, 0.05 * s, 0.08 * s], [a.frontX - 0.06 * s, a.faceY - 0.06 * s, a.halfW * 0.75 * side], '#ff80ab', 'deco'));
    },
  },
  chimney: {
    parts: 3,
    build({ list, a, s }) {
      const x = a.hoodX;
      list.taper(0.1 * s, 0.4 * s, 0.07 * s, [x, a.bodyTopY + 0.2 * s, 0], '#37474f', 'exhaust', { material: 'metal' });
      list.sph(0.12 * s, [x - 0.05 * s, a.bodyTopY + 0.55 * s, 0], '#eceff1', 'deco');
      list.sph(0.09 * s, [x - 0.2 * s, a.bodyTopY + 0.72 * s, 0.04 * s], '#f5f5f5', 'deco');
    },
  },
  pot: {
    parts: 4,
    build({ list, a, s }) {
      const x = a.roofX;
      const y = a.roofY + 0.14 * s;
      list.cyl(0.24 * s, 0.26 * s, [x, y, 0], '#b0bec5', 'deco', { material: 'metal' });
      list.cyl(0.22 * s, 0.03, [x, y + 0.13 * s, 0], '#d18a00', 'deco');
      list.sph(0.08 * s, [x, y + 0.27 * s, 0], '#ffffff', 'deco');
      list.sph(0.06 * s, [x + 0.05 * s, y + 0.4 * s, 0.03 * s], '#ffffff', 'deco');
    },
  },
  flower: {
    parts: 5,
    build({ list, a, s }) {
      const x = a.roofX;
      const y = a.roofY + 0.05 * s;
      list.sph(0.08 * s, [x, y + 0.02 * s, 0], '#ffeb3b', 'deco');
      for (const [dx, dz] of [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) {
        list.sph([0.08 * s, 0.04 * s, 0.08 * s], [x + dx * s, y, dz * s], '#ff80ab', 'deco');
      }
    },
  },
  surfboard: {
    parts: 1,
    build({ list, pal, a, s }) {
      list.sph([Math.max(a.roofLen * 0.7, 0.5 * s), 0.035 * s, 0.17 * s], [a.roofX, a.roofY + 0.05 * s, 0], pal.accent, 'deco');
    },
  },
  santaHat: {
    parts: 3,
    build({ list, a, s }) {
      const y = a.roofY;
      list.torus(0.2 * s, 0.06 * s, [a.roofX, y + 0.04 * s, 0], '#fafafa', 'deco', { rotation: [90, 0, 0] });
      list.cone(0.2 * s, 0.4 * s, [a.roofX, y + 0.24 * s, 0], '#e53935', 'deco', { rotation: [0, 0, 18] });
      list.sph(0.07 * s, [a.roofX - 0.07 * s, y + 0.44 * s, 0], '#fafafa', 'deco');
    },
  },
  ribbon: {
    parts: 3,
    build({ list, a, s }) {
      const y = a.roofY + 0.08 * s;
      list.sph(0.07 * s, [a.roofX, y, 0], '#ff4081', 'deco');
      list.pair((side) => list.cone(0.09 * s, 0.2 * s, [a.roofX, y, 0.1 * s * side], '#ff4081', 'deco', { rotation: [-90 * side, 0, 0] }));
    },
  },
  lantern: {
    parts: 2,
    build({ list, a, s }) {
      list.pair((side) => list.sph([0.1 * s, 0.14 * s, 0.1 * s], [a.frontX - 0.1 * s, a.bodyTopY + 0.08 * s, a.halfW * 0.7 * side], '#ff7043', 'light'));
    },
  },
  propeller: {
    parts: 3,
    build({ list, a, s }) {
      const x = a.frontX + 0.06 * s;
      list.cyl(0.07 * s, 0.1 * s, [x, a.faceY, 0], '#90a4ae', 'deco', { rotation: [0, 0, 90], material: 'metal' });
      list.box([0.03, 0.6 * s, 0.07 * s], [x + 0.03, a.faceY, 0], '#5d4037', 'deco', { material: 'wood', rotation: [30, 0, 0], round: 0.3 });
      list.box([0.03, 0.6 * s, 0.07 * s], [x + 0.03, a.faceY, 0], '#5d4037', 'deco', { material: 'wood', rotation: [-60, 0, 0], round: 0.3 });
    },
  },
  sunglasses: {
    parts: 3,
    build({ list, a, s }) {
      const y = a.roofY - 0.12 * s;
      const x = a.roofX + a.roofLen / 2 + 0.02;
      list.pair((side) => list.box([0.04, 0.12 * s, a.roofW * 0.32], [x, y, a.roofW * 0.2 * side], '#111111', 'window', { material: 'glass', round: 0.6 }));
      list.box([0.04, 0.03 * s, a.roofW * 0.2], [x, y + 0.03 * s, 0], '#111111', 'deco', { round: 0 });
    },
  },
  spikes: {
    parts: 4,
    build({ list, a, s }) {
      for (const dx of [-0.3, 0, 0.3, 0.6]) {
        list.cone(0.08 * s, 0.25 * s, [a.roofX + dx * a.roofLen * 0.6, a.roofY + 0.1 * s, 0], '#b0bec5', 'deco', { material: 'metal' });
      }
    },
  },
  star: {
    parts: 2,
    build({ list, a, s }) {
      list.cyl(0.015 * s, 0.35 * s, [a.roofX, a.roofY + 0.17 * s, 0], '#eceff1', 'deco');
      list.sph(0.1 * s, [a.roofX, a.roofY + 0.38 * s, 0], '#ffeb3b', 'light');
    },
  },
  hachimaki: {
    parts: 2,
    build({ list, a, s }) {
      list.box([a.roofLen * 1.04, 0.07 * s, a.roofW * 1.04], [a.roofX, a.roofY - 0.08 * s, 0], '#fafafa', 'deco', { material: 'cloth', round: 0.5 });
      list.sph(0.06 * s, [a.roofX + a.roofLen * 0.52, a.roofY - 0.08 * s, 0], '#e53935', 'deco');
    },
  },
} satisfies Record<string, Addon>;

export type AddonId = keyof typeof ADDONS;
export const ADDON_IDS = Object.keys(ADDONS) as AddonId[];

/** ランダムで付ける飾りの候補（謎の入力のとき） */
export const RANDOM_ADDONS: AddonId[] = ['spoiler', 'antenna', 'flag', 'eyes', 'flower', 'star', 'booster', 'surfboard', 'ribbon', 'sunglasses', 'hachimaki'];

export function applyAddon(id: AddonId, ctx: AddonContext): boolean {
  const addon: Addon = ADDONS[id];
  if (ctx.list.room < addon.parts) return false;
  addon.build(ctx);
  return true;
}
