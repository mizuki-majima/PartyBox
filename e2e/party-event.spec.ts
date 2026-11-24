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
  // 名簿に無い人は、自分の名前を足してくじに入る
  await guestB.getByTestId('seats-add-open').click();
  await guestB.getByTestId('seats-add-name').fill('とびいり');
  await guestB.getByTestId('seats-add-self').getByRole('button', { name: 'その他' }).click();
  await guestB.getByTestId('seats-add-submit').click();
  await expect(guestB.getByText('くじを待っています')).toBeVisible();
  // くじに入るのは、名前を選んだ2人だけ（名簿の残りの人は引かれない）
  await expect(host.getByTestId('seats-draw')).toContainText('残り 2');

  await host.getByTestId('seats-draw').click();
  await expect(host.getByTestId('seats-last')).toBeVisible();
  await expect(guestB.getByTestId('seats-tables')).toBeVisible();

  // 残り全員引けば、選んだ人・足した人の席が出る
  await host.getByRole('button', { name: '残り全員' }).click();
  await expect(guestA.getByTestId('my-table')).toBeVisible();
  await expect(guestB.getByTestId('my-table')).toBeVisible();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 0');

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

test('懇親会: トップの欄からデモを開くと、司会と参加者の画面が並んで同時に動く', async ({ browser }) => {
  const page = await newPage(browser, { viewport: { width: 1440, height: 900 } });

  await page.goto('/');
  await expect(page.getByTestId('event-card-party-event')).toBeVisible();
  await page.getByTestId('event-demo-party-event').click();
  await page.waitForURL(/\/demo\/party-event$/);

  const host = page.frameLocator('iframe[title="司会"]');
  const guest = (n: number) => page.frameLocator(`iframe[title="参加者 ${n}"]`);

  // 司会の枠だけに進行の操作が出る。どの枠もデモのルームだと分かる
  await expect(host.getByTestId('section-bingo')).toBeVisible();
  await expect(host.getByTestId('demo-badge')).toBeVisible();
  await expect(guest(1).getByTestId('demo-badge')).toBeVisible();
  await expect(guest(1).getByTestId('section-bingo')).toHaveCount(0);

  // 司会の枠で引いた番号が、参加者の枠すべてに出る
  await host.getByTestId('section-bingo').click();
  await expect(guest(1).getByTestId('bingo-card')).toBeVisible();
  await host.getByTestId('bingo-draw').click();
  await expect(host.getByTestId('bingo-last')).toBeVisible();
  const drawn = await host.getByTestId('bingo-last').innerText();
  for (const n of [1, 2, 3]) await expect(guest(n).getByTestId('bingo-last')).toHaveText(drawn);

  // 枠ごとに別の人として扱われる（同じブラウザでもカードが混ざらない）
  const card1 = await guest(1).getByTestId('bingo-card').innerText();
  const card2 = await guest(2).getByTestId('bingo-card').innerText();
  expect(card1).not.toBe(card2);

  // あとから参加者を増やしても、同じ進行に加わる
  await page.getByTestId('demo-guests-5').click();
  await expect(guest(5).getByTestId('bingo-last')).toHaveText(drawn);

  await page.context().close();
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

test('懇親会: 始めたあとも招待QRを出せ、途中参加・名前の取り戻し・チームの選び直しができる', async ({ browser }) => {
  const host = await newPage(browser, DESKTOP);
  const mc2 = await newPage(browser, PHONE);
  const guestA = await newPage(browser, PHONE);
  const guestA2 = await newPage(browser, PHONE); // 同じ人が別のブラウザで開き直した

  await host.goto('/play/party-event');
  await host.getByPlaceholder('例：みずき').fill('司会');
  await host.getByTestId('create-room').click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = await host.getByTestId('room-code').innerText();
  const hostUrl = await host.getByTestId('host-url').innerText();
  await host.getByTestId('start-game').click();
  await expect(host.getByTestId('section-bingo')).toBeVisible();

  // 進行を全部消してしまう「ロビーに戻る」は出さない
  await expect(host.getByText('ゲームを中断してロビーに戻る')).toHaveCount(0);

  // 始めたあとも、司会の画面から参加用のQR・URLと司会用URLを出せる
  await host.getByTestId('event-invite-open').click();
  await expect(host.getByTestId('event-invite').getByRole('img', { name: '参加用QRコード' })).toBeVisible();
  await expect(host.getByTestId('event-invite-url')).toHaveText(new RegExp(`/room/${code}$`));
  await expect(host.getByTestId('host-url')).toHaveText(hostUrl);
  await host.getByRole('button', { name: '閉じる' }).click();

  // 司会用URLから入った2人目の司会にも、司会用URLが出る
  await mc2.goto(new URL(hostUrl).pathname);
  await mc2.getByTestId('join-name').fill('司会2');
  await mc2.getByTestId('join-submit').click();
  await mc2.getByTestId('event-invite-open').click();
  await expect(mc2.getByTestId('host-url')).toHaveText(hostUrl);
  await mc2.getByRole('button', { name: '閉じる' }).click();

  // 途中から来た人には「観戦」ではなく、すぐ参加できると出る
  await guestA.goto(`/room/${code}`);
  await expect(guestA.getByTestId('join-event-note')).toBeVisible();
  await expect(guestA.getByText('観戦しながら')).toHaveCount(0);
  await guestA.getByTestId('join-name').fill('たなか');
  await guestA.getByTestId('join-submit').click();

  /* ---- 座席: 別のブラウザで開き直した本人が、自分の名前を取り戻す ---- */
  await host.getByTestId('section-seats').click();
  const firstName = guestA.getByTestId('seats-roster-pick').getByRole('button').first();
  const name = (await firstName.locator('span').first().innerText()).trim();
  await firstName.click();
  await expect(guestA.getByText('くじを待っています')).toBeVisible();

  await guestA2.goto(`/room/${code}`);
  await guestA2.getByTestId('join-name').fill('たなか'); // 前のブラウザはつながったままなので、同じ名前では入れない
  await guestA2.getByTestId('join-submit').click();
  await expect(guestA2.getByText('その名前はすでに使われています')).toBeVisible();
  await guestA.context().close(); // 前のブラウザを閉じた
  // 切断が伝われば、同じ名前で入れる
  await expect(async () => {
    if (!(await guestA2.getByTestId('seats-roster-pick').isVisible())) {
      await guestA2.getByTestId('join-submit').click({ timeout: 1000 });
    }
    await expect(guestA2.getByTestId('seats-roster-pick')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  const taken = guestA2.getByTestId('seats-roster-pick').getByRole('button', { name: new RegExp(name) });
  await expect(taken).toContainText('選ばれています');
  await taken.click();
  await guestA2.getByTestId('seats-takeover').click();
  await expect(guestA2.getByText('くじを待っています')).toBeVisible();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');

  /* ---- クイズ: 司会にだけ答えが先に出る。チームを選び直せる ---- */
  await host.getByTestId('section-quiz').click();
  await guestA2.getByTestId('quiz-team-pick').getByRole('button').first().click();
  const firstTeam = await guestA2.getByTestId('my-team').innerText();
  await guestA2.getByTestId('quiz-team-change').click();
  await guestA2.getByTestId('quiz-team-pick').getByRole('button').nth(1).click();
  await expect(guestA2.getByTestId('my-team')).not.toHaveText(firstTeam);

  await host.getByTestId('quiz-next').click(); // 第1問
  await expect(host.getByTestId('quiz-host-answer')).toContainText('1. 北海道');
  await expect(guestA2.getByTestId('question')).toBeVisible();
  await expect(guestA2.getByTestId('quiz-host-answer')).toHaveCount(0);
  await expect(guestA2.locator('body')).not.toContainText('北海道');

  for (const p of [host, mc2, guestA2]) await p.context().close();
});
