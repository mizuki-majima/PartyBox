import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol';
import { RoomManager, type RoomManagerOptions } from './rooms/RoomManager';

export interface PartyServerOptions extends Partial<RoomManagerOptions> {
  port?: number;
  host?: string;
  /** ビルド済みクライアントの配信ディレクトリ（null で配信しない） */
  staticDir?: string | null;
}

export interface PartyServer {
  port: number;
  http: HttpServer;
  manager: RoomManager;
  close(): Promise<void>;
}

export async function startPartyServer(options: PartyServerOptions = {}): Promise<PartyServer> {
  const app = express();
  app.disable('x-powered-by');
  const http = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    // お絵描き画像の送信に対応するため 1MB まで許可
    maxHttpBufferSize: 1_000_000,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    cors: process.env.NODE_ENV === 'production' ? undefined : { origin: true },
  });

  const manager = new RoomManager(io, {
    timeScale: options.timeScale ?? 1,
    disconnectGraceMs: options.disconnectGraceMs ?? 3 * 60 * 1000,
    hostTransferMs: options.hostTransferMs ?? 30 * 1000,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: manager.rooms.size });
  });

  // お絵描き画像（IDは推測不能なランダム値。ビューで公開されたIDのみ参照できる）
  app.get('/api/rooms/:code/images/:id', (req, res) => {
    const room = manager.rooms.get(req.params.code.toUpperCase());
    const image = room?.getImage(req.params.id);
    if (!image) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', image.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(image.data);
  });

  const staticDir = options.staticDir === undefined ? path.resolve(process.cwd(), 'dist/client') : options.staticDir;
  if (staticDir && existsSync(staticDir)) {
    // プロンプト・グランプリ（1人用の 3D レース）は SPA とは別のページ。/grand-prix/ に寄せて配信する
    const grandPrixHtml = path.join(staticDir, 'grand-prix', 'index.html');
    const hasGrandPrix = existsSync(grandPrixHtml);
    const toGrandPrix = (req: Request, res: Response) => {
      const q = req.url.indexOf('?');
      res.redirect(301, `/grand-prix/${q >= 0 ? req.url.slice(q) : ''}`);
    };
    // index.html を直接開かれても、ヘッダーを付けて返す /grand-prix/ へ寄せる（静的配信より前に置く）
    if (hasGrandPrix) app.get('/grand-prix/index.html', toGrandPrix);
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    if (hasGrandPrix) {
      app.get(/^\/grand-prix(?:\/.*)?$/, (req, res) => {
        if (req.path !== '/grand-prix/') {
          toGrandPrix(req, res);
          return;
        }
        // 独立して公開していたとき（vercel.json）と同じヘッダー
        res.set({
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        });
        res.sendFile(grandPrixHtml);
      });
    }
    // SPA: /room/XXXX などはすべて index.html を返す
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  await new Promise<void>((resolve) => http.listen(options.port ?? 0, options.host, resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    http,
    manager,
    close: async () => {
      manager.dispose();
      await io.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
