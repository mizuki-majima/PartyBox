import { normalizeBlueprint } from './schema';
import type { CarBlueprint } from './types';

/**
 * 設計図 ⇔ 文字列。将来「友達の車と対戦（URL で共有）」をするときに使う。
 * UTF-8 の JSON を base64url にするだけの素朴な形式。
 * 読み込み側は必ず normalizeBlueprint を通すので、改ざんされた文字列でも安全に車になる。
 */

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 数値の桁を落としてから JSON にする（URL を短くするため） */
export function blueprintToJson(bp: CarBlueprint): string {
  return JSON.stringify(bp, (_key, value: unknown) => (typeof value === 'number' ? round(value) : value));
}

export function encodeBlueprint(bp: CarBlueprint): string {
  const bytes = new TextEncoder().encode(blueprintToJson(bp));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBlueprint(code: string): CarBlueprint | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return normalizeBlueprint(json).blueprint;
  } catch {
    return null;
  }
}
