import { expect, test } from '@playwright/test';
import { closeAll, findPage, type Player, setupRoom, shot } from './helpers';

async function start(host: Player, players: Player[], firstTestId: string) {
  await host.page.getByTestId('start-game').click();
  for (const p of players) await expect(p.page.getByTestId(firstTestId).first()).toBeVisible({ timeout: 20_000 });
}

test('誰の答えでしょう？: 回答 → 推理（自分の回答は選べない） → 答え合わせ', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'whose-answer', ['みずき', 'たろう', 'はな']);
  await host.page.getByRole('button', { name: '2ラウンド' }).click();
  await start(host, players, 'answer-input');
  const texts = ['ナイフ', '布団', 'マヨネーズ'];
  for (let i = 0; i < 3; i++) {
    await players[i].page.getByTestId('answer-input').fill(texts[i]);
    await players[i].page.getByTestId('answer-submit').click();
  }
  for (const p of players) await expect(p.page.getByTestId('guess-card')).toHaveCount(3);
  await shot(players[1], 'whose-guess-phone');
  for (const p of players) {
    // 自分の回答カードには選択肢が出ない
    const mine = p.page.getByTestId('guess-card').filter({ hasText: 'あなたの回答' });
    await expect(mine.getByRole('button')).toHaveCount(0);
    const others = p.page.getByTestId('guess-card').filter({ hasNotText: 'あなたの回答' });
    for (let i = 0; i < 2; i++) {
      await others.nth(i).getByRole('button').nth(i).click();
      await expect(others.nth(i).getByRole('button').nth(i)).toHaveClass(/bg-white/);
    }
    await p.page.getByTestId('lock-guesses').click();
  }
  for (const p of players) await expect(p.page.getByTestId('result-entry')).toHaveCount(3);
  await expect(players[2].page.getByText('さんでした！').first()).toBeVisible();
  await shot(players[2], 'whose-result-phone');
  await closeAll(players);
});

test('嘘つきは誰だ？: 役割確認 → 順番に発言 → 投票 → 正体公開', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'liar', ['みずき', 'たろう', 'はな', 'けん']);
  await host.page.getByRole('button', { name: '2ラウンド' }).click();
  await host.page.getByRole('button', { name: '15秒' }).click();
  await start(host, players, 'ready');
  // 嘘つきカードは1人だけ、それ以外は同じお題
  let liar: Player | null = null;
  const topics = new Set<string>();
  for (const p of players) {
    if (await p.page.getByTestId('liar-card').isVisible()) liar = p;
    else topics.add(await p.page.getByTestId('topic-card').innerText());
  }
  expect(liar).not.toBeNull();
  expect(topics.size).toBe(1);
  await shot(liar!, 'liar-role-liar-phone');
  await shot(players.find((p) => p !== liar)!, 'liar-role-citizen-phone');
  for (const p of players) await p.page.getByTestId('ready').click();

  for (let turn = 0; turn < 4; turn++) {
    const speaker = await findPage(players, 'speak-submit');
    await speaker.page.getByTestId('speak-input').fill(`発言${turn}`);
    if (turn === 0) await shot(speaker, 'liar-talk-phone');
    await speaker.page.getByTestId('speak-submit').click();
    await expect(host.page.getByText(`発言${turn}`)).toBeVisible();
  }
  for (const p of players) await expect(p.page.getByTestId('vote-target').first()).toBeVisible();
  await shot(host, 'liar-vote-desktop');
  for (const p of players) {
    const target = p === liar ? players.find((x) => x !== liar)! : liar!;
    await p.page.getByTestId('vote-target').filter({ hasText: target.name }).click();
  }
  // 見破られた嘘つきはお題を推理（逆転チャンス）
  await expect(liar!.page.getByTestId('topic-choice')).toHaveCount(6);
  await liar!.page.getByTestId('topic-choice').first().click();
  for (const p of players) await expect(p.page.getByTestId('liar-name')).toHaveText(`${liar!.name}さん！`);
  await shot(host, 'liar-result-desktop');
  await closeAll(players);
});

test('回答を育てろ: 絵を描く → 説明 → 絵 → アルバム公開', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'grow-answer', ['みずき', 'たろう', 'はな']);
  await start(host, players, 'drawing-canvas');
  await shot(players[1], 'grow-draw-phone');

  const draw = async (p: Player, seed: number) => {
    const box = (await p.page.getByTestId('drawing-canvas').boundingBox())!;
    await p.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await p.page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await p.page.mouse.move(box.x + box.width * (0.2 + i * 0.05), box.y + box.height * (0.3 + Math.sin(i + seed) * 0.2));
    }
    await p.page.mouse.up();
    await p.page.getByTestId('drawing-submit').click();
  };

  for (let i = 0; i < 3; i++) await draw(players[i], i);
  for (const p of players) await expect(p.page.getByTestId('source-image')).toBeVisible({ timeout: 20_000 });
  await shot(players[2], 'grow-describe-phone');
  for (let i = 0; i < 3; i++) {
    await players[i].page.getByTestId('grow-text').fill(`説明${i}`);
    await players[i].page.getByTestId('grow-text-submit').click();
  }
  for (const p of players) await expect(p.page.getByTestId('source-text')).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) await draw(players[i], i + 3);

  for (const p of players) await expect(p.page.getByTestId('album-entry')).toHaveCount(4, { timeout: 20_000 });
  await host.page.waitForTimeout(3000);
  await shot(host, 'grow-album-desktop');
  await host.page.getByTestId('album-next').click();
  await host.page.getByTestId('album-next').click();
  await host.page.getByTestId('album-finish').click();
  for (const p of players) await expect(p.page.getByText('結果発表！')).toBeVisible();
  await closeAll(players);
});

test('10秒裁判: 事件と役職 → 10秒ずつ発言 → 投票 → 判決', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'ten-sec-trial', ['みずき', 'たろう', 'はな', 'けん']);
  await host.page.getByRole('button', { name: '2件' }).click();
  await start(host, players, 'my-role');
  for (const p of players) await expect(p.page.getByTestId('evidence').first()).toBeVisible();
  await shot(players[1], 'trial-briefing-phone');
  for (const p of players) await p.page.getByTestId('ready').click();

  for (let turn = 0; turn < 4; turn++) {
    const speaker = await findPage(players, 'speak-submit');
    await speaker.page.getByTestId('speak-input').fill(`証言${turn}`);
    if (turn === 0) await shot(speaker, 'trial-testimony-phone');
    await speaker.page.getByTestId('speak-submit').click();
    await expect(host.page.getByText(`証言${turn}`)).toBeVisible();
  }
  let voters = 0;
  for (const p of players) {
    await expect(p.page.getByText('判決を下そう！')).toBeVisible();
    if (await p.page.getByTestId('vote-guilty').isVisible()) {
      await p.page.getByTestId('vote-guilty').click();
      voters++;
    }
  }
  expect(voters).toBe(3); // 被告は投票できない
  for (const p of players) await expect(p.page.getByTestId('verdict')).toHaveText('有罪');
  await host.page.waitForTimeout(800);
  await shot(host, 'trial-verdict-desktop');
  await closeAll(players);
});
