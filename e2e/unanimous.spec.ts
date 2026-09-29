import { expect, test } from '@playwright/test';
import { closeAll, setupRoom, shot } from './helpers';

test('全員一致を目指せ！: PCホスト + スマホ2台で作成→参加→リロード復帰→3ラウンド→結果→もう一回', async ({ browser }) => {
  const { players, host, code } = await setupRoom(browser, 'unanimous', ['みずき', 'たろう', 'はな']);
  const [, taro, hana] = players;
  await shot(host, 'lobby-host-desktop');
  await shot(taro, 'lobby-guest-phone');

  // 招待URLが表示されている
  await expect(host.page.getByTestId('invite-url')).toContainText(`/room/${code}`);

  // ホストが設定を変更 → 参加者にもリアルタイム反映
  await host.page.getByRole('button', { name: '3ラウンド' }).click();
  await expect(taro.page.getByRole('button', { name: '3ラウンド' })).toHaveClass(/bg-white/);

  // 参加者がリロードしても同じプレイヤーとして復帰（人数は3人のまま）
  await hana.page.reload();
  await expect(hana.page.getByTestId('player-list')).toContainText('はな');
  await expect(host.page.getByTestId('player-count')).toHaveText('3');

  // 一般参加者には開始ボタンがない
  await expect(taro.page.getByTestId('start-game')).toHaveCount(0);
  await expect(taro.page.getByText('の開始を待っています')).toBeVisible();

  await host.page.getByTestId('start-game').click();
  for (const p of players) await expect(p.page.getByText('GAME START')).toBeVisible();
  await shot(taro, 'game-start-phone');

  const answers = [
    ['おにぎり', 'オニギリ', 'サンドイッチ'], // 2人一致 → 1点
    ['ねこ', 'ねこ', 'ねこ'], // 全員一致 → 10点
    ['ラーメン', 'カレー', 'すし'], // 0点
  ];
  const expected = [1, 10, 0];

  for (let round = 0; round < 3; round++) {
    for (const p of players) await expect(p.page.getByTestId('answer-input')).toBeVisible({ timeout: 20_000 });
    const question = await host.page.getByTestId('question').innerText();
    for (const p of players) await expect(p.page.getByTestId('question')).toHaveText(question);

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      await p.page.getByTestId('answer-input').fill(answers[round][i]);
      await p.page.getByTestId('answer-submit').click();
      if (round === 0 && i === 0) {
        // 送信済み表示 & 他の人の画面には回答内容が出ない
        await expect(p.page.getByText('送信しました')).toBeVisible();
        await expect(taro.page.getByTestId('submission-status')).toContainText('1 / 3');
        await expect(taro.page.locator('body')).not.toContainText('おにぎり');
        await shot(taro, 'answer-phone');
      }
      if (round === 1 && i === 0) {
        // ゲーム中のリロードでも復帰して続行できる
        await taro.page.reload();
        await expect(taro.page.getByTestId('answer-input')).toBeVisible();
      }
    }
    for (const p of players) await expect(p.page.getByTestId('round-score')).toHaveText(`+${expected[round]}`);
    if (round === 0) {
      await shot(host, 'reveal-desktop');
      await shot(hana, 'reveal-phone');
    }
    // ホスト以外は次へ進めない
    await expect(taro.page.getByTestId('host-next')).toHaveCount(0);
    await host.page.getByTestId('host-next').click();
  }

  for (const p of players) await expect(p.page.getByTestId('final-team-score')).toHaveText('11');
  await shot(host, 'gameover-desktop');
  await shot(taro, 'gameover-phone');

  // もう一回遊ぶ
  await host.page.getByTestId('restart').click();
  for (const p of players) await expect(p.page.getByText('GAME START')).toBeVisible();

  // 参加者が退出 → ホスト画面から消える（ゲームは続行）
  await hana.page.getByRole('button', { name: '退出', exact: true }).click();
  await hana.page.getByRole('button', { name: '退出する' }).click();
  await hana.page.waitForURL(/\/$/);
  for (const p of [host, taro]) await expect(p.page.getByTestId('answer-input')).toBeVisible({ timeout: 20_000 });
  await host.page.getByTestId('answer-input').fill('いぬ');
  await host.page.getByTestId('answer-submit').click();
  await taro.page.getByTestId('answer-input').fill('いぬ');
  await taro.page.getByTestId('answer-submit').click();
  await expect(host.page.getByTestId('round-score')).toHaveText('+1');

  await closeAll(players);
});
