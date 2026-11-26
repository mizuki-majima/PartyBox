import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomSummary, RoomView } from '../../shared/protocol';
import { clearSession, loadSession, saveSession } from './session';
import { getSocket, isTimeout, request } from './socket';

export type RoomConnState =
  | { kind: 'loading' }
  | { kind: 'join'; summary: RoomSummary }
  | { kind: 'notFound' }
  | { kind: 'joined' }
  /** resumable: 退出したのではなく、別のタブに切り替わっただけ（読み込み直せば、この画面で続けられる） */
  | { kind: 'ended'; reason: string; resumable?: boolean };

/**
 * ルームへの接続を管理するフック
 *  - localStorage のセッションがあれば自動で再参加（リロード・回線切断からの復帰）
 *  - サーバーから届く room:state を保持し、サーバー時刻とのずれを計算
 */
export function useRoom(rawCode: string, hostToken?: string) {
  const code = rawCode.toUpperCase();
  /** 司会の合言葉を示し、通ったら参加情報にも残す（司会用URLを開き直さなくても司会のままでいられるように） */
  const claim = async (token: string): Promise<void> => {
    const res = await request('room:claimHost', { token });
    const session = loadSession(code);
    if (res.ok && session && session.hostToken !== token) saveSession({ ...session, hostToken: token });
  };
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
      setState({ kind: 'ended', reason, resumable: !forget });
    };

    /**
     * 返事が来なかった（電波が弱い、スマホが眠っていて回線が固まっている）ときは、つなぎ直してやり直す。
     * サーバーに断られたわけではないので、参加情報は消さない
     * （消すと別の人として入り直すことになり、ビンゴのカード・選んだ名前・チームを失う）
     */
    const reconnect = () => {
      if (cancelled || endedRef.current) return;
      s.disconnect();
      s.connect(); // つながると onConnect → establish がもう一度走る
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
          await claimHost();
          return;
        }
        if (isTimeout(res)) {
          reconnect();
          return;
        }
        clearSession(code);
      }
      const check = await request('room:check', { code });
      if (cancelled) return;
      if (isTimeout(check)) {
        // 「ルームが見つかりません」とは出さない（届かなかっただけで、ルームはある）
        reconnect();
        return;
      }
      setState(check.ok ? { kind: 'join', summary: check.room } : { kind: 'notFound' });
    };

    /** 司会用URLで開いていれば、参加できたあとに合言葉を示す */
    const claimHost = async () => {
      if (!hostToken) return;
      await claim(hostToken);
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
    const onReplaced = () => end('別のタブでこのルームを開いたので、この画面は止まっています。続きは、どちらの画面でもできます。', false);
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || endedRef.current) return;
      if (!s.connected) {
        s.connect();
        return;
      }
      // 画面を消している間に回線が固まり、つながっているように見えるだけのことがある（古い画面のまま止まる）。
      // 画面を点けたときに一度たずねて、返事が無ければつなぎ直す
      const res = await request('room:check', { code }, 4000);
      if (isTimeout(res)) reconnect();
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
  }, [code, hostToken]);

  /** opts.personId: 懇親会で名簿から選んだ人（name は表示名）。takeover: 別のスマホで参加中の本人だと確かめた */
  const join = useCallback(
    async (name: string, opts: { personId?: string; takeover?: boolean } = {}): Promise<string | null> => {
      const res = await request('room:join', { code, name, ...opts });
      if (!res.ok) return res.error;
      saveSession(res.session);
      setState({ kind: 'joined' });
      if (hostToken) await claim(hostToken);
      return null;
    },
    [code, hostToken],
  );

  const leave = useCallback(async () => {
    endedRef.current = true;
    await request('room:leave', {});
    clearSession(code);
  }, [code]);

  const joined = state.kind === 'joined' && view !== null && view.code === code;
  return { state, view: joined ? view : null, clockOffset, connected, join, leave };
}
