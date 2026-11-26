import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getGameMeta } from '../../../shared/games';
import { AD_STAGE_H, AD_STAGE_W, type AdDodgeView, type AdRacer, type AdTrapKind } from '../../../shared/games/views';
import { GameOverPanel, HostNext, HostSkip, RoundIntro, StartSplash } from '../../components/game';
import { Icon } from '../../components/Icon';
import { Avatar } from '../../components/ui';
import { useRemaining } from '../../lib/clock';
import { useGame } from '../RoomContext';
import { StageCanvas } from './Stage';

const meta = getGameMeta('ad-dodge')!;

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}秒`;

export function AdDodgeScreen() {
  const { game } = useGame<AdDodgeView>();
  switch (game.phase) {
    case 'START':
      return <StartSplash meta={meta} />;
    case 'ROUND_INTRO':
      return <Intro />;
    case 'RACE':
      return <Race />;
    case 'RESULT':
      return <RoundResult />;
    case 'GAME_OVER':
      return <GameOver />;
  }
}

/** 灰色の窓（紺のタイトルバー）。結果などの枠に使う */
function Window({ title, children, className = '', testId }: { title: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`w95-window ${className}`} data-testid={testId}>
      <div className="w95-title">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="w95-title-btn" aria-hidden>
          _
        </span>
        <span className="w95-title-btn" aria-hidden>
          ×
        </span>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Intro() {
  const { game } = useGame<AdDodgeView>();
  const remaining = useRemaining(game.deadline);
  const sec = remaining == null ? null : Math.ceil(remaining / 1000);
  return (
    <RoundIntro round={game.round} total={game.totalRounds}>
      <Window title="おしらせ" className="w-full max-w-md text-left">
        <ul className="space-y-2 text-base">
          <li className="flex gap-2">
            <Icon name="users" className="mt-1 shrink-0" />
            全員に同じ {game.pages} ページが、同じ順番で出ます。
          </li>
          <li className="flex gap-2">
            <Icon name="eye" className="mt-1 shrink-0" />
            本物の「次へ」や「✕」を押して進みます。
          </li>
          <li className="flex gap-2">
            <Icon name="clock" className="mt-1 shrink-0" />
            広告を押すと、3秒は戻れません。
          </li>
        </ul>
      </Window>
      {sec != null && sec > 0 && (
        <p key={sec} className="animate-pop-in font-display text-6xl text-on-accent [text-shadow:2px_2px_0_var(--t-shade)]">
          {sec}
        </p>
      )}
    </RoundIntro>
  );
}

/** みんなの進み具合（1本の線の上に、進んだページの位置で並べる） */
function Track({ racers, pages }: { racers: AdRacer[]; pages: number }) {
  const { room, nameOf, colorOf } = useGame<AdDodgeView>();
  const stacks = new Map<number, number>();
  return (
    <div className="w95-window" data-testid="track">
      <div className="w95-sunken relative mx-1 my-1 h-11">
        {/* ページの区切り */}
        {Array.from({ length: pages + 1 }, (_, i) => (
          <span key={i} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line" style={{ left: `calc(${(i / pages) * 88}% + 6%)` }} />
        ))}
        <span className="absolute top-1/2 right-[6%] left-[6%] h-px bg-line" />
        <Icon name="flag" className="absolute top-1 right-1 h-4 w-4 text-ok-ink" />
        {racers.map((r) => {
          const level = stacks.get(r.cleared) ?? 0;
          stacks.set(r.cleared, level + 1);
          return (
            <span
              key={r.id}
              className="absolute -translate-x-1/2 transition-[left] duration-300"
              style={{ left: `calc(${(r.cleared / pages) * 88}% + 6%)`, top: `${3 + (level % 3) * 10}px` }}
              title={nameOf(r.id)}
            >
              <Avatar name={nameOf(r.id)} color={colorOf(r.id)} size="xs" ring={r.id === room.youId} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** 段が変わったときの、ひとことの吹き出し */
const STEP_NOTES: Partial<Record<AdTrapKind, string>> = {
  escape: '✕が逃げた！',
  chain: 'まだ出てくる…',
  shame: 'もう一度聞かれた…',
  cookie: '設定が開いた',
};

/**
 * ページの窓の幅（px）。窓の下の端まで画面の高さに収まる大きさにする（遊んでいる間にスクロールさせないため）。
 * 上にある帯や進み具合の高さは端末・人数で変わるので、実際の位置から測る
 */
function useFitWidth(frame: HTMLElement | null): number | undefined {
  const [max, setMax] = useState<number>();
  useLayoutEffect(() => {
    if (!frame) return;
    const measure = () => {
      const stageEl = frame.querySelector<HTMLElement>('.adx-stage');
      if (!stageEl) return;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const top = frame.getBoundingClientRect().top + window.scrollY;
      const chrome = frame.offsetHeight - stageEl.offsetHeight;
      const avail = vh - top - chrome - 12;
      // 小さすぎると押せないので、下限を決める（そのときだけスクロールが要る）
      setMax(Math.max(240, Math.floor((avail * AD_STAGE_W) / AD_STAGE_H) + 6));
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [frame]);
  return max;
}

function Race() {
  const { game, act, room } = useGame<AdDodgeView>();
  const me = game.racers.find((r) => r.id === room.youId);
  const stage = game.stage;
  const penalty = game.penalty;
  const [note, setNote] = useState<string | null>(null);
  const prev = useRef<{ page: number; step: number } | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const fitWidth = useFitWidth(frame);

  useEffect(() => {
    if (!stage) return;
    const p = prev.current;
    if (p && p.page === stage.page && stage.step > p.step) setNote(STEP_NOTES[stage.kind] ?? null);
    else if (p && stage.page > p.page) setNote(`${p.page + 1}ページ目 クリア`);
    prev.current = { page: stage.page, step: stage.step };
  }, [stage?.page, stage?.step, stage?.kind]);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 1100);
    return () => clearTimeout(id);
  }, [note]);

  if (!game.me) {
    return (
      <div className="flex flex-col gap-3">
        <Track racers={game.racers} pages={game.pages} />
        <Finished />
      </div>
    );
  }
  if (!stage || !me) {
    return (
      <div className="flex flex-col gap-3">
        <Track racers={game.racers} pages={game.pages} />
        <Finished />
        <HostSkip label="締め切って結果へ" />
      </div>
    );
  }

  const trapLabel = penalty ? (game.myTraps.find((x) => x.kind === penalty.trap)?.label ?? '広告') : null;
  return (
    <div className="flex flex-col gap-2">
      <Track racers={game.racers} pages={game.pages} />
      {/* 窓の幅は、ページ全体が画面の高さに収まる大きさにする（遊んでいる間にスクロールさせない） */}
      <div
        key={penalty?.id ?? 'page'}
        ref={setFrame}
        className={`w95-window mx-auto w-full ${penalty ? 'adx-shake' : ''}`}
        style={{ maxWidth: fitWidth }}
      >
        <div className="w95-title">
          <Icon name="compass" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{penalty ? '広告 - ネットサーフィン' : `${stage.site} - ネットサーフィン`}</span>
          <span className="w95-title-btn" aria-hidden>
            _
          </span>
          <span className="w95-title-btn" aria-hidden>
            □
          </span>
          <span className="w95-title-btn" aria-hidden>
            ×
          </span>
        </div>
        <div className="flex items-center gap-1 px-1 py-1 text-xs">
          <span className="shrink-0">アドレス</span>
          <span className="w95-field min-w-0 flex-1 truncate font-display">
            {penalty ? 'http://ad.example/click?id=8f3a…' : `http://${stage.site}/${stage.page + 1}`}
          </span>
        </div>
        <div className="relative">
          {penalty ? (
            <StageCanvas
              startedAt={penalty.startedAt}
              els={penalty.els}
              testId="ad-landing"
              stepKey={`landing-${penalty.id}`}
              debug={game.debugTarget}
              onTap={(x, y, t) => void act('tap', { x, y, t, landing: penalty.id })}
            />
          ) : (
            <StageCanvas
              key={`${stage.page}-${stage.step}`}
              startedAt={stage.startedAt}
              els={stage.els}
              article={{ site: stage.site, headline: stage.headline }}
              testId="ad-stage"
              stepKey={`${stage.page}-${stage.step}`}
              debug={game.debugTarget}
              onTap={(x, y, t) => void act('tap', { x, y, t, page: stage.page, step: stage.step })}
            />
          )}
          {note && !penalty && (
            <p className="animate-pop-in pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 w95-tooltip px-3 py-1 text-sm font-bold whitespace-nowrap">
              {note}
            </p>
          )}
        </div>
        <div className="flex gap-1 pt-1 text-xs">
          <span className="w95-status flex-1" data-testid="page-no">
            ページ {stage.page + 1} / {game.pages}
          </span>
          <span className={`w95-status ${penalty ? 'font-bold text-danger-ink' : ''}`}>
            {penalty ? `広告を押した（${trapLabel}）` : `広告 ${me.traps}回`}
          </span>
        </div>
      </div>
      <HostSkip label="締め切って結果へ" />
    </div>
  );
}

/** ゴールしたあと（観戦中も）: 誰がゴールしたか */
function Finished() {
  const { game, room, nameOf } = useGame<AdDodgeView>();
  const me = game.racers.find((r) => r.id === room.youId);
  const goals = game.racers.filter((r) => r.finishedMs != null).sort((a, b) => a.finishedMs! - b.finishedMs!);
  const myRank = me?.finishedMs != null ? goals.findIndex((r) => r.id === me.id) + 1 : null;
  return (
    <Window title={me?.finishedMs != null ? 'ゴール！' : 'レース中'} testId="finished">
      {me?.finishedMs != null && (
        <div className="mb-3 text-center">
          <p className="font-display text-5xl" data-testid="my-time">
            {secs(me.finishedMs)}
          </p>
          <p className="mt-1 text-lg font-bold">
            {myRank}位でゴール
            <span className="ml-2 text-sm text-muted">広告 {me.traps}回</span>
          </p>
        </div>
      )}
      <ol className="w95-sunken space-y-1 p-2 text-base">
        {goals.length === 0 && <li className="text-muted">まだ誰もゴールしていません</li>}
        {goals.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2">
            <span className="w-6 text-right font-display">{i + 1}</span>
            <span className="flex-1 truncate font-bold">{nameOf(r.id)}</span>
            <span className="font-display tabular-nums">{secs(r.finishedMs!)}</span>
          </li>
        ))}
      </ol>
      {me?.finishedMs != null && <p className="mt-2 animate-pulse text-center text-sm text-muted">みんなのゴールを待っています…</p>}
    </Window>
  );
}

function TechLink() {
  return (
    <p className="text-center text-sm">
      <a href="/tech" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 font-bold text-fg underline underline-offset-4">
        <Icon name="puzzle" /> このゲームのしくみ（技術者向け・開発中）
      </a>
    </p>
  );
}

function RoundResult() {
  const { game, room, nameOf, colorOf } = useGame<AdDodgeView>();
  const rr = game.roundResult;
  if (!rr) return null;
  const last = game.round >= game.totalRounds;
  return (
    <div className="flex flex-col gap-4">
      <Window title={`ラウンド ${rr.round} の結果`} testId="round-result">
        <ol className="w95-sunken divide-y divide-line/40 p-1">
          {rr.rows.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 px-2 py-2 ${r.id === room.youId ? 'bg-hi/40' : ''}`} data-testid="result-row">
              <span className="flex w-8 flex-col items-center font-display text-xl leading-none">
                {r.rank === 1 && r.finishedMs != null && <Icon name="crown" className="h-4 w-4 text-hi-ink" />}
                {r.rank}
              </span>
              <Avatar name={nameOf(r.id)} color={colorOf(r.id)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{nameOf(r.id)}</span>
                <span className="text-xs text-muted">広告 {r.traps}回</span>
              </span>
              <span className="text-right font-display tabular-nums">
                {r.finishedMs != null ? secs(r.finishedMs) : `${r.cleared}/${game.pages}ページ`}
              </span>
              <span className={`w-10 text-right font-display text-lg ${r.points > 0 ? 'text-ok-ink' : 'text-muted'}`}>+{r.points}</span>
            </li>
          ))}
        </ol>
      </Window>

      {rr.worstTrap && (
        <Window title="いちばん押された罠">
          <p className="text-xl font-bold">
            {rr.worstTrap.label}
            <span className="ml-2 text-base text-muted">{rr.worstTrap.count}回</span>
          </p>
          <p className="mt-1 text-base">{rr.worstTrap.tip}</p>
        </Window>
      )}

      <Window title="このラウンドの罠と見分け方">
        <ol className="space-y-2 text-base">
          {rr.pages.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-6 shrink-0 text-right font-display">{i + 1}</span>
              <span>
                <b>{p.label}</b>
                <span className="block text-sm text-muted">{p.tip}</span>
              </span>
            </li>
          ))}
        </ol>
      </Window>

      <HostNext label={last ? '最終結果へ' : '次のラウンドへ'} waitingText="少しすると、次に進みます…" />
      <TechLink />
    </div>
  );
}

function GameOver() {
  const { game, nameOf } = useGame<AdDodgeView>();
  return (
    <GameOverPanel>
      {game.history.length > 0 && (
        <Window title="各ラウンドの1位">
          <ol className="space-y-1 text-base">
            {game.history.map((h) => (
              <li key={h.round} className="flex items-center gap-2">
                <span className="font-display">ROUND {h.round}</span>
                <span className="flex-1 truncate font-bold">{h.winnerId ? nameOf(h.winnerId) : '（ゴールなし）'}</span>
                {h.ms != null && <span className="font-display tabular-nums">{secs(h.ms)}</span>}
              </li>
            ))}
          </ol>
        </Window>
      )}
      <TechLink />
    </GameOverPanel>
  );
}
