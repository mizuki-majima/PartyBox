import { expect, test } from '@playwright/test';
import { closeAll, setupRoom } from './helpers';

/**
 * 勝者の記録。ゲームを最後まで遊ぶと、トップの1つ奥のページ（/results）に、終わった時刻と結果が残る。
 * （個人の順位の付き方・同点・保存は tests/results.test.ts で確かめている）
 */
test('勝者の記録: 最後まで遊んだゲームが、時刻と番号つきで一覧に出る', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'unanimous', ['みずき', 'たろう', 'はな']);
  await host.page.getByRole('button', { name: '3ラウンド' }).click();
  await host.page.getByTestId('start-game').click();

  for (let round = 0; round < 3; round++) {
    for (const p of players) {
      await p.page.getByTestId('answer-input').fill('おにぎり');
      await p.page.getByTestId('answer-submit').click();
    }
    await host.page.getByTestId('host-next').click();
  }
  await expect(host.page.getByText('結果発表！')).toBeVisible();
  // 結果の画面で、記録に残ったことが分かる
  await expect(host.page.getByTestId('result-recorded')).toBeVisible();

  // トップの右上の小さな入口から、1つ奥のページへ
  const viewer = await host.context.newPage();
  await viewer.goto('/');
  await viewer.getByTestId('results-link').click();
  await viewer.waitForURL(/\/results$/);
  await expect(viewer.getByRole('heading', { name: '勝者の記録' })).toBeVisible();

  const row = viewer.getByTestId('result-row').filter({ hasText: '全員一致を目指せ！' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId('result-time')).toHaveText(/^\d{2}:\d{2}$/); // 何時何分に終わったか
  // 全員で1チームのゲームなので、1位ではなくチームの点が出る
  await expect(row.getByTestId('result-winners')).toContainText('順位なし');
  await expect(row.getByTestId('result-winners')).toContainText('チーム得点');
  // 参加した人は、開くと見られる
  await row.getByText('参加した人を見る').click();
  for (const name of ['みずき', 'たろう', 'はな']) await expect(row).toContainText(name);

  // 「今日」と「すべて」を切り替えられる
  await viewer.getByTestId('results-scope-all').click();
  await expect(viewer.getByTestId('results-scope-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer.getByTestId('result-row').first()).toBeVisible();
  await viewer.screenshot({ path: 'e2e/screenshots/results-desktop.png', fullPage: true });

  await closeAll(players);
});
