import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getGameMeta } from '../../shared/games';
import { LIMITS, type RoomSummary } from '../../shared/protocol';
import { Button, Card, FullScreenMessage, Logo, Modal, Spinner, TextInput } from '../components/ui';
import { GameShell } from '../games/GameShell';
import { RoomProvider, useRoomContext } from '../games/RoomContext';
import { ClockContext } from '../lib/clock';
import { getLastName } from '../lib/session';
import { useToast } from '../lib/toast';
import { useRoom } from '../lib/useRoom';
import { Lobby } from './Lobby';

export function RoomPage() {
  const { code = '' } = useParams();
  const { state, view, clockOffset, connected, join, leave } = useRoom(code);
  const navigate = useNavigate();

  if (state.kind === 'loading' || (state.kind === 'joined' && !view)) {
    return (
      <FullScreenMessage emoji="📡" title="接続中…">
        <Spinner className="h-8 w-8 text-pop-pink" />
      </FullScreenMessage>
    );
  }
  if (state.kind === 'notFound') {
    return (
      <FullScreenMessage emoji="🔍" title="ルームが見つかりません">
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
  if (state.kind === 'ended') {
    return (
      <FullScreenMessage emoji="👋" title="ルームを退出しました">
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
            <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-sm font-extrabold text-amber-950">
              <Spinner className="h-4 w-4" /> 再接続しています…
            </div>
          )}
          <RoomHeader
            onLeave={async () => {
              await leave();
              navigate('/');
            }}
          />
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
          className="rounded-xl bg-white/8 px-3 py-1.5 font-display text-sm tracking-[0.15em] ring-1 ring-line hover:bg-white/12"
          title="招待URLをコピー"
          data-testid="header-code"
        >
          {room.code}
        </button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
          退出
        </Button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)}>
        <h2 className="font-display text-xl">ルームを退出しますか？</h2>
        <p className="mt-2 text-sm text-muted">
          {room.status === 'playing' ? 'ゲーム中に退出すると、このゲームには戻れません。' : 'あとでもう一度参加することもできます。'}
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
            className="flex items-center gap-4 p-5"
            style={{ background: `linear-gradient(135deg, ${game.theme.from}, ${game.theme.to})` }}
          >
            <span className="text-5xl drop-shadow-lg">{game.emoji}</span>
            <div>
              <p className="text-xs font-extrabold text-white/80">招待されたゲーム</p>
              <h1 className="font-display text-2xl">{game.title}</h1>
              <p className="text-sm font-bold text-white/85">
                ROOM <span className="font-display tracking-widest">{summary.code}</span> ・ {summary.playerCount}/{summary.maxPlayers}人
              </p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            {summary.status === 'playing' && (
              <p className="mb-4 rounded-xl bg-amber-400/15 px-4 py-2 text-sm font-bold text-amber-200">
                いまゲーム中です。参加すると観戦しながら、次のゲームから遊べます。
              </p>
            )}
            {full ? (
              <p className="rounded-xl bg-rose-500/15 px-4 py-3 text-center font-bold text-rose-200">このルームは満員です 🙇</p>
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
                  🎉 参加する
                </Button>
              </>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
