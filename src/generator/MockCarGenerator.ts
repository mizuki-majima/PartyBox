import { lighten } from '../blueprint/colors';
import { normalizeBlueprint } from '../blueprint/schema';
import { LIMITS, STAT_KEYS, type CarBlueprint, type CarStats, type WheelStyle } from '../blueprint/types';
import { hashString, Rng } from '../util/rng';
import { ADDONS, applyAddon, RANDOM_ADDONS, type AddonId } from './addons';
import type { CarGenerator, GenerateOptions } from './CarGenerator';
import { TRAITS, type Trait } from './dictionary';
import { COLOR_WORDS, PALETTES, RAINBOW, RANDOM_PALETTES, type Palette, type PaletteId } from './palettes';
import { PartList } from './parts';
import {
  ANIMAL_KINDS,
  animalNoun,
  ARCHETYPES,
  DEFAULT_MODS,
  RANDOM_ARCHETYPES,
  type AnimalKind,
  type ArchetypeId,
  type Mods,
} from './templates';
import { extractKeyword, normalizeText } from './text';

// ───────────────────────── 入力文の解析 ─────────────────────────

interface DictEntry {
  pattern: string;
  traits: Trait[];
  color?: (typeof COLOR_WORDS)[number];
}

/** 辞書を「正規化したパターン → 特徴」の表にして、長い順に並べておく */
const ENTRIES: DictEntry[] = (() => {
  const map = new Map<string, DictEntry>();
  const get = (raw: string) => {
    const pattern = normalizeText(raw);
    let e = map.get(pattern);
    if (!e) {
      e = { pattern, traits: [] };
      map.set(pattern, e);
    }
    return e;
  };
  for (const trait of TRAITS) for (const p of trait.patterns) get(p).traits.push(trait);
  for (const cw of COLOR_WORDS) for (const p of cw.patterns) get(p).color ??= cw;
  return [...map.values()].filter((e) => e.pattern.length > 0).sort((a, b) => b.pattern.length - a.pattern.length);
})();

export interface PromptAnalysis {
  normalized: string;
  /** 見つかった特徴（文中に出てきた順） */
  traits: Trait[];
  /** 見つかった色（文中に出てきた順） */
  colors: string[];
  colorPalette?: PaletteId;
  /** 辞書に無い単語から拾った名前候補 */
  keyword: string | null;
}

export function analyzePrompt(prompt: string): PromptAnalysis {
  const normalized = normalizeText(prompt);
  let rest = normalized;
  const hits: { at: number; entry: DictEntry }[] = [];
  for (const entry of ENTRIES) {
    let idx = rest.indexOf(entry.pattern);
    while (idx >= 0) {
      hits.push({ at: idx, entry });
      // 使った文字は潰して、短いパターンが重ねて当たらないようにする
      rest = rest.slice(0, idx) + '\u0000'.repeat(entry.pattern.length) + rest.slice(idx + entry.pattern.length);
      idx = rest.indexOf(entry.pattern);
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const traits: Trait[] = [];
  const colors: string[] = [];
  let colorPalette: PaletteId | undefined;
  for (const { entry } of hits) {
    for (const t of entry.traits) if (!traits.includes(t)) traits.push(t);
    if (entry.color) {
      if (!colors.includes(entry.color.color)) colors.push(entry.color.color);
      colorPalette ??= entry.color.palette;
    }
  }
  return { normalized, traits, colors, colorPalette, keyword: extractKeyword(prompt) };
}

// ───────────────────────── 設計 ─────────────────────────

const GENERIC_STEMS = ['ナゾナゾ', 'ミラクル', 'ハテナ', 'ドキドキ', 'ワクワク', 'キラリ', 'ポップ', 'ジャンプ', 'ゴキゲン', 'ピース'];
const GENERIC_ADJ = ['ごきげんな', 'ふしぎな', 'ユニークな', 'やる気まんまんの', 'ちょっと気になる', 'ほがらかな', '元気いっぱいの'];

const VARIANTS: Partial<Record<ArchetypeId, string[]>> = {
  yatai: ['curry', 'ramen', 'oden', 'takoyaki'],
  shinkansen: ['loco'],
  truck: ['gifts'],
};

/** 顔や鍋などを最初から持っている型には、同じ飾りを重ねない */
const SKIP_ADDONS: Partial<Record<ArchetypeId, AddonId[]>> = {
  animal: ['eyes', 'cheeks', 'catEars', 'spoiler', 'booster', 'wings'],
  yatai: ['pot', 'lantern', 'spoiler', 'booster'],
  ufo: ['antenna', 'booster', 'spoiler'],
  rocket: ['booster'],
  cake: ['pot', 'flower', 'spoiler', 'booster'],
  gissha: ['spoiler', 'booster', 'eyes', 'cheeks'],
};

function pickWeighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rng.next() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

function shorten(text: string, max: number): string {
  const chars = Array.from(text.trim());
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}

/**
 * 入力文から設計図を作る（同期・決定的）。
 * 同じ文（表記ゆれ込み）なら、いつでも同じ車になる。
 */
export function designCar(prompt: string): CarBlueprint {
  const text = shorten(prompt, LIMITS.promptMax) || 'おまかせの車';
  const an = analyzePrompt(text);
  const rng = new Rng(hashString(an.normalized || text));
  const traits = an.traits;
  const known = traits.length > 0 || an.colors.length > 0;

  // 形の型
  let archetypeId: ArchetypeId;
  const withArch = traits.filter((t) => t.archetype);
  if (withArch.length) {
    archetypeId = withArch.reduce((best, t) => ((t.priority ?? 1) > (best.priority ?? 1) ? t : best)).archetype!;
  } else {
    archetypeId = pickWeighted(rng, RANDOM_ARCHETYPES);
  }
  const arch = ARCHETYPES[archetypeId];

  // バリエーション（動物の種類、屋台の売り物など）
  let variant: string | undefined;
  if (archetypeId === 'animal') {
    variant = traits.find((t) => t.animal)?.animal ?? rng.pick(ANIMAL_KINDS);
  } else {
    const allowed = VARIANTS[archetypeId] ?? [];
    variant = traits.map((t) => t.variant).find((v) => v && allowed.includes(v));
  }

  // 寸法の補正
  const mods: Mods = { ...DEFAULT_MODS };
  for (const t of traits) {
    for (const k of Object.keys(t.mods ?? {}) as (keyof Mods)[]) mods[k] *= t.mods![k]!;
  }
  if (!traits.some((t) => t.mods)) {
    mods.length *= rng.range(0.92, 1.1);
    mods.height *= rng.range(0.85, 1.15);
    mods.round *= rng.range(0.7, 1.3);
    mods.wheel *= rng.range(0.9, 1.15);
  }
  mods.height = Math.min(1.8, Math.max(0.45, mods.height));
  mods.length = Math.min(1.6, Math.max(0.7, mods.length));
  mods.width = Math.min(1.4, Math.max(0.8, mods.width));
  mods.wheel = Math.min(1.6, Math.max(0.7, mods.wheel));

  // 配色
  const traitPalette = traits.find((t) => t.palette)?.palette;
  const paletteId = an.colorPalette ?? traitPalette;
  const customColor = paletteId !== undefined || an.colors.length > 0;
  let pal: Palette = { ...PALETTES[paletteId ?? rng.pick(RANDOM_PALETTES)] };
  if (!paletteId && arch.palette) pal = { ...pal, ...arch.palette };
  if (an.colors.length > 0 && !pal.rainbow) {
    pal.body = an.colors[0];
    pal.cabin = paletteId ? pal.cabin : lighten(an.colors[0], 0.65);
    if (an.colors[1]) pal.accent = an.colors[1];
  }

  // 組み立て
  const list = new PartList(LIMITS.maxParts);
  const anchors = arch.build({ rng, pal, mods, variant, customColor, list });

  // 飾り
  const skip = SKIP_ADDONS[archetypeId] ?? [];
  const addons: AddonId[] = [];
  for (const id of [...(arch.addons ?? []), ...traits.flatMap((t) => t.addons ?? [])] as AddonId[]) {
    if (!addons.includes(id) && !skip.includes(id)) addons.push(id);
  }
  if (!known || rng.chance(0.25)) {
    const extra = rng.shuffle(RANDOM_ADDONS).filter((id) => !skip.includes(id) && !addons.includes(id));
    addons.push(...extra.slice(0, known ? 1 : rng.int(1, 2)));
  }
  const s = mods.scale;
  for (const id of addons.slice(0, 4)) {
    if (id in ADDONS) applyAddon(id, { list, pal, a: anchors, s });
  }
  const parts = list.parts;

  // 虹色は車体系のパーツを順番に塗り分ける
  if (pal.rainbow) {
    let i = rng.int(0, RAINBOW.length - 1);
    for (const p of parts) {
      if (['body', 'cabin', 'roof', 'bumper', 'spoiler', 'deco'].includes(p.role ?? '') && [pal.body, pal.accent, pal.cabin].includes(p.color)) {
        p.color = RAINBOW[i++ % RAINBOW.length];
      }
    }
  }
  if (pal.bodyMaterial) {
    for (const p of parts) {
      if ((p.role === 'body' || p.role === 'roof') && p.color === pal.body && !p.material) p.material = pal.bodyMaterial;
    }
  }

  let wheelStyle: WheelStyle = [...traits].reverse().find((t) => t.wheelStyle)?.wheelStyle ?? arch.wheelStyle;
  if (archetypeId === 'ufo') wheelStyle = 'none';

  // 性能: 型の基本値 + 特徴の補正 + ちょっとの個性（合計は normalize で 24 に揃う）
  const stats: CarStats = { ...arch.stats };
  for (const t of traits) for (const k of STAT_KEYS) stats[k] += t.stats?.[k] ?? 0;
  for (const k of STAT_KEYS) stats[k] += rng.int(-1, 1);

  // 名前
  const nameTraits = traits.filter((t) => t.names?.length);
  let stem: string;
  if (nameTraits.length >= 2 && rng.chance(0.3)) {
    stem = rng.pick(nameTraits[0].names!) + rng.pick(nameTraits[1].names!);
  } else if (nameTraits.length) {
    stem = rng.pick(nameTraits[0].names!);
  } else {
    stem = an.keyword ?? rng.pick(GENERIC_STEMS);
  }
  const suffixes = traits.find((t) => t.suffixes)?.suffixes ?? arch.suffixes;
  const name = shorten(stem + rng.pick(suffixes), LIMITS.nameMax);

  // 概要
  const noun = archetypeId === 'animal' ? animalNoun(variant as AnimalKind) : arch.noun;
  const adj = rng.pick(traits.find((t) => t.adj)?.adj ?? GENERIC_ADJ);
  const motif = traits.find((t) => t.motif)?.motif;
  let concept: string;
  if (motif && rng.chance(0.6)) concept = `${motif}をモチーフにした${adj}一台`;
  else if (rng.chance(0.5)) concept = `「${shorten(text, 16)}」から生まれた${adj}${noun}`;
  else concept = `${adj}${noun}。${motif ? `${motif}の魂を宿している` : 'ここに参上'}`;

  const personality = rng.pick(traits.flatMap((t) => t.personality ?? []).concat(traits.some((t) => t.personality) ? [] : arch.personality));
  const catchphrase = rng.pick(traits.flatMap((t) => t.catchphrase ?? []).concat(traits.some((t) => t.catchphrase) ? [] : arch.catchphrase));

  return normalizeBlueprint({
    name,
    concept,
    prompt: text,
    parts,
    wheelStyle,
    stats,
    personality,
    catchphrase,
  }).blueprint;
}

// ───────────────────────── ジェネレーター ─────────────────────────

const PROGRESS_STEPS = ['イメージを読み取り中…', 'パーツを組み立て中…', '色をぬっています…', '性能を調整中…'];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/**
 * API を呼ばないデモ用の生成器。
 * キーワード辞書で特徴を拾い、辞書に無い部分は入力文のハッシュを種にした乱数で決める。
 * それっぽさを出すため、1〜2 秒かけて「生成中…」を演出する。
 */
export class MockCarGenerator implements CarGenerator {
  readonly label = 'デモ版（AI生成は準備中）';
  private readonly minDelay: number;
  private readonly maxDelay: number;

  constructor(opts: { minDelayMs?: number; maxDelayMs?: number } = {}) {
    this.minDelay = opts.minDelayMs ?? 1100;
    this.maxDelay = opts.maxDelayMs ?? 1800;
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<CarBlueprint> {
    const total = this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
    for (const step of PROGRESS_STEPS) {
      options.onProgress?.(step);
      await sleep(total / PROGRESS_STEPS.length, options.signal);
    }
    try {
      return designCar(prompt);
    } catch (err) {
      // ここに来ることはまず無いが、それでも車は必ず出す
      console.error(err);
      return normalizeBlueprint({ name: 'ナゾの車', prompt }).blueprint;
    }
  }
}
