import type { Server, Socket } from 'socket.io';
import { defaultSettings, getGameMeta, isGameId, sanitizeSettings } from '../../shared/games';
import {
  type Ack,
  type ClientToServerEvents,
  type GameAction,
  LIMITS,
  type ServerToClientEvents,
  type SessionInfo,
} from '../../shared/protocol';
import { getServerGame } from '../games/registry';
import { UserError } from '../games/types';
import { generateId, generateRoomCode, generateToken } from '../utils/random';
import { cleanText } from '../utils/text';
import { type Player, Room } from './Room';

export interface RoomManagerOptions {
  /** ゲーム内の時間を何倍にするか（テスト用。通常 1） */
  timeScale: number;
  /** 切断したプレイヤーをルームから外すまでの猶予 */
  disconnectGraceMs: number;
  /** ホストが切断した場合に、ホスト権限を他の人へ移すまでの時間 */
  hostTransferMs: number;
}

interface SocketData {
  roomCode?: string;
  playerId?: string;
  /** 簡易レート制限 */
  bucket?: { windowStart: number; count: number };
}

type PartySocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type PartyServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const RATE_WINDOW_MS = 5000;
const RATE_MAX_EVENTS = 60;

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly io: PartyServer,
    private readonly opts: RoomManagerOptions,
  ) {
    io.on('connection', (socket) => this.onConnection(socket));
    // 念のための掃除: 誰も接続していない古いルームを削除
    this.sweepTimer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweepTimer.unref();
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }

  /* ================================================================ */
  /* ソケットイベント                                                   */
  /* ================================================================ */

  private onConnection(socket: PartySocket): void {
    const on = <E extends keyof ClientToServerEvents>(
      event: E,
      handler: (payload: Parameters<ClientToServerEvents[E]>[0]) => object | void,
    ) => {
      socket.on(event, ((payload: unknown, ack: unknown) => {
        const reply = (res: Ack) => {
          if (typeof ack === 'function') ack(res);
        };
        try {
          this.rateLimit(socket);
          const result = handler((payload ?? {}) as Parameters<ClientToServerEvents[E]>[0]);
          reply({ ok: true, ...(result ?? {}) });
        } catch (err) {
          if (err instanceof UserError) {
            reply({ ok: false, error: err.message });
          } else {
            console.error(`[socket] ${event} failed`, err);
            reply({ ok: false, error: 'サーバーでエラーが発生しました' });
          }
        }
      }) as never);
    };

    on('room:check', ({ code }) => {
      const room = this.getRoom(code);
      return { room: room.summary() };
    });

    on('room:create', ({ gameId, name }) => {
      if (!isGameId(gameId)) throw new UserError('ゲームが見つかりません');
      const cleanName = this.validateName(name);
      const code = this.uniqueCode();
      const room = new Room(code, gameId, {
        timeScale: this.opts.timeScale,
        send: (socketId, view) => this.io.to(socketId).emit('room:state', view),
      });
      this.rooms.set(code, room);
      const player = this.addPlayer(room, cleanName);
      room.hostId = player.id;
      this.attach(socket, room, player);
      return { session: this.session(room, player) };
    });

    on('room:join', ({ code, name }) => {
      const room = this.getRoom(code);
      const cleanName = this.validateName(name);
      if (room.players.size >= room.meta.maxPlayers) throw new UserError('このルームは満員です');
      if (room.isNameTaken(cleanName)) throw new UserError('その名前はすでに使われています');
      const player = this.addPlayer(room, cleanName);
      this.attach(socket, room, player);
      return { session: this.session(room, player) };
    });

    on('room:rejoin', ({ code, playerId, token }) => {
      const room = this.getRoom(code);
      const player = typeof playerId === 'string' ? room.players.get(playerId) : undefined;
      if (!player || player.token !== token) throw new UserError('ルームに再参加できませんでした。もう一度参加してください');
      this.attach(socket, room, player);
      return { session: this.session(room, player) };
    });

    on('room:leave', () => {
      const { room, player } = this.requireBinding(socket);
      this.detach(socket);
      this.removePlayer(room, player.id);
    });

    on('room:rename', ({ name }) => {
      const { room, player } = this.requireBinding(socket);
      if (room.status !== 'lobby') throw new UserError('ゲーム中は名前を変更できません');
      const cleanName = this.validateName(name);
      if (room.isNameTaken(cleanName, player.id)) throw new UserError('その名前はすでに使われています');
      player.name = cleanName;
      room.setName(player.id, cleanName);
      room.requestBroadcast();
    });

    on('room:kick', ({ playerId }) => {
      const { room } = this.requireHost(socket);
      const target = room.players.get(playerId);
      if (!target) throw new UserError('プレイヤーが見つかりません');
      if (target.id === room.hostId) throw new UserError('自分自身はキックできません');
      if (target.socketId) {
        const targetSocket = this.io.sockets.sockets.get(target.socketId);
        targetSocket?.emit('room:kicked');
        if (targetSocket) this.detach(targetSocket);
      }
      this.removePlayer(room, target.id);
    });

    on('room:close', () => {
      const { room } = this.requireHost(socket);
      this.closeRoom(room, 'ホストがルームを削除しました');
    });

    on('room:settings', ({ settings }) => {
      const { room } = this.requireHost(socket);
      if (room.status !== 'lobby') throw new UserError('ゲーム中は設定を変更できません');
      room.settings = sanitizeSettings(room.meta, settings, room.settings);
      room.requestBroadcast();
    });

    on('room:changeGame', ({ gameId }) => {
      const { room } = this.requireHost(socket);
      if (room.status !== 'lobby') throw new UserError('ゲーム中は変更できません');
      if (!isGameId(gameId)) throw new UserError('ゲームが見つかりません');
      const meta = getGameMeta(gameId)!;
      if (room.players.size > meta.maxPlayers) {
        throw new UserError(`「${meta.title}」は最大${meta.maxPlayers}人までです`);
      }
      room.gameId = gameId;
      room.settings = defaultSettings(meta);
      room.requestBroadcast();
    });

    on('room:start', () => {
      const { room } = this.requireHost(socket);
      if (room.status !== 'lobby') throw new UserError('すでにゲーム中です');
      this.startGame(room);
    });

    on('room:restart', () => {
      const { room } = this.requireHost(socket);
      if (room.status !== 'playing' || !room.game?.isOver()) throw new UserError('ゲーム終了後に操作できます');
      this.startGame(room);
    });

    on('room:backToLobby', () => {
      const { room } = this.requireHost(socket);
      room.game?.dispose();
      room.game = null;
      room.status = 'lobby';
      room.clearImages();
      room.requestBroadcast();
    });

    on('game:action', (action: GameAction) => {
      const { room, player } = this.requireBinding(socket);
      if (!room.game || room.status !== 'playing') throw new UserError('ゲームが始まっていません');
      if (!action || typeof action.type !== 'string') throw new UserError('不正な操作です');
      room.game.handleAction(player.id, action, player.id === room.hostId);
      room.lastActivity = Date.now();
    });

    socket.on('disconnect', () => this.onDisconnect(socket));
  }

  /* ================================================================ */
  /* ルーム操作                                                         */
  /* ================================================================ */

  private startGame(room: Room): void {
    const meta = room.meta;
    const participants = room.connectedPlayers.map((p) => p.id);
    if (participants.length < meta.minPlayers) {
      throw new UserError(`「${meta.title}」は${meta.minPlayers}人以上で遊べます（あと${meta.minPlayers - participants.length}人）`);
    }
    if (participants.length > meta.maxPlayers) throw new UserError(`最大${meta.maxPlayers}人までです`);
    const def = getServerGame(room.gameId);
    if (!def) throw new UserError('このゲームはまだ準備中です');

    room.game?.dispose();
    room.clearImages();
    room.game = def.create(room.context, participants, room.settings);
    room.status = 'playing';
    room.game.start();
    room.requestBroadcast();
  }

  private addPlayer(room: Room, name: string): Player {
    const player: Player = {
      id: generateId(8),
      name,
      token: generateToken(),
      color: room.nextColor(),
      joinedAt: Date.now() + room.players.size / 1000,
      connected: false,
      socketId: null,
      removeTimer: null,
      hostTimer: null,
    };
    room.players.set(player.id, player);
    room.setName(player.id, name);
    return player;
  }

  /** ソケットとプレイヤーを結びつける（再接続・別タブからの接続にも対応） */
  private attach(socket: PartySocket, room: Room, player: Player): void {
    // このソケットが別のルーム/プレイヤーに結びついていたら外す
    if (socket.data.roomCode && (socket.data.roomCode !== room.code || socket.data.playerId !== player.id)) {
      this.detach(socket, true);
    }
    // 同じプレイヤーが別のソケット（別タブ）で接続中なら、古い方を切り離す
    if (player.socketId && player.socketId !== socket.id) {
      const old = this.io.sockets.sockets.get(player.socketId);
      if (old) {
        old.emit('session:replaced');
        old.data.roomCode = undefined;
        old.data.playerId = undefined;
        old.leave(`room:${room.code}`);
      }
    }
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(`room:${room.code}`);
    player.socketId = socket.id;
    const wasConnected = player.connected;
    player.connected = true;
    if (player.removeTimer) clearTimeout(player.removeTimer);
    if (player.hostTimer) clearTimeout(player.hostTimer);
    player.removeTimer = null;
    player.hostTimer = null;
    room.lastActivity = Date.now();
    if (!wasConnected) room.game?.onPlayerConnectionChange(player.id, true);
    room.requestBroadcast();
  }

  /** ソケットからルームの紐付けを外す（プレイヤー自体はルームに残る） */
  private detach(socket: PartySocket, markDisconnected = false): void {
    const { roomCode, playerId } = socket.data;
    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
    if (!roomCode) return;
    socket.leave(`room:${roomCode}`);
    if (markDisconnected && playerId) {
      const room = this.rooms.get(roomCode);
      const player = room?.players.get(playerId);
      if (room && player && player.socketId === socket.id) this.markDisconnected(room, player);
    }
  }

  private onDisconnect(socket: PartySocket): void {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player || player.socketId !== socket.id) return;
    this.markDisconnected(room, player);
  }

  private markDisconnected(room: Room, player: Player): void {
    player.connected = false;
    player.socketId = null;
    player.removeTimer = setTimeout(() => {
      player.removeTimer = null;
      if (!player.connected) this.removePlayer(room, player.id);
    }, this.opts.disconnectGraceMs);
    if (room.hostId === player.id) {
      player.hostTimer = setTimeout(() => {
        player.hostTimer = null;
        if (!player.connected && room.hostId === player.id) this.transferHost(room);
      }, this.opts.hostTransferMs);
    }
    room.game?.onPlayerConnectionChange(player.id, false);
    room.requestBroadcast();
  }

  private removePlayer(room: Room, playerId: string): void {
    const player = room.players.get(playerId);
    if (!player) return;
    if (player.removeTimer) clearTimeout(player.removeTimer);
    if (player.hostTimer) clearTimeout(player.hostTimer);
    room.players.delete(playerId);
    if (room.players.size === 0) {
      this.deleteRoom(room);
      return;
    }
    if (room.hostId === playerId) this.transferHost(room, true);
    room.game?.onPlayerLeave(playerId);
    room.requestBroadcast();
  }

  /** 接続中のプレイヤーのうち、最も早く入室した人にホストを移す */
  private transferHost(room: Room, force = false): void {
    const next = room.connectedPlayers.find((p) => p.id !== room.hostId);
    if (next) room.hostId = next.id;
    else if (force) room.hostId = room.orderedPlayers[0]?.id ?? '';
    room.requestBroadcast();
  }

  private closeRoom(room: Room, reason: string): void {
    this.io.to(`room:${room.code}`).emit('room:closed', { reason });
    for (const p of room.players.values()) {
      const s = p.socketId ? this.io.sockets.sockets.get(p.socketId) : undefined;
      if (s) this.detach(s);
    }
    this.deleteRoom(room);
  }

  private deleteRoom(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const idle = room.connectedPlayers.length === 0 && now - room.lastActivity > 30 * 60 * 1000;
      const stale = now - room.lastActivity > 12 * 60 * 60 * 1000;
      if (idle || stale) this.closeRoom(room, 'ルームの有効期限が切れました');
    }
  }

  /* ================================================================ */
  /* ヘルパー                                                           */
  /* ================================================================ */

  getRoom(code: unknown): Room {
    const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
    const room = this.rooms.get(normalized);
    if (!room) throw new UserError('ルームが見つかりません。コードを確認してください');
    return room;
  }

  private requireBinding(socket: PartySocket): { room: Room; player: Player } {
    const { roomCode, playerId } = socket.data;
    const room = roomCode ? this.rooms.get(roomCode) : undefined;
    const player = playerId ? room?.players.get(playerId) : undefined;
    if (!room || !player) throw new UserError('ルームに参加していません');
    return { room, player };
  }

  private requireHost(socket: PartySocket): { room: Room; player: Player } {
    const binding = this.requireBinding(socket);
    if (binding.room.hostId !== binding.player.id) throw new UserError('ホストのみ操作できます');
    return binding;
  }

  private validateName(name: unknown): string {
    const clean = cleanText(name, LIMITS.nameLength);
    if (!clean) throw new UserError('名前を入力してください');
    return clean;
  }

  private uniqueCode(): string {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Failed to allocate room code');
  }

  private session(room: Room, player: Player): SessionInfo {
    return { code: room.code, playerId: player.id, token: player.token, name: player.name };
  }

  private rateLimit(socket: PartySocket): void {
    const now = Date.now();
    const bucket = socket.data.bucket ?? { windowStart: now, count: 0 };
    if (now - bucket.windowStart > RATE_WINDOW_MS) {
      bucket.windowStart = now;
      bucket.count = 0;
    }
    bucket.count++;
    socket.data.bucket = bucket;
    if (bucket.count > RATE_MAX_EVENTS) throw new UserError('操作が多すぎます。少し待ってから試してください');
  }
}

