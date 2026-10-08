import { Link } from 'react-router';
import type { GameMeta, SoloGameMeta } from '../../shared/games';

const CARD_CLASS =
  'group animate-slide-up relative flex flex-col overflow-hidden rounded-3xl bg-panel ring-1 ring-line transition hover:-translate-y-1 hover:ring-white/25 focus-visible:ring-4 focus-visible:ring-pop-violet';

type CardContent = Pick<GameMeta, 'title' | 'tagline' | 'description' | 'emoji' | 'category' | 'estimatedTime' | 'theme'> & {
  players: string;
};

function CardBody({ game }: { game: CardContent }) {
  return (
    <>
      <div
        className="relative flex h-36 items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${game.theme.from}, ${game.theme.to})` }}
      >
        <div className="absolute -top-8 -left-8 h-28 w-28 rounded-full bg-white/15" />
        <div className="absolute -right-6 -bottom-10 h-32 w-32 rounded-full bg-black/10" />
        <span className="relative text-7xl drop-shadow-lg transition duration-300 group-hover:scale-110 group-hover:-rotate-6">
          {game.emoji}
        </span>
        <span className="absolute top-3 left-3 rounded-full bg-black/25 px-3 py-1 text-xs font-extrabold backdrop-blur">
          {game.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xs font-bold text-muted">{game.tagline}</p>
        <h3 className="font-display text-xl leading-snug">{game.title}</h3>
        <p className="line-clamp-2 text-sm text-white/70">{game.description}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex gap-3 text-sm font-bold text-white/80">
            <span>👥 {game.players}</span>
            <span>⏱ {game.estimatedTime}</span>
          </div>
          <span className="rounded-full bg-white px-4 py-1.5 text-sm font-extrabold text-ink transition group-hover:bg-pop-yellow">
            遊ぶ
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
      <CardBody game={{ ...game, players: `${game.minPlayers}〜${game.maxPlayers}人` }} />
    </Link>
  );
}

/** 1人で遊ぶゲーム（SPA の外の別ページなので、通常のリンクで開く） */
export function SoloGameCard({ game, index = 0 }: { game: SoloGameMeta; index?: number }) {
  return (
    <a href={game.href} className={CARD_CLASS} style={{ animationDelay: `${index * 70}ms` }} data-testid={`game-card-${game.id}`}>
      <CardBody game={game} />
    </a>
  );
}
