import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomSummary, RoomView } from '../../shared/protocol';
import { clearSession, loadSession, saveSession } from './session';
import { getSocket, request } from './socket';

export type RoomConnState =
  | { kind: 'loading' }
  | { kind: 'join'; summary: RoomSummary }
  | { kind: 'notFound' }
  | { kind: 'joined' }
  | { kind: 'ended'; reason: string };

/**
 * ルームへの接続を管理するフック
 *  - localStorage のセッションがあれば自動で再参加（リロード・回線切断からの復帰）
 *  - サーバーから届く room:state を保持し、サーバー時刻とのずれを計算
 */
export function useRoom(rawCode: string) {
  const code = rawCode.toUpperCase();
  const [state, setState] = useState<RoomConnState>({ kind: 'loading' });
  const [view, setView] = useState<RoomView | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [connected, setConnected] = useState(() => getSocket().connected);
  const endedRef = useRef(false);

  useEffect(() => {
    const s = getSocket();
    let cancelled = false;
    endedRef.current = false;

    const end = (reason: string, forget = true) => {
      endedRef.current = true;
      if (forget) clearSession(code);
      setState({ kind: 'ended', reason });
    };

    const establish = async () => {
      if (endedRef.current) return;
      const session = loadSession(code);
      if (session) {
        const res = await request('room:rejoin', { code, playerId: session.playerId, token: session.token });
        if (cancelled) return;
        if (res.ok) {
          saveSession(res.session);
          setState({ kind: 'joined' });
          return;
        }
        clearSession(code);
      }
      const check = await request('room:check', { code });
      if (cancelled) return;
      setState(check.ok ? { kind: 'join', summary: check.room } : { kind: 'notFound' });
    };

    const onState = (v: RoomView) => {
      if (v.code !== code) return;
      setView(v);
      setClockOffset(v.serverNow - Date.now());
    };
    const onConnect = () => {
      setConnected(true);
      void establish();
    };
    const onDisconnect = () => setConnected(false);
    const onClosed = ({ reason }: { reason: string }) => end(reason);
    const onKicked = () => end('ホストによってルームから退出させられました');
    const onReplaced = () => end('別のタブ・端末でこのルームに接続したため、この画面は切断されました', false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !s.connected) s.connect();
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('room:state', onState);
    s.on('room:closed', onClosed);
    s.on('room:kicked', onKicked);
    s.on('session:replaced', onReplaced);
    document.addEventListener('visibilitychange', onVisible);
    if (s.connected) void establish();
    else s.connect();

    return () => {
      cancelled = true;
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('room:state', onState);
      s.off('room:closed', onClosed);
      s.off('room:kicked', onKicked);
      s.off('session:replaced', onReplaced);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [code]);

  const join = useCallback(
    async (name: string): Promise<string | null> => {
      const res = await request('room:join', { code, name });
      if (!res.ok) return res.error;
      saveSession(res.session);
      setState({ kind: 'joined' });
      return null;
    },
    [code],
  );

  const leave = useCallback(async () => {
    endedRef.current = true;
    await request('room:leave', {});
    clearSession(code);
  }, [code]);

  const joined = state.kind === 'joined' && view !== null && view.code === code;
  return { state, view: joined ? view : null, clockOffset, connected, join, leave };
}
