import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type GameMeta, isEventGame } from '../../shared/games';
import { useRoomContext } from '../games/RoomContext';
import { useRemaining } from '../lib/clock';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';
import { GameEmblem, Icon, type IconName } from './Icon';
import { Avatar, Button, Card, TextInput } from './ui';

/* ------------------------------------------------------------------ */
/* 「今やること」を一目で伝えるヘッダー                                   */
/* ------------------------------------------------------------------ */
export function PhaseHeader({ icon, emoji, title, sub }: { icon?: IconName; emoji?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="animate-slide-up text-center" key={title}>
      <h2 className="font-display text-2xl leading-snug sm:text-3xl">
        {icon ? <Icon name={icon} className="mr-2 inline-block h-[1em] w-[1em] align-[-0.12em]" /> : emoji && <span className="mr-2">{emoji}</span>}
        {title}
      </h2>
      {sub && <p className="mt-1.5 text-sm text-fg/75 sm:text-base">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* タイマー                                                             */
/* ------------------------------------------------------------------ */
export function TimerBar({ deadline, duration }: { deadline: number | null; duration: number | null }) {
  const remaining = useRemaining(deadline);
  if (remaining == null || !duration) return null;
  const ratio = Math.max(0, Math.min(1, remaining / duration));
  const sec = Math.ceil(remaining / 1000);
  const urgent = sec <= 5;
  return (
    <div className="flex items-center gap-3" data-testid="timer">
      <div className="ui-timer-track h-4 flex-1 overflow-hidden">
        <div
          className="ui-timer-fill h-full transition-[width] duration-200 ease-linear"
          data-urgent={urgent}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span
        className={`w-12 text-right font-display text-xl tabular-nums ${urgent ? 'animate-pulse text-danger-ink' : ''}`}
        aria-label={`残り${sec}秒`}
      >
        {sec}
      </span>
    </div>
  );
}

/** 発言ターン用の大きな円形タイマー */
export function BigTimer({ deadline, duration }: { deadline: number | null; duration: number | null }) {
  const remaining = useRemaining(deadline);
  if (remaining == null || !duration) return null;
  const ratio = Math.max(0, Math.min(1, remaining / duration));
  const sec = Math.ceil(remaining / 1000);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} stroke="var(--t-fg)" strokeOpacity="0.15" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={r}
          stroke={sec <= 3 ? 'var(--t-danger-ink)' : 'var(--t-timer-ring, var(--t-ok))'}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-display text-4xl ${sec <= 3 ? 'text-danger-ink' : ''}`}>
        {sec}
      </span>
    </div>
  );
}

/** 締切直前に、入力中の内容を自動送信する */
export function useAutoSubmit(deadline: number | null, enabled: boolean, submit: () => void, leadMs = 600) {
  const remaining = useRemaining(deadline);
  const fired = useRef<number | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!enabled || remaining == null || deadline == null) return;
    if (remaining <= leadMs && fired.current !== deadline) {
      fired.current = deadline;
      submitRef.current();
    }
  }, [remaining, enabled, deadline, leadMs]);
}

/* ------------------------------------------------------------------ */
/* お題カード                                                           */
/* ------------------------------------------------------------------ */
/** 色はテーマのトークン（--t-q-*）で決まる。accent は以前の呼び出しとの互換のために受け取るだけ */
export function QuestionCard({ label = 'お題', text }: { label?: string; text: string; accent?: string }) {
  return (
    <div className="ui-question animate-pop-in px-5 py-6 text-center sm:px-8 sm:py-8">
      <div className="ui-question-bar absolute inset-x-0 top-0 h-2" />
      <p className="ui-question-label text-xs font-extrabold tracking-[0.25em]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl leading-snug sm:text-3xl" data-testid="question">
        {text}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* テキスト回答フォーム（送信済み表示・修正・自動送信つき）                 */
/* ------------------------------------------------------------------ */
export function AnswerForm({
  submitted,
  placeholder,
  maxLength,
  deadline,
  onSubmit,
  submitLabel = '送信する',
  allowEdit = true,
}: {
  submitted: string | null;
  placeholder: string;
  maxLength: number;
  deadline: number | null;
  onSubmit: (text: string) => Promise<boolean>;
  submitLabel?: string;
  allowEdit?: boolean;
}) {
  const [text, setText] = useState(submitted ?? '');
  const [editing, setEditing] = useState(submitted == null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (submitted == null) setEditing(true);
  }, [submitted]);

  const send = async (auto = false) => {
    const t = text.trim();
    if (!t) return;
    if (!auto) setSending(true);
    const ok = await onSubmit(t);
    setSending(false);
    if (ok) setEditing(false);
  };

  useAutoSubmit(deadline, editing && text.trim().length > 0, () => void send(true));

  if (!editing && submitted != null) {
    return (
      <div className="ui-tile animate-pop-in flex flex-col items-center gap-3 p-5 text-center">
        <p className="text-sm font-extrabold text-ok-ink">✓ 送信しました</p>
        <p className="font-display text-2xl break-all">{submitted}</p>
        {allowEdit && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Icon name="pencil" /> 修正する
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex-1">
        <TextInput
          value={text}
          onChange={setText}
          onEnter={() => void send()}
          maxLength={maxLength}
          placeholder={placeholder}
          autoFocus
          enterKeyHint="send"
          data-testid="answer-input"
        />
      </div>
      <Button size="lg" onClick={() => void send()} loading={sending} disabled={!text.trim()} data-testid="answer-submit">
        {submitLabel}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 提出状況（誰が終わったか）                                             */
/* ------------------------------------------------------------------ */
export function SubmissionStatus({ targets, done, label = '回答' }: { targets: string[]; done: string[]; label?: string }) {
  const { nameOf, colorOf, room } = useRoomContext();
  const doneSet = new Set(done);
  const waiting = targets.filter((id) => !doneSet.has(id));
  const connected = new Set(room.players.filter((p) => p.connected).map((p) => p.id));
  return (
    <div className="ui-tile p-4" data-testid="submission-status">
      <p className="mb-3 text-center text-sm font-bold text-fg/80">
        {waiting.length === 0 ? (
          <>全員の{label}がそろいました！</>
        ) : (
          <>
            {label}済み <span className="font-display text-ok-ink">{targets.length - waiting.length}</span> / {targets.length}
            <span className="ml-2 text-muted">あと{waiting.length}人</span>
          </>
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {targets.map((id) => (
          <div key={id} className="flex w-14 flex-col items-center gap-1">
            <div className="relative">
              <Avatar name={nameOf(id)} color={colorOf(id)} dim={!doneSet.has(id)} />
              {doneSet.has(id) && (
                <span className="animate-pop-in absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-ok text-[11px] font-black text-on-ok ring-1 ring-line">
                  ✓
                </span>
              )}
              {!connected.has(id) && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-muted ring-2 ring-panel" title="オフライン" />
              )}
            </div>
            <span className="w-full truncate text-center text-[11px] font-bold text-fg/70">{nameOf(id)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 得点表                                                               */
/* ------------------------------------------------------------------ */
export function Scoreboard({ deltas, title = 'スコア' }: { deltas?: Record<string, number>; title?: string }) {
  const { room, nameOf, colorOf } = useRoomContext();
  const game = room.game!;
  const rows = useMemo(
    () =>
      game.players
        .map((p) => ({ ...p, score: game.scores[p.id] ?? 0, delta: deltas?.[p.id] ?? 0 }))
        .sort((a, b) => b.score - a.score),
    [game, deltas],
  );
  return (
    <Card className="!p-4">
      <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">{title}</p>
      <ol className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.id} className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${r.id === room.youId ? 'bg-fg/8' : ''}`}>
            <span className="w-5 text-center font-display text-sm text-muted">{i + 1}</span>
            <Avatar name={nameOf(r.id)} color={colorOf(r.id)} size="sm" dim={r.left} />
            <span className="flex-1 truncate font-bold">
              {nameOf(r.id)}
              {r.left && <span className="ml-1 text-xs text-muted">(退出)</span>}
            </span>
            {r.delta !== 0 && (
              <span className={`animate-pop-in text-sm font-extrabold ${r.delta > 0 ? 'text-ok-ink' : 'text-danger-ink'}`}>
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </span>
            )}
            <span className="w-10 text-right font-display text-lg tabular-nums">{r.score}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* ホストの「次へ」ボタン / 参加者の待機表示                                */
/* ------------------------------------------------------------------ */
export function HostNext({ label = '次へ進む', waitingText = 'ホストが次へ進むのを待っています…' }: { label?: string; waitingText?: string }) {
  const { isHost, act } = useRoomContext();
  const [busy, setBusy] = useState(false);
  if (!isHost) {
    return <p className="animate-pulse py-3 text-center text-sm font-bold text-muted">{waitingText}</p>;
  }
  return (
    <Button
      size="xl"
      block
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await act('next');
        setBusy(false);
      }}
      data-testid="host-next"
    >
      {label} <Icon name="play" />
    </Button>
  );
}

/** 時間制フェーズで、ホストが待たずに進めるための控えめなボタン */
export function HostSkip({ label = 'スキップ' }: { label?: string }) {
  const { isHost, act } = useRoomContext();
  if (!isHost) return null;
  return (
    <div className="text-center">
      <button className="min-h-11 px-3 text-xs font-bold text-muted underline underline-offset-4 hover:text-fg" onClick={() => act('skip')}>
        <Icon name="next" className="mr-1 inline-block h-[1em] w-[1em] align-[-0.12em]" />
        {label}（ホスト）
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* START 演出                                                           */
/* ------------------------------------------------------------------ */
export function StartSplash({ meta }: { meta: GameMeta }) {
  const { room } = useRoomContext();
  const remaining = useRemaining(room.game?.deadline ?? null);
  const sec = remaining == null ? null : Math.ceil(remaining / 1000);
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <GameEmblem id={meta.id} className="animate-pop-in block h-32 w-40" />
      <div>
        <p className="text-sm font-extrabold tracking-[0.3em] text-accent-ink">GAME START</p>
        <h2 className="mt-1 font-display text-3xl sm:text-4xl">{meta.title}</h2>
      </div>
      <ol className="ui-tile w-full max-w-lg space-y-2 p-5 text-left text-sm sm:text-base">
        {meta.howToPlay.map((line, i) => (
          <li key={i} className="animate-slide-up flex gap-2" style={{ animationDelay: `${i * 120}ms` }}>
            <span className="font-extrabold text-hi-ink">{i + 1}.</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
      {sec != null && sec > 0 && (
        <p key={sec} className="animate-pop-in font-display text-5xl text-ok-ink">
          {sec}
        </p>
      )}
      <HostSkip label="すぐに始める" />
    </div>
  );
}

export function RoundIntro({ round, total, children }: { round: number; total: number; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <p className="animate-pop-in font-display text-5xl sm:text-6xl">
        ROUND <span className="text-gradient">{round}</span>
        <span className="text-2xl text-muted"> / {total}</span>
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 紙吹雪                                                               */
/* ------------------------------------------------------------------ */
export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2.5 + Math.random() * 2,
        dx: `${(Math.random() - 0.5) * 30}vw`,
        // 紙吹雪の色もテーマから取る
        color: ['var(--t-accent)', 'var(--t-ok)', 'var(--t-hi)', 'var(--t-fg)', 'var(--t-accent2)'][i % 5],
        size: 6 + Math.random() * 8,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
            ['--dx' as string]: p.dx,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ゲーム終了画面（ランキング + もう一回）                                 */
/* ------------------------------------------------------------------ */
export function Podium() {
  const { room, nameOf, colorOf } = useRoomContext();
  const game = room.game!;
  const ranked = [...game.players].sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0));
  // 同点は同順位
  let lastScore: number | null = null;
  let lastRank = 0;
  const rows = ranked.map((p, i) => {
    const score = game.scores[p.id] ?? 0;
    const rank = score === lastScore ? lastRank : i + 1;
    lastScore = score;
    lastRank = rank;
    return { ...p, score, rank };
  });
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li
          key={r.id}
          className={`animate-slide-up flex items-center gap-3 rounded-2xl p-3 ring-1 ring-line ${r.rank === 1 ? 'bg-hi/25' : 'bg-fg/5'}`}
          style={{ animationDelay: `${(rows.length - i) * 120}ms` }}
        >
          {/* 順位は色ではなく数字で。1位には冠を添える */}
          <span className="flex w-10 flex-col items-center font-display text-2xl leading-none">
            {r.rank === 1 && <Icon name="crown" className="h-4 w-4 text-hi-ink" />}
            {r.rank}
          </span>
          <Avatar name={nameOf(r.id)} color={colorOf(r.id)} dim={r.left} />
          <span className="flex-1 truncate text-lg font-extrabold">
            {nameOf(r.id)}
            {r.id === room.youId && <span className="ml-2 text-xs text-accent-ink">あなた</span>}
          </span>
          <span className="font-display text-2xl tabular-nums">{r.score}</span>
          <span className="text-sm text-muted">点</span>
        </li>
      ))}
    </ol>
  );
}

export function GameOverActions() {
  const { isHost } = useRoomContext();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!isHost) {
    return (
      <p className="animate-pulse py-2 text-center text-sm font-bold text-muted">
        ホストが「もう一回」かゲームの変更を選ぶのを待っています…
      </p>
    );
  }
  const run = async (event: 'room:restart' | 'room:backToLobby') => {
    setBusy(event);
    const res = await request(event, {});
    setBusy(null);
    if (!res.ok) toast(res.error, 'error');
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button size="xl" onClick={() => run('room:restart')} loading={busy === 'room:restart'} data-testid="restart">
        <Icon name="repeat" /> もう一回遊ぶ
      </Button>
      <Button size="xl" variant="secondary" onClick={() => run('room:backToLobby')} loading={busy === 'room:backToLobby'}>
        <Icon name="home" /> ロビーへ（ゲーム変更）
      </Button>
    </div>
  );
}

export function GameOverPanel({ children, ranking = true }: { children?: ReactNode; ranking?: boolean }) {
  const { room } = useRoomContext();
  const endReason = room.game?.endReason;
  return (
    <div className="flex flex-col gap-5">
      {!endReason && <Confetti />}
      <div className="text-center">
        <p className="text-sm font-extrabold tracking-[0.3em] text-accent-ink">RESULT</p>
        <h2 className="animate-pop-in font-display text-4xl">結果発表！</h2>
        {endReason && <p className="mt-2 rounded-xl bg-warn/15 px-4 py-2 text-sm font-bold text-warn-ink">{endReason}</p>}
      </div>
      {children}
      {ranking && (
        <Card>
          <Podium />
        </Card>
      )}
      {!endReason && !isEventGame(room.gameId) && !room.demo && (
        <p className="text-center text-sm text-muted" data-testid="result-recorded">
          この結果は「勝者の記録」に残りました。{' '}
          <a href="/results" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-bold text-fg underline underline-offset-4">
            記録を見る
          </a>
        </p>
      )}
      {!endReason && !isEventGame(room.gameId) && room.demo && (
        <p className="text-center text-sm text-muted" data-testid="result-not-recorded">
          デモのルームなので、勝者の記録には残りません。
        </p>
      )}
      <GameOverActions />
    </div>
  );
}
