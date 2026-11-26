import { expect, test } from '@playwright/test';

/**
 * 画面遷移のたびに走る ScrollToTop の回帰テスト。
 * useEffect のブレースを省くと scrollTo の戻り値がそのまま返り、React 19 はそれを
 * クリーンアップ関数として次の遷移で呼ぶ。scrollTo を差し替える拡張機能が入った Chrome で
 * 実際に画面が真っ暗になった（#root が空になる）ため、その状況を再現して守る。
 */
test('scrollTo が値を返す環境でも、画面遷移で落ちない', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => {
    const original = window.scrollTo.bind(window);
    // 拡張機能による差し替えを模して、戻り値を持たせる
    window.scrollTo = ((...args: unknown[]) => {
      (original as (...a: unknown[]) => void)(...args);
      return true;
    }) as unknown as typeof window.scrollTo;
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByTestId('game-card-whose-answer').click();
  await expect(page.getByTestId('create-room')).toBeVisible();

  // さらに遷移を重ねても落ちないこと
  await page.getByRole('link', { name: 'ルームコードで参加' }).click();
  await expect(page.getByPlaceholder('AB12CD')).toBeVisible();

  expect(errors).toEqual([]);
  await context.close();
});

test('10秒裁判は一覧に出さない（トップとロビーのゲーム変更）。URL を直接開けば遊べる', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-card-whose-answer')).toBeVisible();
  await expect(page.getByTestId('game-card-ten-sec-trial')).toHaveCount(0);
  await page.goto('/play/ten-sec-trial');
  await expect(page.getByTestId('create-room')).toBeVisible();
});
