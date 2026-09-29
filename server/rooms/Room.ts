import { type GameId, type GameSettings, defaultSettings, getGameMeta } from '../../shared/games';
import type { PlayerView, RoomStatus, RoomSummary, RoomView } from '../../shared/protocol';
import type { GameContext, GameInstance } from '../games/types';
import { generateId, pickMany, shuffle } from '../utils/random';

export const PLAYER_COLORS = [
  '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#a855f7',
];

export interface Player {
  id: string;
  name: string;
  /** 再接続用の秘密トークン（他プレイヤーには送らない） */
  token: string;
  color: string;
  joinedAt: number;
  connected: boolean;
  socketId: string | null;
  removeTimer: NodeJS.Timeout | null;
  hostTimer: NodeJS.Timeout | null;
}

export interface RoomDeps {
  timeScale: number;
  /** ソケットにビューを送る */
  send(socketId: string, view: RoomView): void;
}

interface StoredImage {
  data: Buffer;
  mime: string;
}

const MAX_IMAGES_PER_ROOM = 200;

export class Room {
  readonly players = new Map<string, Player>();
  status: RoomStatus = 'lobby';
  game: GameInstance | null = null;
  settings: GameSettings;
  hostId = '';
  lastActivity = Date.now();

  /** 退出したプレイヤーも含む名前キャッシュ（結果画面で名前を出すため） */
  private readonly names = new Map<string, string>();
  private readonly images = new Map<string, StoredImage>();
  private readonly decks = new Map<string, Set<string>>();
  private broadcastScheduled = false;
  private closed = false;

  constructor(
    readonly code: string,
    public gameId: GameId,
    private readonly deps: RoomDeps,
  ) {
    this.settings = defaultSettings(getGameMeta(gameId)!);
  }

  get meta() {
    return getGameMeta(this.gameId)!;
  }

  get orderedPlayers(): Player[] {
    return [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  get connectedPlayers(): Player[] {
    return this.orderedPlayers.filter((p) => p.connected);
  }

  nextColor(): string {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
  }

  setName(id: string, name: string): void {
    this.names.set(id, name);
  }

  isNameTaken(name: string, exceptId?: string): boolean {
    const n = name.toLowerCase();
    return [...this.players.values()].some((p) => p.id !== exceptId && p.name.toLowerCase() === n);
  }

  /* ---------------- ゲームに渡すコンテキスト ---------------- */

  readonly context: GameContext = {
    update: () => this.requestBroadcast(),
    playerName: (id) => this.names.get(id) ?? '???',
    isConnected: (id) => this.players.get(id)?.connected ?? false,
    scale: (ms) => Math.round(ms * this.deps.timeScale),
    storeImage: (data, mime) => {
      if (this.images.size >= MAX_IMAGES_PER_ROOM) {
        const oldest = this.images.keys().next().value;
        if (oldest) this.images.delete(oldest);
      }
      const id = generateId(16);
      this.images.set(id, { data, mime });
      return `/api/rooms/${this.code}/images/${id}`;
    },
    drawFromDeck: <T>(deckId: string, pool: readonly T[], n: number, keyOf: (item: T) => string = (i) => String(i)) => {
      const used = this.decks.get(deckId) ?? new Set<string>();
      let available = pool.filter((item) => !used.has(keyOf(item)));
      if (available.length < n) {
        used.clear();
        available = [...pool];
      }
      let picked = pickMany(available, n);
      while (picked.length < n && pool.length > 0) picked = picked.concat(shuffle(pool)).slice(0, n);
      for (const item of picked) used.add(keyOf(item));
      this.decks.set(deckId, used);
      return picked;
    },
  };

  getImage(id: string): StoredImage | undefined {
    return this.images.get(id);
  }

  clearImages(): void {
    this.images.clear();
  }

  /* ---------------- 配信 ---------------- */

  /** 同じ tick 内の複数の変更をまとめて1回だけ配信する */
  requestBroadcast(): void {
    if (this.broadcastScheduled || this.closed) return;
    this.broadcastScheduled = true;
    setImmediate(() => {
      this.broadcastScheduled = false;
      this.flush();
    });
  }

  private flush(): void {
    if (this.closed) return;
    for (const p of this.players.values()) {
      if (!p.connected || !p.socketId) continue;
      try {
        this.deps.send(p.socketId, this.buildView(p.id));
      } catch (err) {
        console.error(`[room ${this.code}] failed to build view`, err);
      }
    }
  }

  buildView(forId: string): RoomView {
    const participants = new Set(this.game?.participants ?? []);
    const players: PlayerView[] = this.orderedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      isHost: p.id === this.hostId,
      inGame: this.status === 'playing' && participants.has(p.id),
    }));
    return {
      code: this.code,
      gameId: this.gameId,
      hostId: this.hostId,
      youId: forId,
      status: this.status,
      players,
      settings: this.settings,
      maxPlayers: this.meta.maxPlayers,
      game: this.status === 'playing' && this.game ? this.game.getView(forId) : null,
      serverNow: Date.now(),
    };
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      gameId: this.gameId,
      playerCount: this.players.size,
      maxPlayers: this.meta.maxPlayers,
      status: this.status,
    };
  }

  dispose(): void {
    this.closed = true;
    this.game?.dispose();
    this.game = null;
    for (const p of this.players.values()) {
      if (p.removeTimer) clearTimeout(p.removeTimer);
      if (p.hostTimer) clearTimeout(p.hostTimer);
    }
    this.images.clear();
  }
}
