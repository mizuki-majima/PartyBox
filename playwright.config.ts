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
    env: {
      PORT: String(PORT),
      PARTYBOX_TIME_SCALE: '0.5',
      // 試験の保存先は使い捨ての場所にする（本番の /opt/partybox/state を触らない）
      PARTYBOX_STATE_DIR: '.e2e-state',
      // 広告をすり抜けろ！: 押せば進める場所を画面に持たせる（本物の判定はサーバーだけが持つので、試験からは分からない）
      PARTYBOX_AD_DODGE_REVEAL: '1',
    },
  },
});
