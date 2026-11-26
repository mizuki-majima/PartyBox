import { useEffect } from 'react';
import { Link } from 'react-router';
import type { GameMeta, SoloGameMeta } from '../../shared/games';
import { useFixedEventRoom } from '../lib/eventInfo';
import { loadThemeFonts, themeOfGame } from '../themes';
import { GameEmblem, Icon } from './Icon';
import { Button } from './ui';

const CARD_CLASS =
  'group animate-slide-up relative flex flex-col border-t-4 border-b border-line bg-panel transition-colors hover:bg-fg hover:text-bg';

type CardContent = Pick<GameMeta, 'title' | 'tagline' | 'description' | 'category' | 'estimatedTime' | 'inDevelopment'> & {
  id: string;
  players: string;
};

/** 作っている途中のゲームの印。遊べるが、見た目や決まりが変わることがあると分かるように */
export function DevBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`ui-badge inline-flex shrink-0 items-center border border-current px-1.5 py-0.5 text-xs font-extrabold ${className}`} data-testid="dev-badge">
      開発中
    </span>
  );
}

/**
 * そのゲームのデザインの見本。入れ子の data-theme で、中だけがそのゲームのトークン（色・フォント・模様）になる。
 * 専用のデザインが無いもの（1人用の別ページなど）は、共通画面の白黒を反転させた面にする
 */
function Swatch({ id, title, className = '' }: { id: string; title: string; className?: string }) {
  const theme = themeOfGame(id);
  const themed = theme !== 'platform';
  // 見本の文字を、そのゲームの文字で出す
  useEffect(() => {
    if (themed) loadThemeFonts(theme);
  }, [themed, theme]);
  return (
    <div
      data-theme={themed ? theme : undefined}
      className={`${themed ? 'theme-swatch' : 'bg-fg text-bg [&_span]:bg-fg'} relative flex items-center gap-3 overflow-hidden border-b border-line px-4 ${className}`}
      aria-hidden
    >
      <GameEmblem id={id} className="h-20 w-24" />
      {/* 地の模様と重なっても読めるように、文字の下に地の色を敷く */}
      <span className="min-w-0 bg-bg px-1 font-display text-lg leading-tight [box-decoration-break:clone]">{title}</span>
    </div>
  );
}

function Facts({ players, time }: { players: string; time: string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
      <span className="inline-flex items-center gap-1.5">
        <Icon name="users" /> {players}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="clock" /> {time}
      </span>
    </div>
  );
}

function CardBody({ game, index }: { game: CardContent; index: number }) {
  return (
    <>
      <Swatch id={game.id} title={game.title} className="h-28" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-2">
            <span className="tracking-[0.2em] uppercase">{game.category}</span>
            {game.inDevelopment && <DevBadge />}
          </span>
          <span className="font-display tabular-nums">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <h3 className="font-display text-2xl leading-tight">{game.title}</h3>
        <p className="text-sm font-bold text-accent-ink group-hover:text-bg">{game.tagline}</p>
        <p className="line-clamp-2 text-sm opacity-80">{game.description}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <Facts players={game.players} time={game.estimatedTime} />
          <span className="inline-flex items-center gap-1 border-b-2 border-current pb-0.5 text-sm font-extrabold">
            遊ぶ <Icon name="play" className="h-3 w-3" />
          </span>
        </div>
      </div>
    </>
  );
}

/** みんなで遊ぶゲーム（ルームを作る画面へ） */
export function GameCard({ game, index = 0 }: { game: GameMeta; index?: number }) {
  return (
    <Link
      to={`/play/${game.id}`}
      className={CARD_CLASS}
      style={{ animationDelay: `${index * 70}ms` }}
      data-testid={`game-card-${game.id}`}
    >
      <CardBody game={{ ...game, players: `${game.minPlayers}〜${game.maxPlayers}人` }} index={index} />
    </Link>
  );
}

/**
 * 司会が進行する催し物（懇親会など）。カード全体ではなく、
 * 「ルームを作る（司会）」と「デモで試す」の2つの入り口を並べる。
 */
export function EventGameCard({ game }: { game: GameMeta }) {
  // 常設のルームがあるときは、ルームを作る入口を出さない（コードを入れて参加するだけ）。
  // デモの入口は出す（名前・所属を仮名にしたデータで動くので、本番の名簿とクイズは見えない）
  const fixed = useFixedEventRoom();
  return (
    <div
      className="animate-slide-up relative border-t-4 border-b border-line bg-panel sm:grid sm:grid-cols-[minmax(0,18rem)_1fr]"
      data-testid={`event-card-${game.id}`}
    >
      <Swatch id={game.id} title={game.tagline} className="h-32 sm:h-auto sm:border-r sm:border-b-0" />
      <div className="flex flex-col gap-2 p-4 sm:p-6">
        <p className="text-xs font-bold tracking-[0.2em] uppercase">{game.category}</p>
        <h3 className="font-display text-3xl leading-tight">{game.title}</h3>
        <p className="text-sm font-bold text-accent-ink">{game.tagline}</p>
        <p className="text-sm opacity-80">{game.description}</p>
        <Facts players={`${game.minPlayers}〜${game.maxPlayers}人`} time={game.estimatedTime} />
        {fixed ? (
          <>
            <div className="mt-3">
              <Link to="/join" data-testid={`event-join-${game.id}`}>
                <Button block size="lg">
                  <Icon name="key" /> コードを入れて参加する
                </Button>
              </Link>
            </div>
            <p className="text-sm text-muted">
              ルームはもう用意してあります。司会から聞いたルームコードを入れると、いつでも入れます（何度入り直しても大丈夫です）。
            </p>
            <Link to={`/demo/${game.id}`} data-testid={`event-demo-${game.id}`}>
              <Button block variant="secondary">
                <Icon name="eye" /> デモで試す
              </Button>
            </Link>
            <p className="text-xs text-muted">
              デモでは、司会と参加者の画面を並べて1人で進行を試せます（PC向け）。名前と会社名は仮名、問題はダミーで、人数やチームの数は本番と同じです。用意してあるルームには影響しません。
            </p>
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link to={`/play/${game.id}`} className="sm:flex-1" data-testid={`event-create-${game.id}`}>
                <Button block>
                  <Icon name="home" /> ルームを作る（司会）
                </Button>
              </Link>
              <Link to={`/demo/${game.id}`} className="sm:flex-1" data-testid={`event-demo-${game.id}`}>
                <Button block variant="secondary">
                  <Icon name="eye" /> デモで試す
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted">
              デモでは、司会と参加者の画面を並べて1人で進行を試せます（PC向け）。使い捨てのルームなので、本番のルームには影響しません。
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** 1人で遊ぶゲーム（SPA の外の別ページなので、通常のリンクで開く） */
export function SoloGameCard({ game, index = 0 }: { game: SoloGameMeta; index?: number }) {
  return (
    <a href={game.href} className={CARD_CLASS} style={{ animationDelay: `${index * 70}ms` }} data-testid={`game-card-${game.id}`}>
      <CardBody game={game} index={index} />
    </a>
  );
}
