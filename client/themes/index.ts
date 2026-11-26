/**
 * デザインの切り替え
 *
 * デザイン（テーマ）は client/themes/<名前>.css の1ファイルで、<html data-theme="名前"> で切り替わる。
 * - 共通画面（トップ・部屋の作成と参加・待機画面）は 'platform'
 * - ゲームに入ると、そのゲームのテーマ。ロビーに戻る・退出すると 'platform' に戻る（useTheme の後片付け）
 *
 * <html> に付けるので、body 直下に出すダイアログやトースト、固定の帯も同じテーマになる。
 * トークンは [data-theme='名前'] の中だけに書いてあるので、ほかのテーマには漏れない。
 *
 * ゲームを足すとき: テーマの CSS を1つ作り、index.css で読み込み、下の THEMES と GAME_THEMES に1行ずつ足す
 * （手順は docs/design.md）。
 */
import { useEffect } from 'react';
import type { GameId } from '../../shared/games';
// 文字は自前で配信する（外のサーバーから読み込まない）。共通画面のぶんだけ最初に読み、
// ゲームのぶんは、そのテーマを使うときに読む（全部を最初に読むと、スマホで開くのが遅くなる）。
// 読めるまで・読めなかったときは、各テーマの --t-font-* に書いた代わりの文字で出る
import './fonts/platform';

/**
 * テーマの一覧。chrome はブラウザの枠（アドレスバーなど）に付ける色、fonts はそのテーマの文字の読み込み
 */
export const THEMES = {
  platform: { chrome: '#fafafa', fonts: () => Promise.resolve() },
  unanimous: { chrome: '#ffde00', fonts: () => import('./fonts/unanimous') },
  'whose-answer': { chrome: '#fdf8ec', fonts: () => import('./fonts/whose-answer') },
  'party-event': { chrome: '#f6f8fa', fonts: () => import('./fonts/party-event') },
  liar: { chrome: '#0e0e10', fonts: () => import('./fonts/liar') },
  'grow-answer': { chrome: '#d9c7a3', fonts: () => import('./fonts/grow-answer') },
  'ten-sec-trial': { chrome: '#f4efe4', fonts: () => import('./fonts/ten-sec-trial') },
} as const satisfies Record<string, { chrome: string; fonts: () => Promise<unknown> }>;

export type ThemeName = keyof typeof THEMES;

export const PLATFORM_THEME: ThemeName = 'platform';

/** ゲームごとのテーマ（ゲームを足すときは、ここに1行足す） */
export const GAME_THEMES: Record<GameId, ThemeName> = {
  'whose-answer': 'whose-answer',
  unanimous: 'unanimous',
  liar: 'liar',
  'grow-answer': 'grow-answer',
  'ten-sec-trial': 'ten-sec-trial',
  'party-event': 'party-event',
};

export function themeOfGame(gameId: string): ThemeName {
  return (GAME_THEMES as Record<string, ThemeName | undefined>)[gameId] ?? PLATFORM_THEME;
}

/** そのテーマの文字を読み込んでおく（読めなくても、代わりの文字で出るので何もしない） */
export function loadThemeFonts(name: ThemeName): void {
  void THEMES[name].fonts().catch(() => undefined);
}

function apply(name: ThemeName): void {
  document.documentElement.dataset.theme = name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[name].chrome);
  loadThemeFonts(name);
}

/**
 * この部品が画面にある間、ページ全体をそのテーマにする。画面から外れたら共通画面のテーマに戻す。
 * ゲーム中の枠（GameShell）で使う
 */
export function useTheme(name: ThemeName): void {
  useEffect(() => {
    apply(name);
    return () => apply(PLATFORM_THEME);
  }, [name]);
}

/** 起動時に共通画面のテーマにしておく */
export function initTheme(): void {
  apply(PLATFORM_THEME);
}
