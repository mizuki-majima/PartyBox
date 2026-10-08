import { clamp } from '../util/rng';
import { parseColor } from './colors';
import {
  BLUEPRINT_VERSION,
  LIMITS,
  MATERIALS,
  ROLES,
  SHAPES,
  STAT_KEYS,
  WHEEL_STYLES,
  type BlueprintPart,
  type CarBlueprint,
  type CarStats,
  type PartMaterial,
  type PartRole,
  type Shape,
  type Vec3,
  type WheelStyle,
} from './types';

/**
 * 設計図の検証と補正。
 * どんな入力（LLM の出力が壊れていても、ただの文字列でも）を渡しても、
 * 例外を投げずに「走れる設計図」を返す。直した箇所は issues に記録する。
 */
export interface NormalizeResult {
  blueprint: CarBlueprint;
  issues: string[];
}

const DEFAULT_SIZES: Record<Shape, number[]> = {
  box: [1, 0.5, 0.8],
  cylinder: [0.3, 0.2],
  sphere: [0.4],
  cone: [0.3, 0.5],
  torus: [0.3, 0.1],
  capsule: [0.2, 0.6],
};

const ROLE_ALIASES: Record<string, PartRole> = {
  tire: 'wheel',
  tyre: 'wheel',
  wheels: 'wheel',
  タイヤ: 'wheel',
  車輪: 'wheel',
  lamp: 'light',
  headlight: 'light',
  taillight: 'light',
  glass: 'window',
  windshield: 'window',
  wing: 'spoiler',
  chassis: 'body',
  hood: 'body',
  muffler: 'exhaust',
  decoration: 'deco',
};

const DEFAULT_COLOR_BY_ROLE: Record<PartRole, string> = {
  body: '#ff7043',
  cabin: '#ffab91',
  roof: '#ff7043',
  window: '#9fd3ff',
  wheel: '#333333',
  light: '#fff59d',
  spoiler: '#37474f',
  bumper: '#eceff1',
  exhaust: '#9e9e9e',
  deco: '#ffd54f',
};

const DEFAULT_MATERIAL_BY_ROLE: Partial<Record<PartRole, PartMaterial>> = {
  wheel: 'rubber',
  window: 'glass',
  light: 'glow',
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 小数点以下 3 桁に丸める（シリアライズの往復で値が変わらないように） */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** 制御文字を取り除き、前後の空白を削って、長さを制限する */
export function sanitizeText(v: unknown, max: number, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, '').trim();
  if (!cleaned) return fallback;
  return Array.from(cleaned).slice(0, max).join('');
}

function vec3(v: unknown, fallback: Vec3, min: number, max: number): Vec3 {
  if (!Array.isArray(v)) return [...fallback];
  return [0, 1, 2].map((i) => {
    const n = num(v[i]);
    return r3(n === null ? fallback[i] : clamp(n, min, max));
  }) as Vec3;
}

function normalizeSize(shape: Shape, v: unknown): number[] {
  const def = DEFAULT_SIZES[shape];
  const raw: number[] = [];
  if (Array.isArray(v)) {
    for (const x of v) {
      const n = num(x);
      if (n !== null) raw.push(Math.abs(n));
    }
  } else {
    const n = num(v);
    if (n !== null) raw.push(Math.abs(n));
  }
  let out: number[];
  switch (shape) {
    case 'box':
      out = raw.length >= 3 ? raw.slice(0, 3) : raw.length === 1 ? [raw[0], raw[0], raw[0]] : [...def];
      break;
    case 'sphere':
      out = raw.length >= 3 ? raw.slice(0, 3) : raw.length >= 1 ? [raw[0]] : [...def];
      break;
    case 'cylinder':
      out = raw.length >= 3 ? raw.slice(0, 3) : raw.length === 2 ? raw.slice(0, 2) : raw.length === 1 ? [raw[0], def[1]] : [...def];
      break;
    default:
      out = raw.length >= 2 ? raw.slice(0, 2) : raw.length === 1 ? [raw[0], def[1]] : [...def];
  }
  return out.map((x) => r3(clamp(x, LIMITS.sizeMin, LIMITS.sizeMax)));
}

function normalizeRole(v: unknown): PartRole {
  if (typeof v !== 'string') return 'deco';
  const key = v.trim().toLowerCase();
  if ((ROLES as readonly string[]).includes(key)) return key as PartRole;
  return ROLE_ALIASES[key] ?? ROLE_ALIASES[v.trim()] ?? 'deco';
}

function normalizePart(v: unknown, issues: string[], index: number): BlueprintPart | null {
  if (!isObject(v)) {
    issues.push(`parts[${index}] がオブジェクトではないので捨てました`);
    return null;
  }
  const shapeRaw = typeof v.shape === 'string' ? v.shape.trim().toLowerCase() : '';
  const shape: Shape = (SHAPES as readonly string[]).includes(shapeRaw) ? (shapeRaw as Shape) : 'box';
  if (shape !== shapeRaw) issues.push(`parts[${index}].shape "${String(v.shape)}" を box にしました`);

  const role = normalizeRole(v.role);
  const color = parseColor(v.color) ?? DEFAULT_COLOR_BY_ROLE[role];
  if (v.color !== undefined && parseColor(v.color) === null) issues.push(`parts[${index}].color を補いました`);

  const materialRaw = typeof v.material === 'string' ? v.material.trim().toLowerCase() : '';
  const material: PartMaterial = (MATERIALS as readonly string[]).includes(materialRaw)
    ? (materialRaw as PartMaterial)
    : (DEFAULT_MATERIAL_BY_ROLE[role] ?? 'plastic');

  const part: BlueprintPart = {
    shape,
    size: normalizeSize(shape, v.size),
    position: vec3(v.position, [0, 0.5, 0], -LIMITS.coordMax, LIMITS.coordMax),
    color,
    role,
    material,
  };
  if (v.rotation !== undefined) {
    part.rotation = vec3(v.rotation, [0, 0, 0], -360, 360);
  } else if (role === 'wheel' && (shape === 'cylinder' || shape === 'capsule')) {
    // 車輪なのに回転が無いと寝かせた円盤になってしまうので、車軸を Z に向ける
    part.rotation = [90, 0, 0];
  }
  if (shape === 'box') {
    const r = num(v.round);
    if (r !== null) part.round = r3(clamp(r, 0, 1));
  }
  return part;
}

/** stats を「各 1〜10、合計ちょうど statTotal」に揃える（比率はなるべく保つ） */
export function normalizeStats(v: unknown): CarStats {
  const src = isObject(v) ? v : {};
  const raw = STAT_KEYS.map((k) => {
    const n = num(src[k]);
    return n === null ? 6 : clamp(n, LIMITS.statMin, LIMITS.statMax);
  });
  const { statMin: lo, statMax: hi, statTotal: total } = LIMITS;

  // 比率を保ったまま合計を total に近づける（上下限で切れた分は残りに配り直す）
  let x = raw.slice();
  for (let iter = 0; iter < 8; iter++) {
    const sum = x.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - total) < 1e-6) break;
    const free = x.map((val, i) => (sum < total ? val < hi : val > lo) ? i : -1).filter((i) => i >= 0);
    const freeSum = free.reduce((a, i) => a + x[i], 0);
    if (freeSum <= 0) break;
    const k = (total - (sum - freeSum)) / freeSum;
    x = x.map((val, i) => (free.includes(i) ? clamp(val * k, lo, hi) : val));
  }

  // 整数化（最大剰余法）
  const ints = x.map((val) => clamp(Math.floor(val), lo, hi));
  let rest = total - ints.reduce((a, b) => a + b, 0);
  const order = x
    .map((val, i) => ({ i, frac: val - Math.floor(val) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let guard = 0; rest !== 0 && guard < 100; guard++) {
    for (const { i } of order) {
      if (rest > 0 && ints[i] < hi) {
        ints[i]++;
        rest--;
      } else if (rest < 0 && ints[i] > lo) {
        ints[i]--;
        rest++;
      }
      if (rest === 0) break;
    }
  }
  return { speed: ints[0], acceleration: ints[1], handling: ints[2], stability: ints[3] };
}

/** パーツのおおよその外形（回転しているものは外接球で近似） */
export function approxBounds(parts: BlueprintPart[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const s = p.size;
    let half: Vec3;
    switch (p.shape) {
      case 'box':
        half = [s[0] / 2, s[1] / 2, s[2] / 2];
        break;
      case 'sphere':
        half = s.length >= 3 ? [s[0], s[1], s[2]] : [s[0], s[0], s[0]];
        break;
      case 'cylinder': {
        const r = Math.max(s[0], s[2] ?? 0);
        half = [r, s[1] / 2, r];
        break;
      }
      case 'cone':
        half = [s[0], s[1] / 2, s[0]];
        break;
      case 'torus':
        half = [s[0] + s[1], s[0] + s[1], s[1]];
        break;
      case 'capsule':
        half = [s[0], s[1] / 2 + s[0], s[0]];
        break;
    }
    const rotated = p.rotation && p.rotation.some((a) => Math.abs(a % 360) > 1e-3);
    if (rotated) {
      const r = Math.hypot(half[0], half[1], half[2]);
      half = [r, r, r];
    }
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.position[i] - half[i]);
      max[i] = Math.max(max[i], p.position[i] + half[i]);
    }
  }
  return { min, max };
}

/** 車輪が 1 つも無いときに付ける 4 輪 */
function autoWheels(parts: BlueprintPart[]): BlueprintPart[] {
  const { min, max } = approxBounds(parts);
  const len = max[0] - min[0];
  const height = max[1] - min[1];
  const r = clamp(Math.min(height * 0.35, len * 0.2), 0.15, 0.5);
  const cx = (max[0] + min[0]) / 2;
  const x = Math.max(len / 2 - r * 1.2, r);
  const zOff = Math.max((max[2] - min[2]) / 2, r);
  const y = min[1] + r * 0.4;
  const wheels: BlueprintPart[] = [];
  for (const dx of [x, -x]) {
    for (const dz of [zOff, -zOff]) {
      const c = (v: number) => r3(clamp(v, -LIMITS.coordMax, LIMITS.coordMax));
      wheels.push({
        shape: 'cylinder',
        size: [r3(r), r3(r * 0.6)],
        position: [c(cx + dx), c(y), c(dz)],
        rotation: [90, 0, 0],
        color: '#333333',
        role: 'wheel',
        material: 'rubber',
      });
    }
  }
  return wheels;
}

/** 入力がまったく使えないときの「とりあえず走れる車」 */
export function fallbackParts(): BlueprintPart[] {
  return [
    { shape: 'box', size: [1.7, 0.55, 1.0], position: [0, 0.5, 0], color: '#ff7043', role: 'body', material: 'plastic', round: 0.6 },
    { shape: 'box', size: [0.9, 0.45, 0.85], position: [-0.15, 0.95, 0], color: '#ffccbc', role: 'cabin', material: 'plastic', round: 0.7 },
    { shape: 'box', size: [0.05, 0.3, 0.7], position: [0.3, 0.95, 0], color: '#9fd3ff', role: 'window', material: 'glass', round: 0.3 },
  ];
}

export function normalizeBlueprint(input: unknown): NormalizeResult {
  const issues: string[] = [];
  let src: Record<string, unknown> = {};
  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input);
      if (isObject(parsed)) src = parsed;
      else issues.push('JSON がオブジェクトではありません');
    } catch {
      issues.push('JSON として読めませんでした');
    }
  } else if (isObject(input)) {
    src = input;
  } else {
    issues.push('設計図がオブジェクトではありません');
  }

  let parts: BlueprintPart[] = [];
  if (Array.isArray(src.parts)) {
    src.parts.forEach((p, i) => {
      const part = normalizePart(p, issues, i);
      if (part) parts.push(part);
    });
  } else {
    issues.push('parts がありません');
  }
  if (parts.length > LIMITS.maxParts) {
    issues.push(`パーツが多すぎるので ${LIMITS.maxParts} 個までにしました`);
    // 車輪は優先して残す
    const wheels = parts.filter((p) => p.role === 'wheel').slice(0, 8);
    const others = parts.filter((p) => p.role !== 'wheel').slice(0, LIMITS.maxParts - wheels.length);
    parts = [...others, ...wheels];
  }
  if (parts.filter((p) => p.role !== 'wheel').length === 0) {
    issues.push('車体が無いので標準の車体を使いました');
    parts = [...fallbackParts(), ...parts.filter((p) => p.role === 'wheel')];
  }

  const styleRaw = typeof src.wheelStyle === 'string' ? src.wheelStyle.trim().toLowerCase() : '';
  const wheelStyle: WheelStyle = (WHEEL_STYLES as readonly string[]).includes(styleRaw)
    ? (styleRaw as WheelStyle)
    : 'normal';

  if (wheelStyle !== 'none' && !parts.some((p) => p.role === 'wheel')) {
    issues.push('車輪が無いので 4 輪を付けました');
    const wheels = autoWheels(parts);
    parts = [...parts.slice(0, LIMITS.maxParts - wheels.length), ...wheels];
  }

  const blueprint: CarBlueprint = {
    version: BLUEPRINT_VERSION,
    name: sanitizeText(src.name, LIMITS.nameMax, 'ナゾの車'),
    concept: sanitizeText(src.concept, LIMITS.conceptMax, 'ふしぎな一台'),
    parts,
    wheelStyle,
    stats: normalizeStats(src.stats),
    personality: sanitizeText(src.personality, LIMITS.personalityMax, 'マイペース'),
    catchphrase: sanitizeText(src.catchphrase, LIMITS.catchphraseMax, 'いくぞー！'),
  };
  const prompt = sanitizeText(src.prompt, LIMITS.promptMax, '');
  if (prompt) blueprint.prompt = prompt;
  return { blueprint, issues };
}
