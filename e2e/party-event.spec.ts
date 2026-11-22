import { type Browser, type Page, expect, test } from '@playwright/test';

/**
 * 懇親会（クイズ・座席決め・ビンゴ）の通し。
 * 司会はPC、参加者はスマホという実際の使い方に合わせている。
 * 問題と名簿は同梱のサンプル（server/event/sample）を使う。
 */

const DESKTOP = { viewport: { width: 1280, height: 860 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function newPage(browser: Browser, device: typeof DESKTOP | typeof PHONE): Promise<Page> {
  const context = await browser.newContext(device);
  return context.newPage();
}

test('懇親会: 司会用URL → ビンゴ → 座席決め → クイズ', async ({ browser }) => {
  const host = await newPage(browser, DESKTOP);
  const guestA = await newPage(browser, PHONE);
  const guestB = await newPage(browser, PHONE);

  /* ---- 司会がルームを作る ---- */
  await host.goto('/play/party-event');
  await expect(host.getByRole('heading', { name: '懇親会' })).toBeVisible();
  await host.getByPlaceholder('例：みずき').fill('司会');
  await host.getByTestId('create-room').click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = await host.getByTestId('room-code').innerText();

  // 司会用URLが出る（これを知っている人だけが進行できる）
  const hostUrl = await host.getByTestId('host-url').innerText();
  expect(hostUrl).toContain(`/room/${code}/h/`);

  /* ---- 参加者が入る ---- */
  for (const [i, p] of [guestA, guestB].entries()) {
    await p.goto(`/room/${code}`);
    await p.getByTestId('join-name').fill(`参加${i + 1}`);
    await p.getByTestId('join-submit').click();
    await expect(p.getByTestId('player-list')).toContainText(`参加${i + 1}`);
  }
  await expect(host.getByTestId('player-count')).toHaveText('3');
  await host.getByTestId('start-game').click();

  // 司会には企画の切り替えが出て、参加者には出ない
  await expect(host.getByTestId('section-bingo')).toBeVisible();
  await expect(guestA.getByTestId('section-bingo')).toHaveCount(0);

  /* ---- ビンゴ ---- */
  await host.getByTestId('section-bingo').click();
  await expect(guestA.getByTestId('bingo-card')).toBeVisible();
  await expect(guestB.getByTestId('bingo-card')).toBeVisible();

  await host.getByTestId('bingo-draw').click();
  await expect(host.getByTestId('bingo-last')).toBeVisible();
  const drawn = await host.getByTestId('bingo-last').innerText();
  // 引いた番号が参加者の画面にも同じものが出る
  await expect(guestA.getByTestId('bingo-last')).toHaveText(drawn);

  // 揃っていないのに押しても受け付けない（そもそもボタンが出ない）
  await expect(guestA.getByTestId('bingo-claim')).toHaveCount(0);

  /* ---- 座席決め ---- */
  await host.getByTestId('section-seats').click();
  await expect(guestA.getByTestId('seats-roster-pick')).toBeVisible();
  // 参加者が名簿から自分を選ぶ
  await guestA.getByTestId('seats-roster-pick').getByRole('button').first().click();
  await expect(guestA.getByText('くじを待っています')).toBeVisible();

  await host.getByTestId('seats-draw').click();
  await expect(host.getByTestId('seats-last')).toBeVisible();
  await expect(guestB.getByTestId('seats-tables')).toBeVisible();

  // 残り全員引けば、選んだ人の席が出る
  await host.getByRole('button', { name: '残り全員' }).click();
  await expect(guestA.getByTestId('my-table')).toBeVisible();

  /* ---- クイズ ---- */
  await host.getByTestId('section-quiz').click();
  await expect(guestA.getByTestId('quiz-team-pick')).toBeVisible();
  await guestA.getByTestId('quiz-team-pick').getByRole('button').first().click();
  await guestB.getByTestId('quiz-team-pick').getByRole('button').nth(1).click();
  await expect(guestA.getByTestId('my-team')).toBeVisible();

  await host.getByTestId('quiz-next').click(); // 第1問
  await expect(guestA.getByTestId('question')).toBeVisible();
  // 回答タイムの前は答えられない
  await expect(guestA.getByTestId('quiz-choices')).toHaveCount(0);

  await host.getByTestId('quiz-next').click(); // 回答タイム
  await expect(guestA.getByTestId('quiz-choices')).toBeVisible();
  // 答えがまだ画面のどこにも無いこと（サンプル第1問の解説）
  await expect(guestA.locator('body')).not.toContainText('北海道は全国の約2割');

  await guestA.getByTestId('quiz-choices').getByRole('button').first().click(); // 正解
  await guestB.getByTestId('quiz-choices').getByRole('button').nth(2).click(); // 不正解
  await expect(host.getByTestId('quiz-host-answers')).toBeVisible();

  await host.getByTestId('quiz-next').click(); // 答え
  await expect(guestA.getByTestId('quiz-answer')).toHaveText('北海道');
  await expect(guestA.locator('body')).toContainText('北海道は全国の約2割');
  // 選択問題は自動採点される
  await expect(guestA.getByTestId('quiz-scores')).toContainText('1');

  for (const p of [host, guestA, guestB]) await p.context().close();
});

test('懇親会: 司会用URLを開いた別の端末も進行できる', async ({ browser }) => {
  const host = await newPage(browser, DESKTOP);
  const mc2 = await newPage(browser, PHONE);

  await host.goto('/play/party-event');
  await host.getByPlaceholder('例：みずき').fill('司会1');
  await host.getByTestId('create-room').click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const hostUrl = await host.getByTestId('host-url').innerText();
  await host.getByTestId('start-game').click();

  // 2人目の司会が司会用URLから入る
  await mc2.goto(new URL(hostUrl).pathname);
  await mc2.getByTestId('join-name').fill('司会2');
  await mc2.getByTestId('join-submit').click();

  await expect(mc2.getByTestId('section-bingo')).toBeVisible();
  await mc2.getByTestId('section-bingo').click();
  await mc2.getByTestId('bingo-draw').click();
  await expect(host.getByTestId('bingo-last')).toBeVisible();

  for (const p of [host, mc2]) await p.context().close();
});
