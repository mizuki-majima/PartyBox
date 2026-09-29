/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// base: './' にしておくと、GitHub Pages（/リポジトリ名/ 配下）でも
// Vercel（ルート配下）でも同じビルド成果物がそのまま動く。
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
