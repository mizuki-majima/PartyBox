import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getGameMeta, isEventGame } from '../../shared/games';
import { LIMITS, type RoomSummary } from '../../shared/protocol';
import { GameEmblem } from '../components/Icon';
import { Button, Card, FullScreenMessage, Logo, Modal, Spinner, TextInput } from '../components/ui';
import { GameShell } from '../games/GameShell';
import { RoomProvider, useRoomContext } from '../games/RoomContext';
import { ClockContext } from '../lib/clock';
import { getLastName } from '../lib/session';
import { useToast } from '../lib/toast';
import { useRoom } from '../lib/useRoom';
import { themeOfGame } from '../themes';
import { Lobby } from './Lobby';

export function RoomPage() {
  const { code = '', hostToken } = useParams();
  const { state, view, clockOffset, connected, join, leave } = useRoom(code, hostToken);
  const navigate = useNavigate();

  if (state.kind === 'loading' || (state.kind === 'joined' && !view)) {
    return (
      <FullScreenMessage icon="signal" title="接続中…">
        <Spinner className="h-8 w-8 text-accent-ink" />
      </FullScreenMessage>
    );
  }
  if (state.kind === 'notFound') {
    return (
      <FullScreenMessage icon="search" title="ルームが見つかりません">
        <p className="text-muted">コード「{code.toUpperCase()}」のルームは存在しないか、終了しました。</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/join">
            <Button variant="secondary" size="lg">コードを入力し直す</Button>
          </Link>
          <Link to="/">
            <Button size="lg">トップへ</Button>
          </Link>
        </div>
      </FullScreenMessage>
    );
  }
  if (state.kind === 'ended' && state.resumable) {
    // 退出したわけではない。同じブラウザの別のタブで開いたので、こちらが止まっただけ
    return (
      <FullScreenMessage icon="phone" title="別のタブで開いています">
        <p className="text-muted">{state.reason}</p>
        <Button size="lg" onClick={() => window.location.reload()} data-testid="resume-here">
          この画面で続ける
        </Button>
      </FullScreenMessage>
    );
  }
  if (state.kind === 'ended') {
    return (
      <FullScreenMessage icon="wave" title="ルームを退出しました">
        <p className="text-muted">{state.reason}</p>
        <Link to="/">
          <Button size="lg">トップへ戻る</Button>
        </Link>
      </FullScreenMessage>
    );
  }
  if (state.kind === 'join') {
    return <JoinForm summary={state.summary} onJoin={join} />;
  }

  return (
    <ClockContext.Provider value={clockOffset}>
      <RoomProvider room={view!}>
        <div className="min-h-dvh pb-28">
          {!connected && (
            <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warn px-4 py-2 text-sm font-extrabold text-on-warn">
              <Spinner className="h-4 w-4" /> 再接続しています…
            </div>
          )}
          <RoomHeader
            onLeave={async () => {
              await leave();
              navigate('/');
            }}
          />
          {view!.demo && (
            // ヘッダーはスマホ幅で詰まっているので、デモの目印は下の帯に出す
            <div className="mx-auto max-w-5xl px-3 pb-3 sm:px-6">
              <p
                className="ui-tile px-3 py-1.5 text-center text-xs font-extrabold text-ok-ink"
                data-testid="demo-badge"
              >
                デモのルームです（本番のルームとは別です）
              </p>
            </div>
          )}
          <main className="mx-auto max-w-5xl px-3 sm:px-6">{view!.status === 'lobby' ? <Lobby /> : <GameShell />}</main>
        </div>
      </RoomProvider>
    </ClockContext.Provider>
  );
}

function RoomHeader({ onLeave }: { onLeave: () => void }) {
  const { room } = useRoomContext();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/room/${room.code}`);
      toast('招待URLをコピーしました', 'success');
    } catch {
      toast(`ルームコード: ${room.code}`);
    }
  };
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:px-6">
      <Logo />
      <div className="flex items-center gap-2">
        <button
          onClick={copy}
          className="ui-tile min-h-11 px-3 py-1.5 font-display text-sm tracking-[0.15em]"
          title="招待URLをコピー"
          data-testid="header-code"
        >
          {room.code}
        </button>
        <Button variant="ghost" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setConfirm(true)}>
          退出
        </Button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)}>
        <h2 className="font-display text-xl">ルームを退出しますか？</h2>
        <p className="mt-2 text-sm text-muted">
          {isEventGame(room.gameId)
            ? '画面を閉じるだけなら、退出は要りません（あとで開けば続きから戻れます）。退出すると、ビンゴのカードや選んだ名前は引き継がれません。'
            : room.status === 'playing'
              ? 'ゲーム中に退出すると、このゲームには戻れません。'
              : 'あとでもう一度参加することもできます。'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setConfirm(false)}>
            キャンセル
          </Button>
          <Button variant="danger" size="lg" onClick={onLeave}>
            退出する
          </Button>
        </div>
      </Modal>
    </header>
  );
}

function JoinForm({ summary, onJoin }: { summary: RoomSummary; onJoin: (name: string) => Promise<string | null> }) {
  const game = getGameMeta(summary.gameId)!;
  const [name, setName] = useState(getLastName);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const full = summary.playerCount >= summary.maxPlayers;

  const submit = async () => {
    if (!name.trim()) {
      toast('名前を入力してください', 'error');
      return;
    }
    setLoading(true);
    const err = await onJoin(name.trim());
    setLoading(false);
    if (err) toast(err, 'error');
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center px-4 py-4 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-md px-4 pb-16">
        <Card className="animate-pop-in overflow-hidden !p-0">
          <div
            className="theme-swatch flex items-center gap-4 border-b border-line p-5"
            data-theme={themeOfGame(game.id)}
          >
            <GameEmblem id={game.id} className="h-16 w-20" />
            <div>
              <p className="text-xs font-extrabold text-fg/80">招待されたゲーム</p>
              <h1 className="font-display text-2xl">{game.title}</h1>
              <p className="text-sm font-bold text-fg/85">
                ROOM <span className="font-display tracking-widest">{summary.code}</span> ・ {summary.playerCount}/{summary.maxPlayers}人
              </p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            {summary.status === 'playing' &&
              (isEventGame(summary.gameId) ? (
                // 懇親会は途中から来た人もすぐ参加者になる
                <p className="mb-4 rounded-xl bg-ok/10 px-4 py-2 text-sm font-bold text-ok-ink" data-testid="join-event-note">
                  もう始まっています。名前を入れると、すぐに参加できます。
                </p>
              ) : (
                <p className="mb-4 rounded-xl bg-warn/15 px-4 py-2 text-sm font-bold text-warn-ink">
                  いまゲーム中です。参加すると観戦しながら、次のゲームから遊べます。
                </p>
              ))}
            {full ? (
              <p className="rounded-xl bg-danger/15 px-4 py-3 text-center font-bold text-danger-ink">このルームは満員です</p>
            ) : (
              <>
                <label className="block text-sm font-extrabold" htmlFor="join-name">
                  あなたの名前
                </label>
                <div className="mt-2">
                  <TextInput
                    id="join-name"
                    value={name}
                    onChange={setName}
                    onEnter={submit}
                    maxLength={LIMITS.nameLength}
                    placeholder="例：たろう"
                    autoFocus
                    enterKeyHint="go"
                    data-testid="join-name"
                  />
                </div>
                <Button size="xl" block className="mt-5" onClick={submit} loading={loading} data-testid="join-submit">
                  参加する
                </Button>
              </>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
