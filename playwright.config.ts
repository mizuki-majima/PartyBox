import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);

/**
 * 複数ブラウザ（PCのホスト + スマホの参加者）で実際にゲームを通しプレイする E2E テスト。
 * ビルド済みのサーバーを起動し、ゲーム内時間を 0.5 倍に短縮して実行する。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && node dist/server/index.js`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), PARTYBOX_TIME_SCALE: '0.5' },
  },
});
