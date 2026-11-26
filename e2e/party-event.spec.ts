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

/** 始まった懇親会の参加画面は名簿から選ぶ形なので、「名簿に名前が無い方」から名前を打つ（始まる前は名前の欄だけ） */
async function fillFreeName(p: Page, name: string) {
  const free = p.getByTestId('join-free-open');
  await expect(free.or(p.getByTestId('join-name'))).toBeVisible();
  if (await free.isVisible()) await free.click();
  await p.getByTestId('join-name').fill(name);
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
    await fillFreeName(p, `参加${i + 1}`);
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

  // マスは自分で押して開ける。読まれた番号がカードに出るまで引き、そのマスが知らせているのを押す
  const onCard = await guestA
    .getByTestId('bingo-cell')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-number'))));
  const lastNumber = async () => Number((await host.getByTestId('bingo-last').innerText()).replace(/\D/g, ''));
  for (let count = 1; count < 40 && !onCard.includes(await lastNumber()); count++) {
    await host.getByTestId('bingo-draw').click();
    await expect(host.getByTestId('bingo-count')).toContainText(`${count + 1} 個`);
  }
  const n = await lastNumber();
  const cell = guestA.locator(`[data-testid="bingo-cell"][data-number="${n}"]`);
  await expect(cell).toHaveAttribute('aria-pressed', 'false'); // 読まれただけでは開かない
  await expect(guestA.getByTestId('bingo-hint')).toContainText(String(n));
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(guestA.getByTestId('bingo-hint')).toHaveCount(0);

  /* ---- 座席決め ---- */
  await host.getByTestId('section-seats').click();
  await expect(guestA.getByTestId('seats-roster-pick')).toBeVisible();
  // 参加者が名簿から自分を選ぶ
  await guestA.getByTestId('seats-roster-pick').getByRole('button').first().click();
  await expect(guestA.getByText('くじを引いてください')).toBeVisible();
  // 名簿に無い人は、自分の名前を足してくじに入る
  await guestB.getByTestId('seats-add-open').click();
  await guestB.getByTestId('seats-add-name').fill('とびいり');
  await guestB.getByTestId('seats-add-self').getByRole('button', { name: 'その他' }).click();
  await guestB.getByTestId('seats-add-submit').click();
  await expect(guestB.getByText('くじを引いてください')).toBeVisible();
  // くじに入るのは、名前を選んだ2人だけ（名簿の残りの人は引かれない）
  await expect(host.getByTestId('seats-draw')).toContainText('残り 2');

  // 参加者が自分でくじを引く。結果が出るまで、テーブル名が回る演出が入る
  await guestA.getByTestId('seats-draw-self').click();
  await expect(guestA.getByTestId('seats-reveal-spinning')).toBeVisible();
  await expect(guestA.getByTestId('my-table')).toBeVisible();
  await expect(host.getByTestId('seats-last')).toBeVisible();
  await expect(guestB.getByTestId('seats-tables')).toBeVisible();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');

  // 自分で引かない人（スマホが無い人など）は、司会が引く
  // 「残り全員」は、押し間違えると1人ずつの抽選が一度に終わるので、確かめてから引く
  await host.getByTestId('seats-draw-all').click();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1'); // 確かめるまでは引かない
  await host.getByTestId('seats-draw-all-confirm').click();
  await expect(guestB.getByTestId('my-table')).toBeVisible();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 0');

  /* ---- クイズ ---- */
  await host.getByTestId('section-quiz').click();
  // 名簿で名前を選んだ人は、夕食の席のチームに自動で入っている。自分で名前を足した人は、自分でチームを選ぶ
  await expect(guestA.getByTestId('my-team')).toHaveText('チーム A');
  await expect(guestA.getByTestId('quiz-team-pick')).toHaveCount(0);
  await guestB.getByTestId('quiz-team-pick').getByRole('button').nth(1).click();
  await expect(guestB.getByTestId('my-team')).toHaveText('チーム B');

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
  // 回答タイムの間は、ほかのチームの回答は参加者に出ない（写せないように）
  await expect(guestA.getByTestId('quiz-all-answers')).toHaveCount(0);

  await host.getByTestId('quiz-next').click(); // 答え
  await expect(guestA.getByTestId('quiz-answer')).toHaveText('北海道');
  // 答えの段から、みんなの回答と正誤が見られる
  await expect(guestA.getByTestId('quiz-all-answers')).toContainText('チーム A');
  await expect(guestA.getByTestId('quiz-all-answers')).toContainText('チーム B');
  await expect(guestA.getByTestId('quiz-all-answers')).toContainText('不正解');
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
  await fillFreeName(mc2, '司会2');
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
  await fillFreeName(mc2, '司会2');
  await mc2.getByTestId('join-submit').click();
  await mc2.getByTestId('event-invite-open').click();
  await expect(mc2.getByTestId('host-url')).toHaveText(hostUrl);
  await mc2.getByRole('button', { name: '閉じる' }).click();

  // 途中から来た人には「観戦」ではなく、すぐ参加できると出る
  await guestA.goto(`/room/${code}`);
  await expect(guestA.getByTestId('join-event-note')).toBeVisible();
  await expect(guestA.getByText('観戦しながら')).toHaveCount(0);
  await fillFreeName(guestA, 'たなか');
  await guestA.getByTestId('join-submit').click();

  /* ---- 座席: 別のブラウザで開き直した本人が、自分の名前を取り戻す ---- */
  await host.getByTestId('section-seats').click();
  const firstName = guestA.getByTestId('seats-roster-pick').getByRole('button').first();
  const name = (await firstName.locator('span').first().innerText()).trim();
  await firstName.click();
  await expect(guestA.getByText('くじを引いてください')).toBeVisible();

  await guestA2.goto(`/room/${code}`);
  await fillFreeName(guestA2, 'たなか'); // 前のブラウザはつながったままなので、同じ名前では入れない
  await guestA2.getByTestId('join-submit').click();
  await expect(guestA2.getByText('その名前はすでに使われています')).toBeVisible();
  await guestA.context().close(); // 前のブラウザを閉じた
  // 切断が伝われば、同じ名前で入れる。同じ人として戻るので、選んだ名前はそのまま（選び直しは要らない）
  await expect(async () => {
    if (!(await guestA2.getByText('くじを引いてください').isVisible())) {
      await guestA2.getByTestId('join-submit').click({ timeout: 1000 });
    }
    await expect(guestA2.getByText('くじを引いてください')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(guestA2.getByText(`${name} さん`)).toBeVisible();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');

  // 別の人（名前を変えて入った人）が同じ名前を選ぼうとしたら「選ばれています」と出て、本人だと確かめれば移せる
  const guestB = await newPage(browser, PHONE);
  await guestB.goto(`/room/${code}`);
  await fillFreeName(guestB, 'すずき');
  await guestB.getByTestId('join-submit').click();
  const taken = guestB.getByTestId('seats-roster-pick').getByRole('button', { name: new RegExp(name) });
  await expect(taken).toContainText('選ばれています');
  await taken.click();
  await guestB.getByTestId('seats-takeover').click();
  await expect(guestB.getByText('くじを引いてください')).toBeVisible();
  await expect(guestA2.getByTestId('seats-roster-pick')).toBeVisible(); // 前のスマホは選び直しになる
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');
  await guestB.context().close();

  /* ---- クイズ: 司会にだけ答えが先に出る。チームを選び直せる ---- */
  await host.getByTestId('section-quiz').click();
  // 名簿で名前を選んだときに夕食のチームに入っている。「変える」で選び直せる
  await expect(guestA2.getByTestId('my-team')).toBeVisible();
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

test('懇親会: 2人目の司会がロビーから始められ、二度押しで段が飛ばず、参加者に正誤が出て、別のタブからも続けられる', async ({ browser }) => {
  const host = await newPage(browser, PHONE); // 司会もスマホ
  const mc2 = await newPage(browser, PHONE);
  const right = await newPage(browser, PHONE);
  const wrong = await newPage(browser, PHONE);

  await host.goto('/play/party-event');
  await host.getByPlaceholder('例：みずき').fill('司会');
  await host.getByTestId('create-room').click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = await host.getByTestId('room-code').innerText();
  const hostUrl = await host.getByTestId('host-url').innerText();

  for (const [p, name] of [[right, 'あたり'], [wrong, 'はずれ']] as const) {
    await p.goto(`/room/${code}`);
    await fillFreeName(p, name);
    await p.getByTestId('join-submit').click();
    await expect(p.getByTestId('player-list')).toContainText(name);
  }
  // 参加者のロビーには開始ボタンが出ない
  await expect(right.getByTestId('start-game')).toHaveCount(0);

  // ロビーの「✕」（参加者を外す）は、確かめてから。やめれば外れない
  await host.getByTestId('kick-player').first().click();
  await expect(host.getByTestId('kick-confirm')).toBeVisible();
  await host.getByRole('button', { name: 'やめる' }).click();
  await expect(host.getByTestId('player-count')).toHaveText('3');

  /* ---- 司会用URLを開いた2人目の司会が、ロビーから始める ---- */
  await mc2.goto(new URL(hostUrl).pathname);
  await fillFreeName(mc2, '司会2');
  await mc2.getByTestId('join-submit').click();
  await mc2.getByTestId('start-game').click();
  await expect(host.getByTestId('section-quiz')).toBeVisible();

  /* ---- 説明書き: 参加者には、待っている間の流れと、いつでも開ける「遊び方」が出る ---- */
  await expect(right.getByTestId('event-howto-waiting')).toBeVisible();
  await right.getByTestId('guide-open').click();
  await expect(right.getByTestId('game-guide')).toContainText('そのマスを押して開けます'); // 参加者向けの説明
  await expect(right.getByTestId('game-guide')).not.toContainText('司会用URL'); // 司会向けの説明は出さない
  await right.getByTestId('guide-close').click();
  await host.getByTestId('guide-open').click();
  await expect(host.getByTestId('game-guide')).toContainText('最初からやり直す'); // 司会には司会向けの説明
  await host.getByTestId('guide-close').click();

  /* ---- クイズ: 二度押ししても、問題を読む段が飛ばない ---- */
  await host.getByTestId('section-quiz').click();
  await expect(right.getByTestId('event-howto-quiz')).toContainText('自分のチームを押します'); // いまやることが番号つきで出る
  await right.getByTestId('quiz-team-pick').getByRole('button').first().click();
  await wrong.getByTestId('quiz-team-pick').getByRole('button').nth(1).click();
  await expect(wrong.getByTestId('my-team')).toBeVisible();

  await host.getByTestId('quiz-next').dblclick(); // 「第1問を出す」を二度押し
  await expect(right.getByTestId('question')).toBeVisible();
  await right.waitForTimeout(500);
  await expect(right.getByTestId('quiz-choices')).toHaveCount(0); // 回答タイムは始まっていない
  await expect(host.getByTestId('quiz-next')).toContainText('回答タイム開始');
  await expect(host.getByTestId('quiz-next')).toBeInViewport({ ratio: 1 });
  await host.screenshot({ path: 'e2e/screenshots/party-event-quiz-host-phone.png' });

  // （司会2人が同時に押す場合は、押す間合いを画面からはそろえられないので、tests/party-event.test.ts で確かめている）
  await host.getByTestId('quiz-next').dblclick(); // 「回答タイム開始」を二度押し
  await expect(right.getByTestId('quiz-choices')).toBeVisible();
  await right.waitForTimeout(500);
  await expect(right.getByTestId('quiz-answer')).toHaveCount(0); // 答えの段まで飛んでいない

  /* ---- 参加者に、自分のチームの正誤が出る ---- */
  await right.getByTestId('quiz-choices').getByRole('button').first().click(); // 正解
  await wrong.getByTestId('quiz-choices').getByRole('button').nth(2).click(); // 不正解
  await expect(host.getByTestId('quiz-answered')).toContainText('✓ チーム B');
  await expect(right.getByTestId('quiz-my-result')).toHaveCount(0); // 答えの段までは出ない
  await host.getByTestId('quiz-next').click();
  await expect(right.getByTestId('quiz-my-result')).toContainText('正解');
  await expect(wrong.getByTestId('quiz-my-result')).toContainText('ざんねん');
  await right.screenshot({ path: 'e2e/screenshots/party-event-quiz-correct.png', fullPage: true });

  /* ---- ビンゴ・座席: 二度押ししても1つだけ ---- */
  await host.getByTestId('section-bingo').click();
  await host.getByTestId('bingo-draw').dblclick();
  await expect(host.getByTestId('bingo-count')).toContainText('1 個');
  await host.waitForTimeout(500);
  await expect(host.getByTestId('bingo-count')).toContainText('1 個');
  // 司会がスマホでも、進行のボタンはスクロールしなくても押せる所（画面の下）にある
  await expect(host.getByTestId('bingo-draw')).toBeInViewport({ ratio: 1 });
  await host.screenshot({ path: 'e2e/screenshots/party-event-bingo-host-phone.png' });

  // 「最初からやり直す」は確かめてから。やめれば何も変わらない
  await host.getByTestId('bingo-reset').click();
  await host.getByRole('button', { name: 'やめる' }).click();
  await expect(host.getByTestId('bingo-count')).toContainText('1 個');
  await host.getByTestId('bingo-reset').click();
  await host.waitForTimeout(500);
  await host.screenshot({ path: 'e2e/screenshots/party-event-bingo-reset-confirm.png' });
  await host.getByTestId('bingo-reset-confirm').click();
  await expect(host.getByTestId('bingo-count')).toContainText('0 個');
  await expect(right.getByTestId('bingo-card')).toBeVisible(); // カードはそのまま

  await host.getByTestId('section-seats').click();
  await right.getByTestId('seats-roster-pick').getByRole('button').first().click();
  await wrong.getByTestId('seats-roster-pick').getByRole('button').nth(1).click();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 2');
  await host.getByTestId('seats-draw').dblclick();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');
  await host.waitForTimeout(500);
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');

  /* ---- 同じブラウザの別のタブで開いても、「退出しました」とは出ず、どちらでも続けられる ---- */
  const tab2 = await right.context().newPage();
  await tab2.goto(`/room/${code}`);
  await expect(tab2.getByTestId('seats-tables')).toBeVisible();
  await expect(right.getByTestId('resume-here')).toBeVisible();
  await expect(right.getByText('ルームを退出しました')).toHaveCount(0);
  await right.screenshot({ path: 'e2e/screenshots/party-event-other-tab.png' });
  await right.getByTestId('resume-here').click();
  await expect(right.getByTestId('seats-tables')).toBeVisible(); // 同じ人として続きから
  await expect(tab2.getByTestId('resume-here')).toBeVisible();

  for (const p of [host, mc2, right, wrong]) await p.context().close();
});

test('懇親会: 始まったルームには名簿から名前を選んで入り、表示名を直せる。クイズのチームは選ばなくてよい', async ({ browser }) => {
  const host = await newPage(browser, DESKTOP);
  const guest = await newPage(browser, PHONE);
  const guest2 = await newPage(browser, PHONE);

  await host.goto('/play/party-event');
  await host.getByPlaceholder('例：みずき').fill('司会');
  await host.getByTestId('create-room').click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = await host.getByTestId('room-code').innerText();
  await host.getByTestId('start-game').click();
  await expect(host.getByTestId('section-quiz')).toBeVisible();

  // 名簿から押す → 表示名を直す → 参加
  await guest.goto(`/room/${code}`);
  await expect(guest.getByTestId('join-roster')).toBeVisible();
  await guest.getByTestId('join-roster-person').filter({ hasText: 'さくら' }).click();
  await expect(guest.getByTestId('join-display-name')).toHaveValue('さくら');
  await guest.getByTestId('join-display-name').fill('さくらちゃん');
  await guest.getByTestId('join-submit').click();

  // クイズのチームは、夕食の席のチームに自動で決まっている（選ぶ画面は出ない）
  await host.getByTestId('section-quiz').click();
  await expect(guest.getByTestId('my-team')).toHaveText('チーム A');
  await expect(guest.getByTestId('quiz-team-pick')).toHaveCount(0);

  // 座席決めは、選んだ名簿の名前で待つ（表示名ではない）
  await host.getByTestId('section-seats').click();
  await expect(guest.getByText('さくら さん')).toBeVisible();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');

  // 同じ人を別のスマホで選ぶと「別のスマホで参加中」。本人だと確かめると、こちらに切り替わる
  await guest2.goto(`/room/${code}`);
  await guest2.getByTestId('join-roster-person').filter({ hasText: 'さくら' }).click();
  await guest2.getByTestId('join-submit').click();
  await guest2.getByTestId('join-takeover').click();
  await expect(guest2.getByTestId('me-bar')).toContainText('さくら さん');
  await expect(guest2.getByText('くじを引いてください')).toBeVisible();
  await expect(guest.getByTestId('resume-here')).toBeVisible();
  await expect(host.getByTestId('seats-draw')).toContainText('残り 1');

  for (const p of [host, guest, guest2]) await p.context().close();
});

test('懇親会: 夕食の席が待機画面とモーダルで見られ、自分に印が付く。あなたの帯で表示名を直せ、いまやることが出る', async ({ browser }) => {
  const host = await newPage(browser, DESKTOP);
  const guest = await newPage(browser, PHONE);

  await host.goto('/play/party-event');
  await host.getByPlaceholder('例：みずき').fill('司会');
  await host.getByTestId('create-room').click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = await host.getByTestId('room-code').innerText();
  await host.getByTestId('start-game').click();

  await guest.goto(`/room/${code}`);
  await guest.getByTestId('join-roster-person').filter({ hasText: 'さくら' }).click();
  await guest.getByTestId('join-submit').click();

  // 待機画面: いまやること・あなたの帯・夕食の席（自分に印）
  await expect(guest.getByTestId('now-banner')).toContainText('司会の合図を待ちましょう');
  await expect(guest.getByTestId('me-bar')).toContainText('さくら さん');
  await expect(guest.getByTestId('me-bar')).toContainText('チーム A');
  await expect(guest.getByTestId('dinner-seating')).toBeVisible();
  await expect(guest.getByTestId('dinner-table')).toHaveCount(2);
  await expect(guest.getByTestId('dinner-you')).toHaveText(/さくら/);

  // ほかの企画の間も、帯の「夕食の席」から開ける
  await host.getByTestId('section-bingo').click();
  await expect(guest.getByTestId('dinner-seating')).toHaveCount(0);
  await guest.getByTestId('me-dinner-open').click();
  await expect(guest.getByTestId('dinner-seating')).toBeVisible();
  await guest.getByRole('button', { name: '閉じる' }).click();

  // 表示名を直しても、名簿の名前（夕食の席の印）はそのまま
  await guest.getByTestId('me-rename').click();
  await guest.getByTestId('me-rename-input').fill('さくらちゃん');
  await guest.getByTestId('me-rename-save').click();
  await expect(guest.getByTestId('me-bar')).toContainText('さくらちゃん さん');
  await guest.getByTestId('me-dinner-open').click();
  await expect(guest.getByTestId('dinner-you')).toHaveText(/さくら/);
  await guest.getByRole('button', { name: '閉じる' }).click();

  // 司会の画面からも夕食の席を開ける
  await host.getByTestId('host-dinner-open').click();
  await expect(host.getByTestId('dinner-seating')).toBeVisible();

  for (const p of [host, guest]) await p.context().close();
});
