import { expect, test } from '@playwright/test';
import { SHOT_DIR } from './helpers';

test('プロンプト・グランプリ: トップのカード → 車づくり → ライバル紹介 → レース開始 → PartyBox に戻る', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  const card = page.getByTestId('game-card-prompt-grand-prix');
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL('**/grand-prix/');

  // タイトル（背景でデモのレースが走る）
  await expect(page.locator('.title-logo')).toBeVisible();
  await expect(page.locator('.fatal')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT_DIR}/grand-prix-title.png` });
  await page.getByRole('button', { name: 'あそぶ' }).click();

  // 車づくり
  await page.getByLabel('どんな車？').fill('カレーの匂いがしそうな車');
  await page.getByRole('button', { name: 'この言葉で車をつくる' }).click();
  await expect(page.locator('.car-name')).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/grand-prix-build.png` });
  await page.getByRole('button', { name: 'この車でレースへ！' }).click();

  // ライバル紹介 → レース
  await page.getByRole('button', { name: 'とばす' }).click();
  await page.getByRole('button', { name: 'レーススタート！' }).click();
  await expect(page.locator('.race-screen')).toBeVisible();
  await expect(page.locator('.rank-board')).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/grand-prix-race.png` });

  // タイトルから PartyBox のトップへ戻れる
  await page.goto('/grand-prix');
  await page.waitForURL('**/grand-prix/');
  await page.getByTestId('home-link-corner').click();
  await page.waitForURL((url) => url.pathname === '/');
  await expect(card).toBeVisible();

  expect(errors).toEqual([]);
});
