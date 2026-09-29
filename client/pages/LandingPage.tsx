import { Link } from 'react-router';
import { GAMES } from '../../shared/games';
import { GameCard } from '../components/GameCard';
import { Button, Logo } from '../components/ui';

const STEPS = [
  { emoji: '🎮', title: 'ゲームを選ぶ', text: '遊びたいゲームをえらんでタップ。' },
  { emoji: '🏠', title: 'ルームを作る', text: '名前を入れるだけ。登録は不要です。' },
  { emoji: '🔗', title: 'URLを友達に送る', text: 'DiscordやLINEに貼るだけ。QRコードでもOK。' },
  { emoji: '🎉', title: 'みんなで遊ぶ', text: 'スマホでもPCでも。全員そろったらスタート！' },
];

const FLOATERS = [
  { emoji: '🕵️', className: 'left-[4%] top-[12%]', r: '-12deg', delay: '0s' },
  { emoji: '🎨', className: 'right-[6%] top-[8%]', r: '10deg', delay: '1.2s' },
  { emoji: '⚖️', className: 'left-[10%] bottom-[8%]', r: '8deg', delay: '2.1s' },
  { emoji: '🎭', className: 'right-[12%] bottom-[14%]', r: '-8deg', delay: '0.6s' },
  { emoji: '🤝', className: 'right-[3%] top-[46%]', r: '4deg', delay: '1.6s' },
];

function scrollToGames() {
  document.getElementById('games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <Link to="/join">
          <Button variant="secondary" size="sm">
            🔑 コードで参加
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
        <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden>
          {FLOATERS.map((f) => (
            <span
              key={f.emoji}
              className={`animate-float absolute text-5xl opacity-80 drop-shadow-xl lg:text-6xl ${f.className}`}
              style={{ ['--r' as string]: f.r, animationDelay: f.delay }}
            >
              {f.emoji}
            </span>
          ))}
        </div>
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="animate-slide-up mb-5 inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-1.5 text-sm font-bold text-white/85 ring-1 ring-line">
            <span className="h-2 w-2 animate-pulse rounded-full bg-pop-mint" />
            登録なし・無料・ブラウザだけ
          </p>
          <h1 className="animate-slide-up font-display text-[1.7rem] leading-tight min-[400px]:text-[1.9rem] sm:text-5xl sm:leading-[1.2] lg:text-6xl">
            みんなで遊べる、
            <br />
            <span className="text-gradient inline-block whitespace-nowrap">かんたんオンラインゲーム。</span>
          </h1>
          <p className="animate-slide-up mt-5 text-lg text-white/80 sm:text-xl" style={{ animationDelay: '80ms' }}>
            URLを送るだけ。友達とすぐに遊べます。
          </p>
          <div
            className="animate-slide-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: '160ms' }}
          >
            <Button size="xl" onClick={scrollToGames} className="w-full sm:w-auto">
              🎮 ゲームを選ぶ
            </Button>
            <Link to="/join" className="w-full sm:w-auto">
              <Button size="xl" variant="secondary" block>
                ルームコードで参加
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted">Discordで通話しながら遊ぶのにぴったり 🎧</p>
        </div>
      </section>

      {/* Game list */}
      <section id="games" className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-20 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs font-extrabold tracking-[0.3em] text-pop-pink">GAME LIST</p>
            <h2 className="font-display text-3xl">ゲームをえらぶ</h2>
          </div>
          <p className="hidden text-sm text-muted sm:block">全{GAMES.length}種類</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/12 p-6 text-center text-muted">
            <span className="text-4xl">🧩</span>
            <p className="font-bold">新しいゲーム、準備中…</p>
          </div>
        </div>
      </section>

      {/* How to */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-extrabold tracking-[0.3em] text-pop-mint">HOW TO PLAY</p>
          <h2 className="font-display text-3xl">遊び方</h2>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl bg-panel/80 p-6 ring-1 ring-line">
              <span className="absolute top-5 right-5 font-display text-4xl text-white/10">{i + 1}</span>
              <div className="mb-3 text-4xl">{s.emoji}</div>
              <p className="text-xs font-extrabold text-pop-pink">STEP {i + 1}</p>
              <h3 className="mt-1 text-lg font-extrabold">{s.title}</h3>
              <p className="mt-1 text-sm text-white/70">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Button size="lg" onClick={scrollToGames}>
            さっそく遊ぶ →
          </Button>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-muted">
        <Logo />
        <p className="mt-2">友達と、すぐに、ブラウザで。</p>
      </footer>
    </div>
  );
}
