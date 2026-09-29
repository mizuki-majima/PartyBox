import { type Browser, type BrowserContext, type Page, expect } from '@playwright/test';

export const SHOT_DIR = 'e2e/screenshots';

const DESKTOP = { viewport: { width: 1280, height: 860 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
}

/** 1人 = 1ブラウザコンテキスト（localStorage も別々） */
export async function newPlayer(browser: Browser, name: string, device: 'desktop' | 'phone'): Promise<Player> {
  const context = await browser.newContext(device === 'desktop' ? DESKTOP : PHONE);
  const page = await context.newPage();
  return { name, context, page };
}

/** ゲームを選んでルームを作成し、ルームコードを返す */
export async function createRoom(p: Player, gameId: string): Promise<string> {
  await p.page.goto(`/play/${gameId}`);
  await p.page.getByPlaceholder('例：みずき').fill(p.name);
  await p.page.getByTestId('create-room').click();
  await p.page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = await p.page.getByTestId('room-code').innerText();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code;
}

/** 招待URLから参加する */
export async function joinRoom(p: Player, code: string): Promise<void> {
  await p.page.goto(`/room/${code}`);
  await p.page.getByTestId('join-name').fill(p.name);
  await p.page.getByTestId('join-submit').click();
  await expect(p.page.getByTestId('player-list')).toContainText(p.name);
}

export async function setupRoom(browser: Browser, gameId: string, names: string[]) {
  const players: Player[] = [];
  for (let i = 0; i < names.length; i++) {
    players.push(await newPlayer(browser, names[i], i === 0 ? 'desktop' : 'phone'));
  }
  const code = await createRoom(players[0], gameId);
  for (const p of players.slice(1)) await joinRoom(p, code);
  for (const p of players) await expect(p.page.getByTestId('player-count')).toHaveText(String(names.length));
  return { players, host: players[0], code };
}

/** 条件を満たすページが現れるまで待って返す（誰の番か分からない場面用） */
export async function findPage(players: Player[], testId: string, timeout = 20_000): Promise<Player> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const p of players) {
      if (await p.page.getByTestId(testId).first().isVisible().catch(() => false)) return p;
    }
    await players[0].page.waitForTimeout(150);
  }
  throw new Error(`No page shows ${testId}`);
}

export async function shot(p: Player, name: string) {
  await p.page.waitForTimeout(350);
  await p.page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

export async function closeAll(players: Player[]) {
  for (const p of players) await p.context.close();
}
