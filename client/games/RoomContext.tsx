import { createContext, useCallback, useContext, useMemo } from 'react';
import type { GameViewBase, PlayerView, RoomView } from '../../shared/protocol';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';

export interface RoomContextValue {
  room: RoomView;
  me: PlayerView | undefined;
  isHost: boolean;
  /** ゲームアクションを送信。失敗時はトーストを出して false */
  act: (type: string, extra?: Record<string, unknown>) => Promise<boolean>;
  nameOf: (id: string | null | undefined) => string;
  colorOf: (id: string | null | undefined) => string;
}

const Ctx = createContext<RoomContextValue | null>(null);

export function RoomProvider({ room, children }: { room: RoomView; children: React.ReactNode }) {
  const toast = useToast();
  const act = useCallback(
    async (type: string, extra: Record<string, unknown> = {}) => {
      const res = await request('game:action', { type, ...extra });
      if (!res.ok) toast(res.error, 'error');
      return res.ok;
    },
    [toast],
  );
  const value = useMemo<RoomContextValue>(() => {
    const players = new Map(room.players.map((p) => [p.id, p]));
    const gamePlayers = new Map((room.game?.players ?? []).map((p) => [p.id, p]));
    return {
      room,
      me: players.get(room.youId),
      isHost: room.hostId === room.youId,
      act,
      nameOf: (id) => (id ? (players.get(id)?.name ?? gamePlayers.get(id)?.name ?? '???') : '???'),
      colorOf: (id) => (id ? (players.get(id)?.color ?? '#64748b') : '#64748b'),
    };
  }, [room, act]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoomContext(): RoomContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('RoomProvider is missing');
  return v;
}

/** ゲーム画面用: 型付きのゲームビューを取り出す */
export function useGame<T extends GameViewBase>(): RoomContextValue & { game: T } {
  const ctx = useRoomContext();
  return { ...ctx, game: ctx.room.game as T };
}
