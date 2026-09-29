import { randomBytes, randomInt } from 'node:crypto';

/** 読み間違えやすい文字（0/O, 1/I/L）を除いた英数字 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function generateToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

export function generateId(bytes = 6): string {
  return randomBytes(bytes).toString('base64url');
}

export function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** 直近で使ったものを避けつつ、重複なしで n 個選ぶ */
export function pickMany<T>(items: readonly T[], n: number): T[] {
  return shuffle(items).slice(0, n);
}
