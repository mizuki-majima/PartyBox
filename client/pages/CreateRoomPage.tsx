import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getGameMeta, isEventGame } from '../../shared/games';
import { LIMITS } from '../../shared/protocol';
import { GameEmblem, Icon } from '../components/Icon';
import { Button, Card, FullScreenMessage, Logo, TextInput } from '../components/ui';
import { useFixedEventRoom } from '../lib/eventInfo';
import { clearTeamPlay, getTeamPlay } from '../lib/eventReturn';
import { getLastName, saveSession } from '../lib/session';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';
import { themeOfGame } from '../themes';

export function CreateRoomPage() {
  const { gameId = '' } = useParams();
  const game = getGameMeta(gameId);
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(getLastName);
  const [loading, setLoading] = useState(false);
  const fixedEvent = useFixedEventRoom() === true && isEventGame(gameId);
  // 懇親会の「このチームでゲームを遊ぶ」から来たら、ルームにチーム名を付ける（勝者の記録に残る）
  const [team, setTeam] = useState(() => (isEventGame(gameId) ? null : (getTeamPlay()?.team ?? null)));

  if (!game) {
    return (
      <FullScreenMessage icon="search" title="ゲームが見つかりません">
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
    const res = await request('room:create', { gameId: game.id, name: name.trim(), ...(team ? { label: team } : {}) });
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
      <header className="mx-auto mb-5 flex max-w-5xl items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <Logo />
        <Link to="/" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold underline underline-offset-4 hover:text-accent-ink">
          <Icon name="undo" /> ゲーム一覧
        </Link>
      </header>
      <main className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        {/* ゲームの紹介は、そのゲームのデザインで見せる（入れ子の data-theme。中だけがそのゲームのトークンになる） */}
        <section
          data-theme={themeOfGame(game.id)}
          className="theme-swatch animate-pop-in relative overflow-hidden border border-line p-6 sm:p-8"
        >
          <div className="relative">
            <span className="ui-badge inline-block bg-fg px-3 py-1 text-xs font-extrabold text-bg">{game.category}</span>
            <GameEmblem id={game.id} className="mt-4 h-24 w-32" />
            <h1 className="mt-3 font-display text-3xl sm:text-4xl">{game.title}</h1>
            <p className="mt-2">{game.description}</p>
            <div className="mt-4 flex flex-wrap gap-4 font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="users" /> {game.minPlayers}〜{game.maxPlayers}人
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="clock" /> {game.estimatedTime}
              </span>
            </div>
            <ol className="ui-tile mt-6 space-y-2 p-4 text-sm">
              {game.howToPlay.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-extrabold text-hi-ink">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {fixedEvent ? (
          <Card className="animate-slide-up self-start">
            <h2 className="font-display text-2xl" data-testid="fixed-room-note">
              ルームは用意してあります
            </h2>
            <p className="mt-2 text-base">
              新しく作る必要はありません。司会から聞いたルームコードを入れると、いつでも参加できます。
            </p>
            <Link to="/join" className="mt-5 block">
              <Button size="xl" block>
                <Icon name="key" /> コードを入れて参加する
              </Button>
            </Link>
          </Card>
        ) : (
        <Card className="animate-slide-up self-start">
          <h2 className="font-display text-2xl">ルームを作る</h2>
          <p className="mt-1 text-sm text-muted">ルームを作ったら、招待URLを友達に送りましょう。</p>
          {team && (
            <div className="ui-tile mt-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="create-team-label">
              <span className="text-base font-bold">{team} のルームとして作ります</span>
              <button
                className="min-h-11 text-sm font-bold text-muted underline underline-offset-4"
                onClick={() => {
                  clearTeamPlay();
                  setTeam(null);
                }}
              >
                チームを付けない
              </button>
            </div>
          )}
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
            <Icon name="home" /> ルームを作る
          </Button>
          {isEventGame(game.id) && (
            <Link to={`/demo/${game.id}`} className="mt-3 block">
              <Button size="lg" block variant="secondary">
                <Icon name="eye" /> まずはデモで試す
              </Button>
            </Link>
          )}
          <div className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
            招待された方は{' '}
            <Link to="/join" className="font-bold text-accent-ink underline underline-offset-4">
              ルームコードで参加
            </Link>
          </div>
        </Card>
        )}
      </main>
    </div>
  );
}
