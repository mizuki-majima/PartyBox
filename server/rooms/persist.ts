/**
 * ルームの保存と復元
 *
 * PartyBox は本来すべてメモリに置いていて、サーバーが再起動すると消える。
 * 遊びのルームならそれで構わないが、懇親会は引いたビンゴの番号・決まった席・
 * クイズの進行が消えると取り返しがつかないので、`snapshot()` を実装しているゲーム
 * （いまは懇親会だけ）のルームだけディスクに書いて、起動時に読み戻す。
 *
 * 置き場は PARTYBOX_STATE_DIR（既定 /opt/partybox/state）。
 * Docker で動かすときは、この場所をホスト側と共有しないと消えるので注意。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameSettings } from '../../shared/games';
import { isEventGame, isGameId } from '../../shared/games';

const DEFAULT_DIR = '/opt/partybox/state';
const FILE = 'rooms.json';
/** 書き込みをまとめる間隔。司会の操作1回ごとに書くと多すぎるため */
const FLUSH_MS = 1000;

export interface PersistedPlayer {
  id: string;
  name: string;
  token: string;
  color: string;
  joinedAt: number;
}

export interface PersistedRoom {
  code: string;
  gameId: string;
  settings: GameSettings;
  hostId: string;
  hostToken: string | null;
  hostClaims: string[];
  players: PersistedPlayer[];
  /**
   * 開始前（lobby）か開始後（playing）か。
   * これを書く前のファイルには無く、そのころは開始後のルームだけを保存していたので、無ければ playing として読む
   */
  status?: 'lobby' | 'playing';
  /** ゲームの中身（PartyEventSnapshot など）。開始前は null */
  game: unknown;
  savedAt: number;
  /**
   * 最後に動きがあった時刻。復元したルームもここから数えて片付ける（再起動で寿命が延びないように）。
   * これを書く前のファイルには無いので、無ければ savedAt を使う
   */
  lastActivity?: number;
}

export interface PersistedFile {
  version: 1;
  rooms: PersistedRoom[];
}

function stateDir(): string {
  return process.env.PARTYBOX_STATE_DIR ?? DEFAULT_DIR;
}

/** 保存できる場所か。書けないなら黙って諦める（遊びのルームは元々保存しない） */
function ensureDir(dir: string): boolean {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function loadRooms(): PersistedRoom[] {
  const path = join(stateDir(), FILE);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PersistedFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.rooms)) return [];
    return parsed.rooms.filter((r) => typeof r?.code === 'string' && isGameId(r.gameId) && isEventGame(r.gameId));
  } catch {
    return []; // 初回起動・壊れている場合は何も復元しない
  }
}

/**
 * 書き出し。途中で落ちても壊れたファイルが残らないよう、別名に書いてから差し替える。
 */
function write(rooms: PersistedRoom[]): void {
  const dir = stateDir();
  if (!ensureDir(dir)) return;
  const path = join(dir, FILE);
  const tmp = `${path}.tmp`;
  try {
    const body: PersistedFile = { version: 1, rooms };
    writeFileSync(tmp, JSON.stringify(body), 'utf8');
    renameSync(tmp, path);
  } catch (err) {
    console.error('[persist] ルームの保存に失敗しました', err);
  }
}

/** まとめ書きの管理。collect は「いま保存すべきルーム一覧」を返す */
export class RoomPersister {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly collect: () => PersistedRoom[]) {}

  /** 状態が変わったことを伝える。実際の書き出しは少し後にまとめて行う */
  schedule(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      write(this.collect());
    }, FLUSH_MS);
    this.timer.unref?.();
  }

  /** いますぐ書く（終了時） */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.stopped) return;
    write(this.collect());
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
