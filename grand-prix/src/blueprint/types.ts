/**
 * 車の設計図（CarBlueprint）。
 * LLM が出力する JSON の形そのもの。プレーンなデータだけで構成し、
 * そのまま JSON.stringify / URL 共有できるようにしてある。
 *
 * 座標系: 車の前方が +X、上が +Y、車の右側が +Z（単位はおおよそ「メートルっぽい何か」）。
 * 組み立て時に全体の大きさは決まった範囲に収め直すので、比率さえ合っていればよい。
 */

export const BLUEPRINT_VERSION = 1;

/** 使える基本図形 */
export const SHAPES = ['box', 'cylinder', 'sphere', 'cone', 'torus', 'capsule'] as const;
export type Shape = (typeof SHAPES)[number];

/**
 * パーツの役割。wheel だけは「走るときに回転する」という特別な意味を持つ。
 * light は光る、window はつやのあるガラス風になる。
 */
export const ROLES = [
  'body',
  'cabin',
  'roof',
  'window',
  'wheel',
  'light',
  'spoiler',
  'bumper',
  'exhaust',
  'deco',
] as const;
export type PartRole = (typeof ROLES)[number];

export const MATERIALS = ['plastic', 'metal', 'wood', 'glass', 'glow', 'rubber', 'cloth'] as const;
export type PartMaterial = (typeof MATERIALS)[number];

export const WHEEL_STYLES = ['normal', 'sporty', 'wooden', 'cute', 'offroad', 'none'] as const;
export type WheelStyle = (typeof WHEEL_STYLES)[number];

export type Vec3 = [number, number, number];

/**
 * size の意味は shape ごとに異なる:
 * - box:      [長さ(X), 高さ(Y), 幅(Z)]
 * - cylinder: [半径, 高さ] または [上の半径, 高さ, 下の半径]（軸は Y。車輪にするなら rotation [90,0,0]）
 * - sphere:   [半径] または [X半径, Y半径, Z半径]（楕円体）
 * - cone:     [半径, 高さ]（軸は Y、とがった方が +Y）
 * - torus:    [半径, 太さ]（輪は XY 平面、穴の軸は Z）
 * - capsule:  [半径, 長さ]（軸は Y）
 */
export interface BlueprintPart {
  shape: Shape;
  size: number[];
  position: Vec3;
  /** 度数法の回転 [X, Y, Z] */
  rotation?: Vec3;
  /** #rrggbb */
  color: string;
  role?: PartRole;
  material?: PartMaterial;
  /** box のみ: 角の丸み 0（角ばる）〜 1（まんまる） */
  round?: number;
}

/** 車の性能。各 1〜10。合計は STAT_TOTAL に揃える。 */
export interface CarStats {
  /** 最高速度 */
  speed: number;
  /** 加速の速さ */
  acceleration: number;
  /** カーブでの減速の少なさ */
  handling: number;
  /** ハプニング（スピン、コースアウト）の起きにくさ */
  stability: number;
}

export const STAT_KEYS = ['speed', 'acceleration', 'handling', 'stability'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  speed: 'スピード',
  acceleration: 'かそく',
  handling: 'まがる',
  stability: 'あんてい',
};

export interface CarBlueprint {
  version: number;
  name: string;
  /** 一言コンセプト */
  concept: string;
  /** 元になった入力文（任意） */
  prompt?: string;
  parts: BlueprintPart[];
  wheelStyle: WheelStyle;
  stats: CarStats;
  personality: string;
  catchphrase: string;
}

/** ルール（上限など） */
export const LIMITS = {
  maxParts: 30,
  statMin: 1,
  statMax: 10,
  statTotal: 24,
  coordMax: 4,
  sizeMin: 0.02,
  sizeMax: 4,
  nameMax: 16,
  conceptMax: 60,
  personalityMax: 40,
  catchphraseMax: 30,
  promptMax: 120,
} as const;
