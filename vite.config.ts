import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const SERVER_PORT = Number(process.env.PORT ?? 3001);

/**
 * ページは2つ。どちらも同じサーバーから配信する。
 *  - index.html            … PartyBox（React の SPA。トップページ・ルーム）
 *  - grand-prix/index.html … プロンプト・グランプリ（1人用の 3D レース。/grand-prix/ で開く）
 */
const PAGES = {
  main: fileURLToPath(new URL('./index.html', import.meta.url)),
  'grand-prix': fileURLToPath(new URL('./grand-prix/index.html', import.meta.url)),
};

/**
 * プロンプト・グランプリのページの本番ビルドにだけ Content-Security-Policy を <meta> で入れる（XSS の被害を抑える保険）。
 * 開発サーバーは HMR 用の WebSocket などを使うので入れない。
 * AI 生成の API を別ドメインに置く場合は connect-src に追加すること（同じサーバーの /api なら 'self' で足りる）。
 */
const GRAND_PRIX_CSP = [
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

function grandPrixCsp(): Plugin {
  return {
    name: 'grand-prix-csp',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (ctx.filename !== PAGES['grand-prix']) return html;
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${GRAND_PRIX_CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), grandPrixCsp()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    // three.js（プロンプト・グランプリだけが使う）は 1 ファイルで 1MB 近くあるため
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: PAGES,
      output: {
        // three.js は大きくて変わりにくいので別ファイルにしてキャッシュを効かせる
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: `http://localhost:${SERVER_PORT}`, ws: true },
      '/api': { target: `http://localhost:${SERVER_PORT}` },
    },
  },
});
