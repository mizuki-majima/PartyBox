import { expect, test } from '@playwright/test';

/**
 * 通常のゲームを「1人で試す」（/demo/<ゲーム>）。
 * PC の大きさのページ1枚に、全員ぶんの画面（iframe）が並ぶ。枠の中は frameLocator で操作する
 */
test('1人で試す: 入口 → 4人ぶんの画面 → ホストの枠で開始 → 全員の枠で回答 → 人数を変える', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/play/whose-answer');
  await page.getByTestId('solo-demo-link').click();
  await expect(page).toHaveURL(/\/demo\/whose-answer$/);
  await expect(page.getByTestId('demo-count-4')).toHaveAttribute('aria-pressed', 'true');

  const frame = (n: number) => page.frameLocator(`[data-testid="demo-frame-プレイヤー${n}"]`);
  for (let n = 1; n <= 4; n++) {
    await expect(frame(n).getByTestId('player-count')).toHaveText('4', { timeout: 20_000 });
    await expect(frame(n).getByTestId('demo-badge')).toBeVisible();
  }
  // 1枚目がホスト（設定と「スタート」は1枚目にだけ出る）
  await expect(frame(1).getByTestId('start-game')).toBeVisible();
  await expect(frame(2).getByTestId('start-game')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/solo-demo-lobby-desktop.png' });

  await frame(1).getByRole('button', { name: '2ラウンド' }).click();
  await frame(1).getByTestId('start-game').click();
  for (let n = 1; n <= 4; n++) {
    await frame(n).getByTestId('answer-input').fill(`答え${n}`);
    await frame(n).getByTestId('answer-submit').click();
  }
  // 全員が答えたら推理に進む（推理の画面に、ほかの人の答えが出る）
  await expect(frame(1).getByText('答え2')).toBeVisible({ timeout: 20_000 });

  // 人数を変えると、ルームを作り直して3人ぶんになる（ロビーから）
  await page.getByTestId('demo-count-3').click();
  await expect(page.locator('[data-testid^="demo-frame-"]')).toHaveCount(3);
  await expect(frame(1).getByTestId('player-count')).toHaveText('3', { timeout: 20_000 });
  await expect(frame(1).getByTestId('start-game')).toBeVisible();
});
