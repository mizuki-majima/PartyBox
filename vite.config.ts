/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

/**
 * 本番ビルドにだけ Content-Security-Policy を <meta> で入れる（XSS の被害を抑える保険）。
 * GitHub Pages はレスポンスヘッダーを設定できないので meta で指定する。
 * 開発サーバーは HMR 用の WebSocket などを使うので入れない。
 * 将来 AI 生成の API を別ドメインに置く場合は connect-src に追加すること。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// base: './' にしておくと、GitHub Pages（/リポジトリ名/ 配下）でも
// Vercel（ルート配下）でも同じビルド成果物がそのまま動く。
export default defineConfig({
  base: './',
  plugins: [cspPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // three.js は大きくて変わりにくいので別ファイルにしてキャッシュを効かせる
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
