import { expect, test } from '@playwright/test';
import { closeAll, createRoom, joinRoom, newPlayer, setupRoom } from './helpers';

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

test('勝者の記録: 夕食のチームでゲームを遊ぶと、ルームと記録にチーム名が付き、懇親会の画面に戻れる', async ({ browser }) => {
  const mc = await newPlayer(browser, '司会', 'desktop');
  const sakura = await newPlayer(browser, 'さくら', 'phone');

  // 懇親会のルーム（始めておく）に、名簿から入る
  const eventCode = await createRoom(mc, 'party-event');
  await mc.page.getByTestId('start-game').click();
  await sakura.page.goto(`/room/${eventCode}`);
  await sakura.page.getByTestId('join-roster-person').filter({ hasText: 'さくら' }).click();
  await sakura.page.getByTestId('join-submit').click();

  // 夕食の席の自分のチームから「このチームでゲームを遊ぶ」→ トップでゲームを選ぶ
  await sakura.page.getByTestId('team-play').click();
  await sakura.page.waitForURL(/\/$/);
  await expect(sakura.page.getByTestId('team-play-banner')).toContainText('チーム A');
  await sakura.page.goto('/play/unanimous');
  await expect(sakura.page.getByTestId('create-team-label')).toContainText('チーム A');
  await sakura.page.getByPlaceholder('例：みずき').fill('さくら');
  await sakura.page.getByTestId('create-room').click();
  await sakura.page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  await expect(sakura.page.getByTestId('room-label')).toContainText('チーム A');
  const code = await sakura.page.getByTestId('room-code').innerText();

  const others = [await newPlayer(browser, 'かえで', 'phone'), await newPlayer(browser, 'ひまわり', 'phone')];
  // かえでは、懇親会の画面を開いてから、招待（コード）でゲームに入る
  await others[0].page.goto(`/room/${eventCode}`);
  await others[0].page.getByTestId('join-roster-person').filter({ hasText: 'かえで' }).click();
  await others[0].page.getByTestId('join-submit').click();
  await expect(others[0].page.getByTestId('me-bar')).toBeVisible();
  for (const p of others) await joinRoom(p, code);
  // 招待で入った人にも、チーム名と「懇親会の画面に戻る」が出る（懇親会を開いていない人には戻り先が無い）
  await expect(others[0].page.getByTestId('room-label')).toContainText('チーム A');
  await expect(others[0].page.getByTestId('back-to-event')).toBeVisible();
  await expect(others[1].page.getByTestId('back-to-event')).toHaveCount(0);
  const players = [sakura, ...others];
  await sakura.page.getByRole('button', { name: '3ラウンド' }).click();
  await sakura.page.getByTestId('start-game').click();
  for (let round = 0; round < 3; round++) {
    for (const p of players) {
      await p.page.getByTestId('answer-input').fill('おにぎり');
      await p.page.getByTestId('answer-submit').click();
    }
    await sakura.page.getByTestId('host-next').click();
  }
  await expect(sakura.page.getByText('結果発表！')).toBeVisible();

  // 記録にチーム名が付く
  const viewer = await sakura.context.newPage();
  await viewer.goto('/results');
  const row = viewer.getByTestId('result-row').filter({ hasText: '全員一致を目指せ！' }).first();
  await expect(row.getByTestId('result-label')).toHaveText('チーム A');

  // 懇親会の画面に戻れる（同じ人のまま）
  await sakura.page.getByTestId('back-to-event').click();
  await sakura.page.waitForURL(new RegExp(`/room/${eventCode}$`));
  await expect(sakura.page.getByTestId('me-bar')).toContainText('さくら');

  await closeAll([mc, ...players]);
});
