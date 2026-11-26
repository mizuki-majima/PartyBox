import type { Server, Socket } from 'socket.io';
import { defaultSettings, getGameMeta, isEventGame, isGameId, sanitizeSettings } from '../../shared/games';
import {
  type Ack,
  type ClientToServerEvents,
  type GameAction,
  LIMITS,
  type ServerToClientEvents,
  type SessionInfo,
} from '../../shared/protocol';
import { getEventConfig } from '../event/config';
import { PartyEventGame } from '../games/party-event/PartyEventGame';
import { getServerGame } from '../games/registry';
import { ResultLog } from '../results';
import { UserError } from '../games/types';
import { generateId, generateRoomCode, generateToken } from '../utils/random';
import { cleanText } from '../utils/text';
import { type PersistedRoom, RoomPersister, loadRooms } from './persist';
import { type Player, Room } from './Room';

export interface RoomManagerOptions {
  /** ゲーム内の時間を何倍にするか（テスト用。通常 1） */
  timeScale: number;
  /** 切断したプレイヤーをルームから外すまでの猶予 */
  disconnectGraceMs: number;
  /** ホストが切断した場合に、ホスト権限を他の人へ移すまでの時間 */
  hostTransferMs: number;
  /** ディスクへの保存・復元を行うか（試験では false） */
  persist?: boolean;
}

interface SocketData {
  roomCode?: string;
  playerId?: string;
  /** 簡易レート制限 */
  bucket?: { windowStart: number; count: number };
  /** 司会用URLの合言葉（催し物のルーム） */
  hostToken?: string;
}

type PartySocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type PartyServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const RATE_WINDOW_MS = 5000;
const RATE_MAX_EVENTS = 60;

/** 誰も接続していないルームを片付けるまでの時間（懇親会の本番のルームは除く） */
const IDLE_CLOSE_MS = 30 * 60 * 1000;
/** 最後の動きからこれだけ経ったルームは片付ける（懇親会の本番のルームは EVENT_KEEP_MS） */
const STALE_CLOSE_MS = 12 * 60 * 60 * 1000;
/** 懇親会の本番のルームを残す期間。前日までに作って QR を配っておけるように長めにとる */
const EVENT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 催し物（懇親会）のルームか。
 * 数十人がスマホで参加し、画面を消している間は回線が切れるのが当たり前なので、
 * 切断した人をルームから外さない（外すと戻ったときに別人扱いになり、ビンゴのカードも変わる）。
 */
function isEventRoom(room: Room): boolean {
  return isEventGame(room.gameId);
}

/** 懇親会のルームで、開始ずみならその進行（名簿を引くため）。それ以外は null */
function eventGameOf(room: Room): PartyEventGame | null {
  return isEventRoom(room) && room.game instanceof PartyEventGame ? room.game : null;
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private sweepTimer: NodeJS.Timeout;
  private readonly persister: RoomPersister;
  /** 勝者の記録（最後まで遊んだ通常のゲームの結果） */
  readonly results: ResultLog;

  constructor(
    private readonly io: PartyServer,
    private readonly opts: RoomManagerOptions,
  ) {
    io.on('connection', (socket) => this.onConnection(socket));
    // 念のための掃除: 誰も接続していない古いルームを削除
    this.sweepTimer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweepTimer.unref();
    this.results = new ResultLog(opts.persist !== false);
    this.persister = new RoomPersister(() => this.collectPersisted());
    if (opts.persist === false) this.persister.stop(); // 試験ではディスクを触らない
    else this.restoreRooms();
    this.ensureFixedRoom();
  }

  /**
   * 常設の懇親会ルームを用意する（設定の room.json があるときだけ）。
   * 保存ファイルから戻っていれば、進み具合はそのまま使う。無ければ、もう始まっている状態で新しく作る
   * （参加者はコードを入れて名前を入れるだけ。誰かが「ゲーム開始」を押すのを待たなくてよい）
   */
  private ensureFixedRoom(): void {
    const fixed = getEventConfig().room;
    if (!fixed) return;
    const def = getServerGame('party-event');
    if (!def) return;
    let room = this.rooms.get(fixed.code);
    if (!room) {
      room = new Room(fixed.code, 'party-event', {
        timeScale: this.opts.timeScale,
        send: (socketId, view) => this.io.to(socketId).emit('room:state', view),
        onChange: () => this.persister.schedule(),
      });
      room.hostToken = fixed.hostToken ?? generateToken(12);
      this.rooms.set(room.code, room);
    } else if (fixed.hostToken && room.hostToken !== fixed.hostToken) {
      // 合言葉を変えたら、前の合言葉で司会になっていた人は司会でなくなる
      room.hostToken = fixed.hostToken;
      room.hostClaims.clear();
      room.hostId = '';
    }
    if (!room.game) {
      room.game = def.create(room.context, [...room.players.keys()], room.settings);
      room.status = 'playing';
      room.game.start();
    }
    room.permanent = true;
    this.persister.schedule();
    console.log('[event] 常設の懇親会ルームを用意しました');
  }

  /** 常設の懇親会ルームがあるか（あるときは、懇親会のルームとデモを新しく作らせない） */
  hasFixedRoom(): boolean {
    return getEventConfig().room !== null;
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
    this.persister.stop();
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }

  /** 終了前に書き出す */
  flushState(): void {
    this.persister.flush();
  }

  /* ---------------- 保存と復元（懇親会のような催し物のルームだけ） ---------------- */

  /**
   * ディスクに保存するルームか。懇親会のような催し物の本番のルームだけ（デモは使い捨てなので保存しない）。
   * まだ始めていない（ロビーの）ルームも保存する。前日に作って QR を配ったあとで
   * サーバーが再起動（反映・障害）しても、配った QR と司会用URLが使えなくならないように
   */
  private isPersisted(room: Room): boolean {
    return isEventRoom(room) && !room.demo;
  }

  private collectPersisted(): PersistedRoom[] {
    const out: PersistedRoom[] = [];
    for (const room of this.rooms.values()) {
      if (!this.isPersisted(room)) continue;
      out.push({
        code: room.code,
        gameId: room.gameId,
        settings: room.settings,
        hostId: room.hostId,
        hostToken: room.hostToken,
        hostClaims: [...room.hostClaims],
        players: [...room.players.values()].map((p) => ({
          id: p.id,
          name: p.name,
          token: p.token,
          color: p.color,
          joinedAt: p.joinedAt,
        })),
        // まだ始めていないルームは game が無い（null で書き、status で見分ける）
        status: room.status,
        game: room.game?.snapshot?.() ?? null,
        savedAt: Date.now(),
        lastActivity: room.lastActivity,
      });
    }
    return out;
  }

  private restoreRooms(): void {
    for (const saved of loadRooms()) {
      try {
        const room = new Room(saved.code, saved.gameId as never, {
          timeScale: this.opts.timeScale,
          send: (socketId, view) => this.io.to(socketId).emit('room:state', view),
          onChange: () => this.persister.schedule(),
        });
        room.settings = saved.settings;
        // 片付けまでの時間は、再起動した時刻ではなく最後に動きがあった時刻から数える
        room.lastActivity = saved.lastActivity ?? saved.savedAt ?? Date.now();
        room.hostId = saved.hostId;
        room.hostToken = saved.hostToken;
        for (const id of saved.hostClaims) room.hostClaims.add(id);
        for (const p of saved.players) {
          room.players.set(p.id, {
            ...p,
            connected: false,
            socketId: null,
            removeTimer: null,
            hostTimer: null,
          });
          room.setName(p.id, p.name);
        }
        // status が無いのは、始めたルームだけを保存していたころのファイル（どれも開始ずみ）
        if (saved.status === 'lobby') {
          // まだ始めていないルーム。ロビーのまま戻す（配った QR・司会用URLがそのまま使える）
          room.status = 'lobby';
        } else {
          const def = getServerGame(saved.gameId as never);
          if (!def) continue;
          const game = def.create(room.context, [...room.players.keys()], room.settings);
          game.restore?.(saved.game);
          room.game = game;
          room.status = 'playing';
          game.start();
        }
        this.rooms.set(room.code, room);
        console.log(`[persist] ルーム ${room.code}（${saved.gameId}）を復元しました（参加者 ${saved.players.length} 名）`);
      } catch (err) {
        console.error(`[persist] ルーム ${saved.code} の復元に失敗しました`, err);
      }
    }
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
      const event = eventGameOf(room);
      // 懇親会は、入る前に名簿から自分を選んでもらう（名前の打ち間違い・同じ人の二重登録を防ぐ）
      return { room: event ? { ...room.summary(), roster: event.joinRoster() } : room.summary() };
    });

    on('room:create', ({ gameId, name, demo }) => {
      if (!isGameId(gameId)) throw new UserError('ゲームが見つかりません');
      // 常設のルームがあるときは、懇親会のルーム・デモを新しく作らせない。
      // 作れると、コードを知らない人でも名簿とクイズ（答え）を見られてしまう
      if (isEventGame(gameId) && this.hasFixedRoom()) {
        throw new UserError('懇親会のルームは用意してあります。トップの「コードで参加」から、ルームコードを入れて参加してください');
      }
      const cleanName = this.validateName(name);
      const code = this.uniqueCode();
      const room = new Room(code, gameId, {
        timeScale: this.opts.timeScale,
        send: (socketId, view) => this.io.to(socketId).emit('room:state', view),
        onChange: () => this.persister.schedule(),
        onGameOver: (r) => this.recordResult(r),
      });
      // デモは催し物を1人で試すためのもの（通常のゲームはそのまま遊べるので作らない）
      room.demo = demo === true && isEventGame(gameId);
      this.rooms.set(code, room);
      const player = this.addPlayer(room, cleanName);
      room.hostId = player.id;
      if (isEventGame(gameId)) {
        // 催し物は司会が複数人・別端末になるので、URL で司会を見分ける
        room.hostToken = generateToken(12);
        room.hostClaims.add(player.id);
        socket.data.hostToken = room.hostToken;
      }
      this.attach(socket, room, player);
      return { session: this.session(room, player) };
    });

    on('room:claimHost', ({ token }) => {
      const { room, player } = this.requireBinding(socket);
      if (!room.hostToken) throw new UserError('このルームに司会用のURLはありません');
      if (typeof token !== 'string' || token !== room.hostToken) throw new UserError('司会用のURLが正しくありません');
      socket.data.hostToken = token;
      room.hostClaims.add(player.id);
      // 作った人が退出して司会の印（👑）が誰にも無ければ、司会用URLを開いた人に付ける
      if (!room.players.has(room.hostId)) room.hostId = player.id;
      room.requestBroadcast();
    });

    on('room:join', ({ code, name, personId, takeover }) => {
      const room = this.getRoom(code);
      const cleanName = this.validateName(name);
      const event = eventGameOf(room);
      if (event && typeof personId === 'string' && personId) {
        return { session: this.joinAsPerson(socket, room, event, cleanName, personId, takeover === true) };
      }
      // 懇親会: 切断している人と同じ名前で入ってきたら、その人として続きから（別のブラウザで開き直した本人）。
      // 新しい人にすると、ビンゴのカードが別物になり、チームと選んだ名前も選び直しになる
      // （接続中の人が同じ名前を使っていれば、下で断る。同じ名前の人が2人つながらないように）
      const inUse = room.isNameTaken(cleanName, undefined, isEventRoom(room));
      const previous = isEventRoom(room) && !inUse ? room.findDisconnectedByName(cleanName) : undefined;
      if (previous) {
        // 前のブラウザに残っている参加情報では戻れないようにする（2つの画面で取り合いにならないように）
        previous.token = generateToken();
        this.attach(socket, room, previous);
        return { session: this.session(room, previous) };
      }
      if (room.players.size >= room.meta.maxPlayers) throw new UserError('このルームは満員です');
      // 懇親会は切断した人も外さないので、接続中の人とだけ比べる（切断中の司会と同じ名前なら、別の人として入る）
      if (inUse) throw new UserError('その名前はすでに使われています');
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
      // 懇親会は始まったあとも表示名を直せる（名簿で選んだ人・座席・チームは変わらない）
      if (room.status !== 'lobby' && !isEventRoom(room)) throw new UserError('ゲーム中は名前を変更できません');
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
      if (room.permanent) throw new UserError('このルームは常設のため、削除できません');
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
      // 催し物は司会用URL・保存・切断の扱いがルームを作るときに決まるので、通常のゲームと行き来させない
      if (isEventGame(gameId) !== isEventGame(room.gameId)) throw new UserError('このルームでは変更できません');
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
      // 懇親会はロビーに戻すと、クイズ・座席・ビンゴの進行が全部消える（各企画に「最初から」がある）
      if (isEventRoom(room)) throw new UserError('懇親会のルームはロビーに戻せません');
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
      room.game.handleAction(player.id, action, room.isHostPlayer(player.id));
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

  /**
   * 最後まで遊んだゲームの結果を、勝者の記録に残す。
   * 途中で打ち切られたゲーム（人数が足りなくなった等）、懇親会、デモは残さない
   */
  private recordResult(room: Room): void {
    const game = room.game;
    if (!game || isEventRoom(room) || room.demo) return;
    const viewer = game.participants[0];
    if (!viewer) return;
    const view = game.getView(viewer);
    if (view.endReason) return;
    // 「全員一致を目指せ！」は全員で1チームなので、個人の順位のかわりにチームの点を残す
    const team = view as unknown as { teamScore?: unknown; maxScore?: unknown };
    const note =
      room.gameId === 'unanimous' && typeof team.teamScore === 'number'
        ? `チーム得点 ${team.teamScore} 点${typeof team.maxScore === 'number' ? `（最大 ${team.maxScore} 点）` : ''}`
        : null;
    this.results.add({
      gameId: room.gameId,
      players: view.players.map((p) => ({ name: p.name, score: view.scores[p.id] ?? 0, left: p.left })),
      note,
    });
  }

  /**
   * 懇親会で、名簿から選んだ人として入る。name は表示名（直してもよい）。
   * その人をもう選んでいるプレイヤーがいれば、そのプレイヤーとして戻す（別のブラウザで開き直した本人。
   * ビンゴのカード・チーム・座席の名前を引き継ぐ）。つながっていれば、本人だと確かめてから（takeover）。
   * 司会のプレイヤーは引き継がない（名前を選ぶだけで司会になれてしまうため）。新しい参加者として入り、名簿の人だけを移す
   */
  private joinAsPerson(socket: PartySocket, room: Room, event: PartyEventGame, name: string, personId: string, takeover: boolean): SessionInfo {
    if (!event.hasPerson(personId)) throw new UserError('その名前は名簿にありません');
    const ownerId = event.playerOfPerson(personId);
    const owner = ownerId ? room.players.get(ownerId) : undefined;
    if (owner?.connected && !takeover) throw new UserError('PERSON_IN_USE');
    const resumable = owner && !room.isHostPlayer(owner.id) ? owner : undefined;
    // 表示名は、ほかの接続中の人と重ねない（戻す本人の今の名前とは比べない）
    if (room.isNameTaken(name, resumable?.id, true)) throw new UserError('その名前はすでに使われています');

    if (resumable) {
      // 前のブラウザに残っている参加情報では戻れないようにする（2つの画面で取り合いにならないように）
      resumable.token = generateToken();
      resumable.name = name;
      room.setName(resumable.id, name);
      this.attach(socket, room, resumable);
      return this.session(room, resumable);
    }
    if (room.players.size >= room.meta.maxPlayers) throw new UserError('このルームは満員です');
    const player = this.addPlayer(room, name);
    this.attach(socket, room, player);
    event.claimPerson(player.id, personId, true);
    room.requestBroadcast();
    return this.session(room, player);
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
    if (isEventRoom(room)) {
      // 催し物は外さない。戻ってきたら同じ人として続きから（ルームは sweep が片付ける）。
      // 司会も参加者に移さない（transferHost が司会用URLのルームでは移さない）
      room.game?.onPlayerConnectionChange(player.id, false);
      room.requestBroadcast();
      return;
    }
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
    room.hostClaims.delete(playerId);
    // 常設のルームは、最後の1人が退出しても残す
    if (room.players.size === 0 && !room.permanent) {
      this.deleteRoom(room);
      return;
    }
    if (room.hostId === playerId) this.transferHost(room, true);
    room.game?.onPlayerLeave(playerId);
    room.requestBroadcast();
  }

  /** 接続中のプレイヤーのうち、最も早く入室した人にホストを移す */
  private transferHost(room: Room, force = false): void {
    if (room.hostToken) {
      // 催し物は司会用URLで司会を決めるので、回線が切れても移さない。
      // 作った人が退出したときも、参加者には移さない（クイズの答えが見えてしまう）。司会用URLを開いた人にだけ移す
      if (!force) return;
      const others = room.orderedPlayers.filter((p) => p.id !== room.hostId && room.hostClaims.has(p.id));
      room.hostId = (others.find((p) => p.connected) ?? others[0])?.id ?? '';
      room.requestBroadcast();
      return;
    }
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
    // 保存しているルームなら、ファイルからも消す（残すと再起動のたびに生き返る）
    const wasPersisted = this.isPersisted(room);
    room.dispose();
    this.rooms.delete(room.code);
    if (wasPersisted) this.persister.schedule();
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      // 懇親会の本番のルームは、誰も開いていなくても残す（前日に作って QR を配れるように。最後の動きから7日で片付ける）
      if (room.permanent) continue; // 常設のルームは片付けない
      const keepWhileIdle = isEventRoom(room) && !room.demo;
      const idle = !keepWhileIdle && room.connectedPlayers.length === 0 && now - room.lastActivity > IDLE_CLOSE_MS;
      const stale = now - room.lastActivity > (keepWhileIdle ? EVENT_KEEP_MS : STALE_CLOSE_MS);
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
    if (!binding.room.isHostPlayer(binding.player.id)) throw new UserError('ホストのみ操作できます');
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
    const base = { code: room.code, playerId: player.id, token: player.token, name: player.name };
    // 合言葉は、すでに司会と分かっている人にだけ返す
    return room.hostToken && room.hostClaims.has(player.id) ? { ...base, hostToken: room.hostToken } : base;
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

