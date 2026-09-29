/**
 * 入力文の「表記ゆれ」をならすための文字列処理。
 * - 全角英数 → 半角、半角カナ → 全角（NFKC）
 * - カタカナ → ひらがな
 * - 英字は小文字、空白は除去
 * 辞書側のパターンも同じ関数を通すので、「カッコイイ」「かっこいい」のどちらで書いても一致する。
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, '');
}

export function hiraganaToKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

const STOP_WORDS = new Set([
  '車',
  '自動車',
  'くるま',
  'クルマ',
  'カー',
  '感じ',
  '雰囲気',
  '普通',
  '一番',
  '世界',
  '日本',
  '時代',
  '感',
  'やつ',
  'もの',
  'みたい',
  'っぽい',
  'そう',
]);

/**
 * 名前に使えそうな「それっぽい単語」を 1 つ拾う（辞書に無い単語用）。
 * 例: 「宇宙人が乗ってそうな車」→「宇宙人」、「ぷにぷにの車」→「プニプニ」
 */
export function extractKeyword(input: string): string | null {
  const s = input
    .normalize('NFKC')
    .trim()
    .replace(/(みたいな|っぽい|そうな|のような|ような|らしい|な|の)?(車|くるま|クルマ|カー|自動車)[!！。…〜ー]*$/u, '');
  // 「に」「と」などの助詞は「ぷにぷに」のような言葉の中にも出てくるので、区切りには使わない
  const chunks = s.split(/みたいな|っぽい|そうな|のような|ような|[のがを、。！？!?\s・「」『』()（）]+/u).filter(Boolean);
  for (const chunk of chunks) {
    const kata = /[ァ-ヺー]{2,}/u.exec(chunk);
    if (kata && !STOP_WORDS.has(kata[0])) return kata[0].slice(0, 8);
    const kanji = /[一-鿿々]{2,}/u.exec(chunk);
    if (kanji && !STOP_WORDS.has(kanji[0])) return kanji[0].slice(0, 6);
    const alpha = /[a-zA-Z][a-zA-Z0-9]{1,9}/.exec(chunk);
    if (alpha) return alpha[0].toUpperCase();
    const hira = /^[ぁ-ゖー]{2,6}$/u.exec(chunk);
    if (hira && !STOP_WORDS.has(hira[0])) return hiraganaToKatakana(hira[0]);
  }
  return null;
}
