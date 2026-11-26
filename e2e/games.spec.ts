import { expect, test } from '@playwright/test';
import { closeAll, findPage, type Player, readyAll, setupRoom, shot } from './helpers';

async function start(host: Player, players: Player[], firstTestId: string) {
  await host.page.getByTestId('start-game').click();
  // 開始の準備の関門: 全員の「準備OK」→ 3・2・1。遊び方の画面が消えてから最初の画面を待つ
  await readyAll(players);
  for (const p of players) await expect(p.page.getByText('GAME START')).toHaveCount(0, { timeout: 20_000 });
  for (const p of players) await expect(p.page.getByTestId(firstTestId).first()).toBeVisible({ timeout: 20_000 });
}

test('準備の関門: 全員の準備OKでカウントダウン → ホストが止める → もう一度そろって始まる → 2ラウンド目の頭で「ここで終了」→ 最終結果', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'whose-answer', ['みずき', 'たろう', 'はな']);
  await host.page.getByRole('button', { name: '2ラウンド' }).click();
  await host.page.getByTestId('start-game').click();
  // 開始の関門: 遊び方と「準備OK」。ホストだけに「待たずに始める」「ロビーに戻る」。1ラウンド目なので「ここで終了」は無い
  for (const p of players) await expect(p.page.getByTestId('gate-ready')).toBeVisible();
  await expect(host.page.getByTestId('gate-skip')).toBeVisible();
  await expect(host.page.getByTestId('gate-lobby')).toBeVisible();
  await expect(host.page.getByTestId('gate-end')).toHaveCount(0);
  await expect(players[1].page.getByTestId('gate-skip')).toHaveCount(0);
  await shot(players[1], 'gate-start-phone');
  await players[1].page.getByTestId('gate-ready').click();
  await players[2].page.getByTestId('gate-ready').click();
  await expect(host.page.getByTestId('gate-status')).toContainText('2 / 3');
  // 全員そろうと自動でカウントダウン。ホストが止めると、全員の準備OKが取り消される
  await host.page.getByTestId('gate-ready').click();
  await expect(host.page.getByTestId('gate-count')).toBeVisible();
  await expect(players[1].page.getByTestId('gate-stop')).toHaveCount(0);
  await host.page.getByTestId('gate-stop').click();
  await expect(host.page.getByTestId('gate-count')).toHaveCount(0);
  await expect(players[1].page.getByTestId('gate-ready')).toBeEnabled();
  // もう一度そろうと始まる
  await readyAll(players);
  for (const p of players) await expect(p.page.getByTestId('answer-input')).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) {
    await players[i].page.getByTestId('answer-input').fill(`答え${i}`);
    await players[i].page.getByTestId('answer-submit').click();
  }
  for (const p of players) await p.page.getByTestId('lock-guesses').click();
  await expect(host.page.getByTestId('result-entry').first()).toBeVisible();
  await host.page.getByTestId('host-next').click();
  // 2ラウンド目の頭: 全員の準備OKを待つ。ホストは「ここで終了」できる
  for (const p of players) await expect(p.page.getByTestId('gate-ready')).toBeVisible();
  await expect(host.page.getByTestId('gate-end')).toBeVisible();
  await shot(host, 'gate-round-head-desktop');
  await host.page.getByTestId('gate-end').click();
  await host.page.getByTestId('gate-end-confirm').click();
  // それまでの点で最終結果。勝者の記録にも残る
  for (const p of players) await expect(p.page.getByTestId('result-recorded')).toBeVisible({ timeout: 20_000 });
  await closeAll(players);
});

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
      await expect(others.nth(i).getByRole('button').nth(i)).toHaveAttribute('aria-pressed', 'true');
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
  await host.page.getByRole('button', { name: '1周' }).click(); // 1周（今までどおりの流れ）
  await host.page.getByRole('button', { name: '15秒' }).click();
  // 既定はワードウルフ。この試験は嘘つきのカードと逆転の推理を見るので「お題を知らない」に切り替える
  await host.page.getByRole('button', { name: '嘘つきはお題を知らない' }).click();
  await start(host, players, 'gate-ready');
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
  for (const p of players) await p.page.getByTestId('gate-ready').click();

  for (let turn = 0; turn < 4; turn++) {
    const speaker = await findPage(players, 'speak-submit');
    await speaker.page.getByTestId('speak-input').fill(`発言${turn}`);
    if (turn === 0) await shot(speaker, 'liar-talk-phone');
    await speaker.page.getByTestId('speak-submit').click();
    await expect(host.page.getByText(`発言${turn}`)).toBeVisible();
    // 前の話し手の画面から発言の欄が消えてから、次の話し手を探す（古い画面を拾わないように）
    await expect(speaker.page.getByTestId('speak-submit')).toHaveCount(0);
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

test('嘘つきは誰だ？: 1つのお題で何周も話し、いま何周目かと周ごとの発言が見える', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'liar', ['みずき', 'たろう', 'はな', 'けん']);
  // 既定は「1ラウンド・3周・ワードウルフ」
  await expect(host.page.getByRole('button', { name: '3周' })).toHaveAttribute('aria-pressed', 'true');
  await expect(host.page.getByRole('button', { name: /ワードウルフ/ })).toHaveAttribute('aria-pressed', 'true');
  // 試験の機械が遅くても、持ち時間切れで番が飛ばないように長めにする
  await host.page.getByRole('button', { name: '30秒' }).click();
  await start(host, players, 'gate-ready');
  for (const p of players) await p.page.getByTestId('gate-ready').click();

  await expect(host.page.getByTestId('liar-lap')).toContainText('1周目');
  for (let turn = 0; turn < 5; turn++) {
    const speaker = await findPage(players, 'speak-submit');
    await speaker.page.getByTestId('speak-input').fill(`発言${turn}`);
    await speaker.page.getByTestId('speak-submit').click();
    await expect(host.page.getByText(`発言${turn}`)).toBeVisible();
    // 前の話し手の画面から発言の欄が消えてから、次の話し手を探す（古い画面を拾わないように）
    await expect(speaker.page.getByTestId('speak-submit')).toHaveCount(0);
  }
  // 4人が1回ずつ話したら2周目。投票にはまだ進まない
  await expect(host.page.getByTestId('liar-lap')).toContainText('2周目');
  await expect(host.page.getByTestId('vote-target')).toHaveCount(0);
  await expect(host.page.getByTestId('statement-lap')).toHaveText(['1周目', '2周目']);
  await closeAll(players);
});

test('10秒裁判: 事件と役職 → 10秒ずつ発言 → 投票 → 判決', async ({ browser }) => {
  const { players, host } = await setupRoom(browser, 'ten-sec-trial', ['みずき', 'たろう', 'はな', 'けん']);
  await host.page.getByRole('button', { name: '2件' }).click();
  await start(host, players, 'my-role');
  for (const p of players) await expect(p.page.getByTestId('evidence').first()).toBeVisible();
  await shot(players[1], 'trial-briefing-phone');
  for (const p of players) await p.page.getByTestId('gate-ready').click();

  for (let turn = 0; turn < 4; turn++) {
    const speaker = await findPage(players, 'speak-submit');
    await speaker.page.getByTestId('speak-input').fill(`証言${turn}`);
    if (turn === 0) await shot(speaker, 'trial-testimony-phone');
    await speaker.page.getByTestId('speak-submit').click();
    await expect(host.page.getByText(`証言${turn}`)).toBeVisible();
    await expect(speaker.page.getByTestId('speak-submit')).toHaveCount(0); // 古い画面を拾わないように
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
