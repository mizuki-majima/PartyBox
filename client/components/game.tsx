import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { GameMeta } from '../../shared/games';
import { useRoomContext } from '../games/RoomContext';
import { useRemaining } from '../lib/clock';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';
import { Avatar, Button, Card, TextInput } from './ui';

/* ------------------------------------------------------------------ */
/* 「今やること」を一目で伝えるヘッダー                                   */
/* ------------------------------------------------------------------ */
export function PhaseHeader({ emoji, title, sub }: { emoji?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="animate-slide-up text-center" key={title}>
      <h2 className="font-display text-2xl leading-snug sm:text-3xl">
        {emoji && <span className="mr-2">{emoji}</span>}
        {title}
      </h2>
      {sub && <p className="mt-1.5 text-sm text-white/75 sm:text-base">{sub}</p>}
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
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${urgent ? 'bg-rose-400' : 'bg-gradient-to-r from-pop-mint to-pop-sky'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span
        className={`w-12 text-right font-display text-xl tabular-nums ${urgent ? 'animate-pulse text-rose-300' : ''}`}
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
        <circle cx="50" cy="50" r={r} stroke="rgb(255 255 255 / 0.1)" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={r}
          stroke={sec <= 3 ? '#fb7185' : '#3ee6b5'}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-display text-4xl ${sec <= 3 ? 'text-rose-300' : ''}`}>
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
export function QuestionCard({ label = 'お題', text, accent = '#9b7bff' }: { label?: string; text: string; accent?: string }) {
  return (
    <div className="animate-pop-in relative overflow-hidden rounded-3xl bg-white px-5 py-6 text-center text-ink shadow-2xl sm:px-8 sm:py-8">
      <div className="absolute inset-x-0 top-0 h-2" style={{ background: accent }} />
      <p className="text-xs font-extrabold tracking-[0.25em]" style={{ color: accent }}>
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
      <div className="animate-pop-in flex flex-col items-center gap-3 rounded-3xl bg-emerald-400/12 p-5 text-center ring-1 ring-emerald-300/30">
        <p className="text-sm font-extrabold text-emerald-300">✓ 送信しました</p>
        <p className="font-display text-2xl break-all">{submitted}</p>
        {allowEdit && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            ✏️ 修正する
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
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-line" data-testid="submission-status">
      <p className="mb-3 text-center text-sm font-bold text-white/80">
        {waiting.length === 0 ? (
          <>全員の{label}がそろいました！</>
        ) : (
          <>
            {label}済み <span className="font-display text-pop-mint">{targets.length - waiting.length}</span> / {targets.length}
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
                <span className="animate-pop-in absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[11px] font-black text-ink">
                  ✓
                </span>
              )}
              {!connected.has(id) && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-slate-500 ring-2 ring-panel" title="オフライン" />
              )}
            </div>
            <span className="w-full truncate text-center text-[11px] font-bold text-white/70">{nameOf(id)}</span>
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
          <li key={r.id} className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${r.id === room.youId ? 'bg-white/8' : ''}`}>
            <span className="w-5 text-center font-display text-sm text-muted">{i + 1}</span>
            <Avatar name={nameOf(r.id)} color={colorOf(r.id)} size="sm" dim={r.left} />
            <span className="flex-1 truncate font-bold">
              {nameOf(r.id)}
              {r.left && <span className="ml-1 text-xs text-muted">(退出)</span>}
            </span>
            {r.delta !== 0 && (
              <span className={`animate-pop-in text-sm font-extrabold ${r.delta > 0 ? 'text-pop-mint' : 'text-rose-300'}`}>
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
      {label} ▶
    </Button>
  );
}

/** 時間制フェーズで、ホストが待たずに進めるための控えめなボタン */
export function HostSkip({ label = 'スキップ' }: { label?: string }) {
  const { isHost, act } = useRoomContext();
  if (!isHost) return null;
  return (
    <div className="text-center">
      <button className="text-xs font-bold text-muted underline underline-offset-4 hover:text-white" onClick={() => act('skip')}>
        ⏭ {label}（ホスト）
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
      <div className="animate-pop-in text-8xl drop-shadow-2xl">{meta.emoji}</div>
      <div>
        <p className="text-sm font-extrabold tracking-[0.3em] text-pop-pink">GAME START</p>
        <h2 className="mt-1 font-display text-3xl sm:text-4xl">{meta.title}</h2>
      </div>
      <ol className="w-full max-w-lg space-y-2 rounded-3xl bg-white/5 p-5 text-left text-sm ring-1 ring-line sm:text-base">
        {meta.howToPlay.map((line, i) => (
          <li key={i} className="animate-slide-up flex gap-2" style={{ animationDelay: `${i * 120}ms` }}>
            <span className="font-extrabold text-pop-yellow">{i + 1}.</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
      {sec != null && sec > 0 && (
        <p key={sec} className="animate-pop-in font-display text-5xl text-pop-mint">
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
        color: ['#ff5fa2', '#ffb13d', '#ffe066', '#3ee6b5', '#4cc9ff', '#9b7bff'][i % 6],
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
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li
          key={r.id}
          className={`animate-slide-up flex items-center gap-3 rounded-2xl p-3 ring-1 ${
            r.rank === 1 ? 'bg-gradient-to-r from-pop-yellow/25 to-pop-orange/15 ring-pop-yellow/40' : 'bg-white/5 ring-line'
          }`}
          style={{ animationDelay: `${(rows.length - i) * 120}ms` }}
        >
          <span className="w-9 text-center font-display text-2xl">{medal(r.rank)}</span>
          <Avatar name={nameOf(r.id)} color={colorOf(r.id)} dim={r.left} />
          <span className="flex-1 truncate text-lg font-extrabold">
            {nameOf(r.id)}
            {r.id === room.youId && <span className="ml-2 text-xs text-pop-pink">あなた</span>}
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
        🔁 もう一回遊ぶ
      </Button>
      <Button size="xl" variant="secondary" onClick={() => run('room:backToLobby')} loading={busy === 'room:backToLobby'}>
        🏠 ロビーへ（ゲーム変更）
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
        <p className="text-sm font-extrabold tracking-[0.3em] text-pop-pink">RESULT</p>
        <h2 className="animate-pop-in font-display text-4xl">結果発表！</h2>
        {endReason && <p className="mt-2 rounded-xl bg-amber-400/15 px-4 py-2 text-sm font-bold text-amber-200">{endReason}</p>}
      </div>
      {children}
      {ranking && (
        <Card>
          <Podium />
        </Card>
      )}
      <GameOverActions />
    </div>
  );
}
