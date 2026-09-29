import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getGameMeta } from '../../shared/games';
import { LIMITS } from '../../shared/protocol';
import { Button, Card, FullScreenMessage, Logo, TextInput } from '../components/ui';
import { getLastName, saveSession } from '../lib/session';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';

export function CreateRoomPage() {
  const { gameId = '' } = useParams();
  const game = getGameMeta(gameId);
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(getLastName);
  const [loading, setLoading] = useState(false);

  if (!game) {
    return (
      <FullScreenMessage emoji="🤔" title="ゲームが見つかりません">
        <Link to="/">
          <Button size="lg">ゲーム一覧へ</Button>
        </Link>
      </FullScreenMessage>
    );
  }

  const create = async () => {
    if (!name.trim()) {
      toast('名前を入力してください', 'error');
      return;
    }
    setLoading(true);
    const res = await request('room:create', { gameId: game.id, name: name.trim() });
    setLoading(false);
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    saveSession(res.session);
    navigate(`/room/${res.session.code}`);
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <Link to="/" className="text-sm font-bold text-muted hover:text-white">
          ← ゲーム一覧
        </Link>
      </header>
      <main className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <section
          className="animate-pop-in relative overflow-hidden rounded-3xl p-6 sm:p-8"
          style={{ background: `linear-gradient(135deg, ${game.theme.from}, ${game.theme.to})` }}
        >
          <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/15" />
          <div className="relative">
            <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-extrabold">{game.category}</span>
            <div className="mt-4 text-7xl drop-shadow-lg">{game.emoji}</div>
            <h1 className="mt-3 font-display text-3xl sm:text-4xl">{game.title}</h1>
            <p className="mt-2 text-white/90">{game.description}</p>
            <div className="mt-4 flex gap-4 font-bold">
              <span>👥 {game.minPlayers}〜{game.maxPlayers}人</span>
              <span>⏱ {game.estimatedTime}</span>
            </div>
            <ol className="mt-6 space-y-2 rounded-2xl bg-black/20 p-4 text-sm backdrop-blur">
              {game.howToPlay.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-extrabold text-pop-yellow">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Card className="animate-slide-up self-start">
          <h2 className="font-display text-2xl">ルームを作る</h2>
          <p className="mt-1 text-sm text-muted">ルームを作ったら、招待URLを友達に送りましょう。</p>
          <label className="mt-6 block text-sm font-extrabold" htmlFor="name">
            あなたの名前
          </label>
          <div className="mt-2">
            <TextInput
              id="name"
              value={name}
              onChange={setName}
              onEnter={create}
              maxLength={LIMITS.nameLength}
              placeholder="例：みずき"
              autoFocus
              enterKeyHint="go"
            />
          </div>
          <Button size="xl" block className="mt-5" onClick={create} loading={loading} data-testid="create-room">
            🏠 ルームを作る
          </Button>
          <div className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
            招待された方は{' '}
            <Link to="/join" className="font-bold text-pop-sky underline underline-offset-4">
              ルームコードで参加
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
