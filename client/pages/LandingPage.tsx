import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EVENT_GAMES, GAMES, SOLO_GAMES } from '../../shared/games';
import { EventGameCard, GameCard, SoloGameCard } from '../components/GameCard';
import { GameEmblem, Icon, type IconName } from '../components/Icon';
import { Button, Logo } from '../components/ui';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'puzzle', title: 'ゲームを選ぶ', text: '遊びたいゲームをえらんでタップ。' },
  { icon: 'home', title: 'ルームを作る', text: '名前を入れるだけ。登録は不要です。' },
  { icon: 'link', title: 'URLを友達に送る', text: 'DiscordやLINEに貼るだけ。QRコードでもOK。' },
  { icon: 'users', title: 'みんなで遊ぶ', text: 'スマホでもPCでも。全員そろったらスタート！' },
];

function scrollToGames() {
  document.getElementById('games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 太い罫線のあとに、左に小さなラベル・右に中身を置く（スイススタイルの段組み） */
function Section({
  id,
  label,
  title,
  note,
  children,
}: {
  id?: string;
  label: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-16 sm:px-6">
      <div className="swiss-rule grid gap-x-8 gap-y-4 pt-4 lg:grid-cols-[16rem_1fr]">
        <div>
          <p className="text-xs font-bold tracking-[0.3em] text-accent-ink uppercase">{label}</p>
          <h2 className="mt-1 font-display text-3xl leading-tight">{title}</h2>
          {note && <p className="mt-2 text-sm text-muted">{note}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to="/results"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-bold underline underline-offset-4 hover:text-accent-ink"
            data-testid="results-link"
          >
            <Icon name="trophy" /> 勝者の記録
          </Link>
          <Link to="/join">
            <Button variant="secondary" size="sm">
              <Icon name="key" /> コードで参加
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero: 左揃えの大きな見出しだけで見せる */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-14 sm:px-6 sm:pt-16 sm:pb-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_15rem]">
          <div>
            <p className="animate-slide-up mb-5 inline-flex items-center gap-2 text-sm font-bold">
              <span className="h-3 w-3 bg-accent" />
              登録なし・無料・ブラウザだけ
            </p>
            <h1 className="animate-slide-up font-display text-[2.2rem] leading-[1.08] min-[400px]:text-[2.5rem] sm:text-6xl lg:text-7xl">
              みんなで遊べる、
              <br />
              <span className="text-gradient">かんたん</span>
              <br />
              オンラインゲーム。
            </h1>
            <p className="animate-slide-up mt-6 max-w-xl text-lg sm:text-xl" style={{ animationDelay: '80ms' }}>
              URLを送るだけ。友達とすぐに遊べます。
            </p>
            <div
              className="animate-slide-up mt-8 flex flex-col gap-3 sm:flex-row"
              style={{ animationDelay: '160ms' }}
            >
              <Button size="xl" onClick={scrollToGames} className="w-full sm:w-auto">
                ゲームを選ぶ <Icon name="play" className="h-4 w-4" />
              </Button>
              <Link to="/join" className="w-full sm:w-auto">
                <Button size="xl" variant="secondary" block>
                  ルームコードで参加
                </Button>
              </Link>
            </div>
          </div>
          {/* 右の柱: 数字と短い事実だけ */}
          <dl className="grid grid-cols-3 gap-4 self-end border-t-4 border-line pt-3 text-sm lg:grid-cols-1">
            <div>
              <dt className="text-xs font-bold tracking-[0.2em] text-muted">GAMES</dt>
              <dd className="font-display text-4xl tabular-nums">{String(GAMES.length + SOLO_GAMES.length + EVENT_GAMES.length).padStart(2, '0')}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold tracking-[0.2em] text-muted">PLAYERS</dt>
              <dd className="font-display text-4xl tabular-nums">1–120</dd>
            </div>
            <div>
              <dt className="text-xs font-bold tracking-[0.2em] text-muted">SIGN UP</dt>
              <dd className="font-display text-4xl">0</dd>
            </div>
          </dl>
        </div>
        <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted">
          <Icon name="headphones" /> Discordで通話しながら遊ぶのにぴったり
        </p>
      </section>

      {/* Event（司会が進行する催し物） */}
      <Section
        id="event"
        label="Event"
        title="懇親会・催し物"
        note="司会が進行して、数十人がそれぞれのスマホで参加する催し物向けです。"
      >
        <div className="grid gap-5">
          {EVENT_GAMES.map((g) => (
            <EventGameCard key={g.id} game={g} />
          ))}
        </div>
      </Section>

      {/* Game list */}
      <Section id="games" label="Game list" title="ゲームをえらぶ" note={`全${GAMES.length + SOLO_GAMES.length}種類`}>
        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
          {GAMES.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
          {SOLO_GAMES.map((g, i) => (
            <SoloGameCard key={g.id} game={g} index={GAMES.length + i} />
          ))}
          <div className="flex min-h-48 flex-col items-start justify-end gap-2 border-t-4 border-b border-dashed border-line p-4 text-muted">
            <GameEmblem id="soon" className="h-16 w-20" />
            <p className="font-bold">新しいゲーム、準備中…</p>
          </div>
        </div>
      </Section>

      {/* How to */}
      <Section label="How to play" title="遊び方">
        <ol className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-line pt-3">
              <div className="flex items-start justify-between">
                <span className="font-display text-5xl leading-none tabular-nums">{i + 1}</span>
                <Icon name={s.icon} className="h-7 w-7" />
              </div>
              <p className="mt-3 text-xs font-bold tracking-[0.2em] text-accent-ink">STEP {i + 1}</p>
              <h3 className="mt-1 text-lg font-extrabold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <Button size="lg" onClick={scrollToGames}>
            さっそく遊ぶ <Icon name="play" className="h-4 w-4" />
          </Button>
        </div>
      </Section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t-4 border-line px-4 py-6 text-sm text-muted sm:px-6">
        <Logo />
        <Link to="/results" className="inline-flex min-h-11 items-center gap-1 font-bold underline underline-offset-4 hover:text-accent-ink">
          <Icon name="trophy" /> 勝者の記録
        </Link>
        <p>友達と、すぐに、ブラウザで。</p>
      </footer>
    </div>
  );
}
