import { getGameMeta } from '../../../shared/games';
import type { TrialRole, TrialView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import { Confetti, GameOverPanel, HostNext, HostSkip, PhaseHeader, Scoreboard, StartSplash, SubmissionStatus } from '../../components/game';
import { SpeakerPanel, StatementLog, TurnOrder } from '../../components/talk';
import { Avatar, Button } from '../../components/ui';
import { useGame } from '../RoomContext';

const meta = getGameMeta('ten-sec-trial')!;

/** 役は、色ではなく1文字の印（判子）と名前で見分ける */
export const ROLE_INFO: Record<TrialRole, { label: string; mark: string }> = {
  defendant: { label: '被告', mark: '被' },
  prosecutor: { label: '検察', mark: '検' },
  defense: { label: '弁護士', mark: '弁' },
  witness: { label: '証人', mark: '証' },
};

/** 役の印（朱の角判子） */
function RoleMark({ role, large = false }: { role: TrialRole; large?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border-2 border-accent font-display leading-none text-accent-ink ${
        large ? 'h-14 w-14 text-3xl' : 'h-5 w-5 text-xs'
      }`}
      aria-hidden
    >
      {ROLE_INFO[role].mark}
    </span>
  );
}

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
    <div className="ui-question animate-pop-in flex">
      {/* 見出しは縦書きで、札の左に立てる */}
      <div className="flex shrink-0 items-center bg-fg px-2 py-3 text-xs font-extrabold tracking-[0.3em] text-bg [writing-mode:vertical-rl]">
        事件ファイル 第{game.round}号
      </div>
      <div className="min-w-0 flex-1 p-5">
        <p className="font-display text-2xl">{game.caseInfo.title}</p>
        <p className="mt-2">{game.caseInfo.summary}</p>
        <p className="ui-tile mt-3 px-4 py-2 text-center font-display text-lg">{game.caseInfo.question}</p>
      </div>
    </div>
  );
}

function MyRoleCard() {
  const { game } = useGame<TrialView>();
  if (!game.myRole) return null;
  const info = ROLE_INFO[game.myRole];
  return (
    <div className="ui-card animate-pop-in" data-testid="my-role">
      <div className="flex items-center gap-3">
        <RoleMark role={game.myRole} large />
        <div>
          <p className="text-xs font-extrabold text-muted">あなたの役</p>
          <p className="font-display text-3xl">{info.label}</p>
        </div>
      </div>
      {game.myGoal && <p className="ui-tile mt-3 px-4 py-2 text-sm font-bold">{game.myGoal}</p>}
      {game.myCards.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-extrabold text-accent-ink">あなただけが知っている証拠</p>
          {game.myCards.map((c) => (
            <p key={c} className="border-l-4 border-accent bg-panel px-4 py-3 font-bold" data-testid="evidence">
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
    <div className="ui-tile p-4">
      <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">法廷メンバー</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {members.map(([id, role]) => (
          <div key={id} className="flex items-center gap-2 p-2">
            <Avatar name={nameOf(id)} color={colorOf(id)} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">{nameOf(id)}</p>
              <p className="flex items-center gap-1 text-xs text-muted">
                <RoleMark role={role} /> {ROLE_INFO[role].label}
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
      <PhaseHeader icon="eye" title="事件と自分の役を確認しよう" sub="証拠カードは他の人には見えません。発言のネタにしよう！" />
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
      <PhaseHeader icon="users" title="開廷！順番に発言しよう" sub={game.caseInfo?.question} />
      <TurnOrder order={game.order} index={game.turnIndex} labelOf={roleLabel} />
      <SpeakerPanel
        key={game.turnIndex}
        speakerId={speaker}
        deadline={game.deadline}
        duration={game.duration}
        roleLabel={role ? ROLE_INFO[role].label : null}
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
      <PhaseHeader icon="check" title="判決を下そう！" sub={game.caseInfo?.question} />
      {game.canVote ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => act('vote', { verdict: 'guilty' })}
            aria-pressed={game.myVote === 'guilty'}
            // 有罪 = 朱の塗り、無罪 = 墨の枠。選んだほうには太い外枠と「投票中」が付く
            className={`flex min-h-32 flex-col items-center justify-center gap-2 bg-danger p-6 font-display text-4xl text-on-danger transition active:scale-95 ${
              game.myVote === 'guilty' ? 'outline-4 outline-offset-4 outline-fg' : ''
            }`}
            data-testid="vote-guilty"
          >
            有罪
            {game.myVote === 'guilty' && <span className="text-sm">投票中 ✓</span>}
          </button>
          <button
            onClick={() => act('vote', { verdict: 'innocent' })}
            aria-pressed={game.myVote === 'innocent'}
            className={`flex min-h-32 flex-col items-center justify-center gap-2 border-4 border-fg bg-panel p-6 font-display text-4xl transition active:scale-95 ${
              game.myVote === 'innocent' ? 'outline-4 outline-offset-4 outline-fg' : ''
            }`}
            data-testid="vote-innocent"
          >
            無罪
            {game.myVote === 'innocent' && <span className="text-sm">投票中 ✓</span>}
          </button>
        </div>
      ) : (
        game.myRole === 'defendant' && (
          <p className="ui-tile p-6 text-center font-bold">被告は投票できません。判決を待ちましょう…</p>
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
            // 判決は判子。有罪 = 朱の塗りの角判子、無罪 = 墨の枠の丸判子（色だけでなく形でも見分ける）
            className={`animate-stamp flex h-40 w-40 items-center justify-center font-display text-6xl leading-none [writing-mode:vertical-rl] ${
              r.verdict === 'guilty' ? 'bg-danger text-on-danger' : 'rounded-full border-8 border-fg'
            }`}
            data-testid="verdict"
          >
            {r.verdict === 'guilty' ? '有罪' : '無罪'}
          </p>
        )}
        {r.note && <p className="ui-tile mt-2 px-4 py-2 text-sm font-bold text-warn-ink">{r.note}</p>}
      </div>
      <div className={`animate-slide-up p-5 text-center [animation-delay:600ms] ${r.truth === 'guilty' ? 'bg-danger text-on-danger' : 'border-4 border-fg bg-panel'}`}>
        <p className="text-sm font-extrabold">真相は…</p>
        <p className="mt-1 font-display text-2xl">{r.truthText}</p>
        {!r.aborted && <p className="mt-2 font-bold">{correct ? '正しい判決でした！' : '誤審です！'}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: '有罪', ids: guiltyVoters, cls: 'border-t-4 border-danger' },
          { label: '無罪', ids: innocentVoters, cls: 'border-t-4 border-fg' },
        ].map((col) => (
          <div key={col.label} className={`bg-panel p-4 ${col.cls}`}>
            <p className="mb-2 font-extrabold">
              {col.label} <span className="font-display">{col.ids.length}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {col.ids.map((id) => (
                <span key={id} className="ui-badge inline-flex items-center gap-1 py-0.5 pr-2.5 pl-0.5 text-xs font-bold">
                  <Avatar name={nameOf(id)} color={colorOf(id)} size="xs" />
                  {nameOf(id)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ui-tile p-4">
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
