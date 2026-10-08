import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartyServer } from '../server/app';
import { startTestServer } from './helpers';

/** ビルド済みクライアントの配信（PartyBox の SPA とプロンプト・グランプリのページ） */
describe('ページ配信', () => {
  let dir: string;
  let server: PartyServer;
  let base: string;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'partybox-static-'));
    mkdirSync(path.join(dir, 'grand-prix'));
    writeFileSync(path.join(dir, 'index.html'), '<p>partybox</p>');
    writeFileSync(path.join(dir, 'grand-prix', 'index.html'), '<p>grand-prix</p>');
    writeFileSync(path.join(dir, 'grand-prix', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    server = await startTestServer({ staticDir: dir });
    base = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (p: string) => fetch(base + p, { redirect: 'manual' });

  it('トップやルームの URL は PartyBox の SPA を返す', async () => {
    for (const p of ['/', '/room/ABCDEF', '/play/liar', '/join']) {
      const res = await get(p);
      expect(res.status, p).toBe(200);
      expect(await res.text(), p).toBe('<p>partybox</p>');
    }
  });

  it('/grand-prix/ はプロンプト・グランプリのページを返す', async () => {
    const res = await get('/grand-prix/');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<p>grand-prix</p>');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('末尾のスラッシュが無い URL や知らないパスは /grand-prix/ へ寄せる（クエリは残す）', async () => {
    for (const [p, to] of [
      ['/grand-prix', '/grand-prix/'],
      ['/grand-prix?speed=8', '/grand-prix/?speed=8'],
      ['/grand-prix/race', '/grand-prix/'],
    ]) {
      const res = await get(p);
      expect(res.status, p).toBe(301);
      expect(res.headers.get('location'), p).toBe(to);
    }
  });

  it('/grand-prix/ 以下の静的ファイルはそのまま返す', async () => {
    const res = await get('/grand-prix/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('/grand-prixxx のような別のパスは SPA に任せる', async () => {
    const res = await get('/grand-prixxx');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<p>partybox</p>');
  });

  it('API はそのまま動く', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
