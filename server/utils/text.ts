/** ユーザー入力の文字列を整える（制御文字除去・前後空白除去・長さ制限） */
export function cleanText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return '';
  return (
    input
      // 改行・タブ・制御文字をスペースに
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );
}

/**
 * 回答の一致判定用の正規化。
 *  - 全角/半角・大文字/小文字の違いを吸収（NFKC + lowercase）
 *  - カタカナ → ひらがな
 *  - 空白・句読点・記号を除去
 */
export function normalizeAnswer(input: string): string {
  let t = input.normalize('NFKC').toLowerCase();
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  t = t.replace(/[\s・･.,、。，．!！?？「」『』()（）[\]【】{}〜~_'"“”‘’`*＊#＃&＆+＋=＝:：;；/／\\|｜<>＜＞@＠^$%]/g, '');
  return t || input.trim();
}
