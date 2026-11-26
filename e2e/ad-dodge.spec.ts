import { expect, test } from '@playwright/test';
import { closeAll, type Player, setupRoom, shot } from './helpers';

/**
 * 広告をすり抜けろ！
 * どこを押せば進めるかはサーバーだけが知っている。試験のサーバーは PARTYBOX_AD_DODGE_REVEAL=1 で起動しているので、
 * ページの枠（data-debug-*）にその場所が入る。それを画面の座標に直して、指（スマホ）かマウス（PC）で押す
 */
const STAGE = '[data-testid="ad-stage"], [data-testid="ad-landing"]';

async function tap(p: Player, kind: 'pass' | 'trap' = 'pass') {
  const stage = p.page.locator(STAGE).first();
  await expect(stage).toHaveAttribute('data-debug-x', /\d/);
  const info = await stage.evaluate(
    (el, kind) => ({
    key: el.getAttribute('data-key'),
    x: Number(el.getAttribute(kind === 'pass' ? 'data-debug-x' : 'data-debug-trap-x')),
    y: Number(el.getAttribute(kind === 'pass' ? 'data-debug-y' : 'data-debug-trap-y')),
    wait: Number(el.getAttribute('data-debug-at')) - Date.now(),
    }),
    kind,
  );
  // 時間で出てくる・ずれるものは、変わり終わってから押す
  if (info.wait > 0) await p.page.waitForTimeout(info.wait + 80);
  // 連打の上限（1秒に8回）に当たらないように
  await p.page.waitForTimeout(150);
  const box = (await stage.boundingBox())!;
  const sx = box.x + (info.x / 360) * box.width;
  const sy = box.y + (info.y / 560) * box.height;
  // スマホ（タッチの端末）は指で、PC はマウスで押す
  if (await p.page.evaluate(() => navigator.maxTouchPoints > 0)) await p.page.touchscreen.tap(sx, sy);
  else await p.page.mouse.click(sx, sy);
  return info.key;
}

/** ゴールした（またはラウンドが終わった） */
async function done(p: Player) {
  for (const id of ['finished', 'round-result']) if (await p.page.getByTestId(id).isVisible().catch(() => false)) return true;
  return false;
}

/** 押したあと、別の段（または広告のページ・ゴール）に変わるのを待つ */
async function tapAndWait(p: Player, kind: 'pass' | 'trap' = 'pass') {
  const before = await tap(p, kind);
  await expect
    .poll(async () => {
      // 最後の1人がゴールすると、すぐにラウンドの結果に変わる
      if (await done(p)) return 'done';
      const stage = p.page.locator(STAGE).first();
      if ((await stage.count()) === 0) return null;
      return stage.getAttribute('data-key', { timeout: 500 }).catch(() => null);
    })
    .not.toBe(before);
}

async function runToGoal(p: Player) {
  for (let i = 0; i < 40; i++) {
    if (await done(p)) return;
    await tapAndWait(p);
  }
  throw new Error(`${p.name} did not reach the goal`);
}

test('広告をすり抜けろ！: 同じページ → 広告でロック → 戻る → ゴール → 結果 → 勝者の記録', async ({ browser }) => {
  // トップのカードに「開発中」と出る
  const visitor = await browser.newPage();
  await visitor.goto('/');
  await expect(visitor.getByTestId('game-card-ad-dodge').getByTestId('dev-badge')).toBeVisible();
  await visitor.close();

  const { players, host } = await setupRoom(browser, 'ad-dodge', ['みずき', 'たろう']);
  const guest = players[1];
  await host.page.getByRole('button', { name: '1ラウンド' }).click();
  await host.page.getByRole('button', { name: '5ページ' }).click();
  await host.page.getByTestId('start-game').click();
  for (const p of players) await expect(p.page.getByTestId('ad-stage')).toBeVisible({ timeout: 20_000 });
  await expect(host.page.getByTestId('dev-badge')).toBeVisible();

  // スマホ: Safari のツールバーが出ている iPhone 13 くらいの背の低い画面でも、ページの窓が画面の中に収まる
  // （はみ出すと、ページの中では指でスクロールできないので下の方が押せない）。レース中はルームの見出しの帯を隠す
  await guest.page.setViewportSize({ width: 390, height: 664 });
  await expect(guest.page.locator('[data-room-header]')).toBeHidden();
  await expect(host.page.locator('[data-room-header]')).toBeVisible(); // PC はそのまま
  await expect
    .poll(async () => {
      const box = (await guest.page.getByTestId('ad-stage').boundingBox())!;
      return box.y + box.height <= 664 && box.width >= 250;
    })
    .toBe(true);
  await shot(guest, 'ad-dodge-stage-phone');
  await shot(host, 'ad-dodge-stage-desktop');

  // 全員に同じページ
  await expect(host.page.getByTestId('page-no')).toHaveText(/ページ 1 \/ 5/);
  await expect(guest.page.getByTestId('page-no')).toHaveText(/ページ 1 \/ 5/);

  // スマホの人が広告を押す → 広告のページ。3秒（試験では 1.5秒）たつと「← 戻る」で戻れる
  await tapAndWait(guest, 'trap');
  await expect(guest.page.getByTestId('ad-landing')).toBeVisible();
  await shot(guest, 'ad-dodge-landing-phone');
  await tapAndWait(guest);
  await expect(guest.page.getByTestId('ad-stage')).toBeVisible();
  await expect(guest.page.getByTestId('page-no')).toHaveText(/ページ 1 \/ 5/);

  // PC の人が先にゴール → スマホの人がゴール
  await runToGoal(host);
  await expect(host.page.getByTestId('my-time')).toBeVisible();
  await shot(host, 'ad-dodge-finished-desktop');
  await runToGoal(guest);

  for (const p of players) await expect(p.page.getByTestId('round-result')).toBeVisible({ timeout: 20_000 });
  await expect(guest.page.locator('[data-room-header]')).toBeVisible(); // レースが終われば戻る
  await expect(guest.page.getByTestId('result-row').first()).toContainText('みずき');
  await expect(guest.page.getByTestId('result-row').first()).toContainText('+5');
  await expect(guest.page.getByTestId('result-row').nth(1)).toContainText('広告 1回');
  await shot(guest, 'ad-dodge-result-phone');

  await host.page.getByTestId('host-next').click();
  for (const p of players) await expect(p.page.getByTestId('result-recorded')).toBeVisible();
  await shot(guest, 'ad-dodge-gameover-phone');
  await closeAll(players);
});
