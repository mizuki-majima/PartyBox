import { getGameMeta } from '../../../shared/games';
import type { TrialRole, TrialView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import { Confetti, GameOverPanel, HostNext, HostSkip, PhaseHeader, Scoreboard, StartSplash, SubmissionStatus } from '../../components/game';
import { SpeakerPanel, StatementLog, TurnOrder } from '../../components/talk';
import { Avatar, Button } from '../../components/ui';
import { useGame } from '../RoomContext';

const meta = getGameMeta('ten-sec-trial')!;

export const ROLE_INFO: Record<TrialRole, { label: string; emoji: string; color: string }> = {
  defendant: { label: '被告', emoji: '🙇', color: 'from-slate-500 to-slate-700' },
  prosecutor: { label: '検察', emoji: '🔍', color: 'from-rose-500 to-red-700' },
  defense: { label: '弁護士', emoji: '🛡️', color: 'from-sky-500 to-blue-700' },
  witness: { label: '証人', emoji: '👀', color: 'from-amber-500 to-orange-600' },
};

export function TrialScreen() {
  const { game } = useGame<TrialView>();
  switch (game.phase) {
    case 'START':
      return <StartSplash meta={meta} />;
    case 'BRIEFING':
      return <BriefingPhase />;
    case 'TESTIMONY':
      return <TestimonyPhase />;
    case 'VOTE':
      return <VotePhase />;
    case 'VERDICT':
      return <VerdictPhase />;
    case 'GAME_OVER':
      return <GameOverPanel />;
  }
}

function CaseCard() {
  const { game } = useGame<TrialView>();
  if (!game.caseInfo) return null;
  return (
    <div className="animate-pop-in overflow-hidden rounded-3xl bg-[#fdf6e3] text-ink shadow-2xl">
      <div className="flex items-center gap-2 bg-amber-700 px-5 py-2 text-sm font-extrabold text-amber-50">
        ⚖️ 事件ファイル No.{game.round}
      </div>
      <div className="p-5">
        <p className="font-display text-2xl">{game.caseInfo.title}</p>
        <p className="mt-2 text-slate-700">{game.caseInfo.summary}</p>
        <p className="mt-3 rounded-xl bg-amber-100 px-4 py-2 text-center font-display text-lg text-amber-900">{game.caseInfo.question}</p>
      </div>
    </div>
  );
}

function MyRoleCard() {
  const { game } = useGame<TrialView>();
  if (!game.myRole) return null;
  const info = ROLE_INFO[game.myRole];
  return (
    <div className={`animate-pop-in rounded-3xl bg-gradient-to-br ${info.color} p-5 shadow-2xl`} data-testid="my-role">
      <div className="flex items-center gap-3">
        <span className="text-5xl">{info.emoji}</span>
        <div>
          <p className="text-xs font-extrabold text-white/80">あなたの役</p>
          <p className="font-display text-3xl">{info.label}</p>
        </div>
      </div>
      {game.myGoal && <p className="mt-3 rounded-xl bg-black/20 px-4 py-2 text-sm font-bold">{game.myGoal}</p>}
      {game.myCards.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-extrabold text-white/80">🗂 あなただけが知っている証拠</p>
          {game.myCards.map((c) => (
            <p key={c} className="rounded-xl bg-white px-4 py-3 font-bold text-ink shadow" data-testid="evidence">
              {c}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Court() {
  const { game, nameOf, colorOf } = useGame<TrialView>();
  const order: TrialRole[] = ['defendant', 'prosecutor', 'defense', 'witness'];
  const members = Object.entries(game.roles).sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]));
  return (
    <div className="rounded-3xl bg-white/4 p-4 ring-1 ring-line">
      <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">法廷メンバー</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {members.map(([id, role]) => (
          <div key={id} className="flex items-center gap-2 rounded-2xl bg-white/5 p-2">
            <Avatar name={nameOf(id)} color={colorOf(id)} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">{nameOf(id)}</p>
              <p className="text-xs text-muted">
                {ROLE_INFO[role].emoji} {ROLE_INFO[role].label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingPhase() {
  const { game, act, room } = useGame<TrialView>();
  const ready = game.ready.includes(room.youId);
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader emoji="📂" title="事件と自分の役を確認しよう" sub="証拠カードは他の人には見えません。発言のネタにしよう！" />
      <CaseCard />
      <MyRoleCard />
      <Court />
      {game.myRole && (
        <Button size="xl" block onClick={() => act('ready')} disabled={ready} variant={ready ? 'secondary' : 'primary'} data-testid="ready">
          {ready ? '✓ 準備OK' : '準備OK！'}
        </Button>
      )}
      <SubmissionStatus targets={Object.keys(game.roles)} done={game.ready} label="準備" />
      <HostSkip label="開廷する" />
    </div>
  );
}

function TestimonyPhase() {
  const { game, act } = useGame<TrialView>();
  const speaker = game.order[game.turnIndex] ?? null;
  const roleLabel = (id: string) => (game.roles[id] ? ROLE_INFO[game.roles[id]].label : null);
  const role = speaker ? game.roles[speaker] : null;
  const hints: Record<TrialRole, string> = {
    prosecutor: '被告が怪しい理由を10秒で！',
    witness: '見たこと・知っていることを10秒で証言！',
    defense: '被告をかばう弁論を10秒で！',
    defendant: '最終陳述！無実を訴えよう',
  };
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader emoji="🗣️" title="開廷！順番に発言しよう" sub={game.caseInfo?.question} />
      <TurnOrder order={game.order} index={game.turnIndex} labelOf={roleLabel} />
      <SpeakerPanel
        key={game.turnIndex}
        speakerId={speaker}
        deadline={game.deadline}
        duration={game.duration}
        roleLabel={role ? `${ROLE_INFO[role].emoji} ${ROLE_INFO[role].label}` : null}
        hint={role ? hints[role] : ''}
        onSpeak={(text) => act('speak', { text })}
        maxLength={LIMITS.statementLength}
      />
      <MyRoleCard />
      <StatementLog statements={game.statements} labelOf={roleLabel} title="法廷の記録" />
      <HostSkip label="次の人へ" />
    </div>
  );
}

function VotePhase() {
  const { game, act } = useGame<TrialView>();
  const voters = Object.keys(game.roles).filter((id) => game.roles[id] !== 'defendant' && game.players.some((p) => p.id === id && !p.left));
  const roleLabel = (id: string) => (game.roles[id] ? ROLE_INFO[game.roles[id]].label : null);
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader emoji="🔨" title="判決を下そう！" sub={game.caseInfo?.question} />
      {game.canVote ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => act('vote', { verdict: 'guilty' })}
            className={`flex flex-col items-center gap-1 rounded-3xl p-6 font-display text-3xl ring-4 transition active:scale-95 ${
              game.myVote === 'guilty' ? 'bg-rose-500 ring-white' : 'bg-rose-500/20 ring-transparent hover:bg-rose-500/35'
            }`}
            data-testid="vote-guilty"
          >
            <span className="text-5xl">🔨</span>有罪
          </button>
          <button
            onClick={() => act('vote', { verdict: 'innocent' })}
            className={`flex flex-col items-center gap-1 rounded-3xl p-6 font-display text-3xl ring-4 transition active:scale-95 ${
              game.myVote === 'innocent' ? 'bg-sky-500 ring-white' : 'bg-sky-500/20 ring-transparent hover:bg-sky-500/35'
            }`}
            data-testid="vote-innocent"
          >
            <span className="text-5xl">🕊️</span>無罪
          </button>
        </div>
      ) : (
        game.myRole === 'defendant' && (
          <p className="rounded-3xl bg-white/5 p-6 text-center font-bold text-white/80">🙇 被告は投票できません。判決を待ちましょう…</p>
        )
      )}
      <StatementLog statements={game.statements} labelOf={roleLabel} title="法廷の記録" />
      <SubmissionStatus targets={voters} done={game.voted} label="投票" />
      <HostSkip label="投票を締め切る" />
    </div>
  );
}

function VerdictPhase() {
  const { game, nameOf, colorOf } = useGame<TrialView>();
  const r = game.result;
  if (!r) return null;
  const guiltyVoters = Object.entries(r.votes).filter(([, v]) => v === 'guilty').map(([id]) => id);
  const innocentVoters = Object.entries(r.votes).filter(([, v]) => v === 'innocent').map(([id]) => id);
  const correct = r.verdict === r.truth;
  return (
    <div className="flex flex-col gap-4">
      {!r.aborted && correct && <Confetti count={40} />}
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p className="text-sm font-extrabold tracking-[0.3em] text-muted">VERDICT</p>
        {r.aborted ? (
          <p className="font-display text-4xl">裁判中止</p>
        ) : (
          <p
            className={`animate-stamp rounded-2xl border-8 px-8 py-2 font-display text-6xl ${r.verdict === 'guilty' ? 'border-rose-400 text-rose-300' : 'border-sky-400 text-sky-300'}`}
            data-testid="verdict"
          >
            {r.verdict === 'guilty' ? '有罪' : '無罪'}
          </p>
        )}
        {r.note && <p className="mt-2 rounded-xl bg-amber-400/15 px-4 py-2 text-sm font-bold text-amber-200">{r.note}</p>}
      </div>
      <div className={`animate-slide-up rounded-3xl p-5 text-center shadow-2xl [animation-delay:600ms] ${r.truth === 'guilty' ? 'bg-rose-600' : 'bg-sky-600'}`}>
        <p className="text-sm font-extrabold text-white/80">真相は…</p>
        <p className="mt-1 font-display text-2xl">{r.truthText}</p>
        {!r.aborted && <p className="mt-2 font-bold">{correct ? '⚖️ 正しい判決でした！' : '😱 誤審です！'}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: '🔨 有罪', ids: guiltyVoters, cls: 'bg-rose-500/15' },
          { label: '🕊️ 無罪', ids: innocentVoters, cls: 'bg-sky-500/15' },
        ].map((col) => (
          <div key={col.label} className={`rounded-3xl p-4 ${col.cls}`}>
            <p className="mb-2 font-extrabold">
              {col.label} <span className="font-display">{col.ids.length}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {col.ids.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-black/25 py-0.5 pr-2.5 pl-0.5 text-xs font-bold">
                  <Avatar name={nameOf(id)} color={colorOf(id)} size="xs" />
                  {nameOf(id)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-3xl bg-white/4 p-4 ring-1 ring-line">
        <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">全員の証拠カード</p>
        <ul className="space-y-2">
          {Object.entries(r.cards).map(([id, cards]) =>
            cards.map((c) => (
              <li key={id + c} className="flex items-start gap-2 text-sm">
                <Avatar name={nameOf(id)} color={colorOf(id)} size="xs" />
                <span className="shrink-0 font-bold text-muted">{game.roles[id] ? ROLE_INFO[game.roles[id]].label : ''}</span>
                <span className="font-bold">{c}</span>
              </li>
            )),
          )}
        </ul>
      </div>
      <Scoreboard deltas={r.deltas} />
      <HostNext label={game.round >= game.totalRounds ? '最終結果へ' : '次の裁判へ'} />
    </div>
  );
}
