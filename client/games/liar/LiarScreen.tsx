import { getGameMeta } from '../../../shared/games';
import type { LiarView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import { GameOverPanel, HostNext, HostSkip, PhaseHeader, Scoreboard, StartSplash, SubmissionStatus } from '../../components/game';
import { SpeakerPanel, StatementLog, TurnOrder } from '../../components/talk';
import { Avatar, Button } from '../../components/ui';
import { useGame } from '../RoomContext';

const meta = getGameMeta('liar')!;

export function LiarScreen() {
  const { game } = useGame<LiarView>();
  switch (game.phase) {
    case 'START':
      return <StartSplash meta={meta} />;
    case 'ROLE':
      return <RolePhase />;
    case 'TALK':
      return <TalkPhase />;
    case 'VOTE':
      return <VotePhase />;
    case 'LIAR_GUESS':
      return <LiarGuessPhase />;
    case 'RESULT':
      return <ResultPhase />;
    case 'GAME_OVER':
      return <GameOverPanel />;
  }
}

/** 自分の役割カード（常に確認できるよう各フェーズで小さく表示） */
function MyCard({ large = false }: { large?: boolean }) {
  const { game } = useGame<LiarView>();
  if (!game.me) return null;
  if (game.amLiar) {
    return (
      <div
        className={`animate-pop-in rounded-3xl bg-gradient-to-br from-rose-500 to-orange-500 text-center shadow-2xl ${large ? 'p-8' : 'p-4'}`}
        data-testid="liar-card"
      >
        <p className={large ? 'text-6xl' : 'text-2xl'}>🤫</p>
        <p className={`font-display ${large ? 'mt-3 text-3xl' : 'text-xl'}`}>あなたは嘘つきです</p>
        {large && (
          <p className="mt-3 text-sm font-bold text-white/90">
            お題は分かりません。みんなの発言から本当のお題を推理して、
            <br className="hidden sm:inline" />
            バレないように話を合わせよう！
          </p>
        )}
      </div>
    );
  }
  return (
    <div className={`animate-pop-in rounded-3xl bg-white text-center text-ink shadow-2xl ${large ? 'p-8' : 'p-4'}`} data-testid="topic-card">
      <p className="text-xs font-extrabold tracking-[0.25em] text-rose-500">{game.mode === 'wordwolf' ? 'あなたのお題' : 'お題'}</p>
      <p className={`font-display ${large ? 'mt-2 text-4xl' : 'text-2xl'}`}>{game.myTopic}</p>
      {large && (
        <p className="mt-3 text-sm font-bold text-slate-500">
          {game.mode === 'wordwolf'
            ? '1人だけ違うお題の人がいます。あなたかも…？'
            : 'この中に1人だけお題を知らない嘘つきがいます。答えを言いすぎないように！'}
        </p>
      )}
    </div>
  );
}

function RolePhase() {
  const { game, act, room } = useGame<LiarView>();
  const ready = game.ready.includes(room.youId);
  return (
    <div className="flex flex-col gap-5">
      <PhaseHeader emoji="🃏" title="自分のカードを確認しよう" sub="他の人に画面を見せないように！" />
      <MyCard large />
      {game.me && (
        <Button size="xl" block onClick={() => act('ready')} disabled={ready} variant={ready ? 'secondary' : 'primary'} data-testid="ready">
          {ready ? '✓ 確認しました' : '確認した！'}
        </Button>
      )}
      <SubmissionStatus targets={game.players.filter((p) => !p.left).map((p) => p.id)} done={game.ready} label="確認" />
      <HostSkip />
    </div>
  );
}

function TalkPhase() {
  const { game, act } = useGame<LiarView>();
  const speaker = game.order[game.turnIndex] ?? null;
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader emoji="🗣️" title="順番にお題について答えよう" sub="答えそのものを言いすぎると嘘つきにバレるかも？" />
      <TurnOrder order={game.order} index={game.turnIndex} />
      <SpeakerPanel
        key={game.turnIndex}
        speakerId={speaker}
        deadline={game.deadline}
        duration={game.duration}
        hint={game.amLiar ? 'バレないように、それっぽく答えよう…！' : `「${game.myTopic ?? ''}」について一言！`}
        onSpeak={(text) => act('speak', { text })}
        maxLength={LIMITS.statementLength}
      />
      <MyCard />
      <StatementLog statements={game.statements} />
      <HostSkip label="この人をスキップ" />
    </div>
  );
}

function VotePhase() {
  const { game, act, room, nameOf, colorOf } = useGame<LiarView>();
  const targets = game.players.filter((p) => !p.left);
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader emoji="🗳️" title="嘘つきだと思う人に投票！" sub="話し合ってOK。全員が投票すると結果発表（投票は変更できます）" />
      {game.me && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {targets
            .filter((p) => p.id !== room.youId)
            .map((p) => {
              const selected = game.myVote === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => act('vote', { targetId: p.id })}
                  className={`animate-pop-in flex flex-col items-center gap-2 rounded-3xl p-4 ring-2 transition active:scale-95 ${
                    selected ? 'bg-rose-500/25 ring-rose-400' : 'bg-panel ring-line hover:bg-panel-2'
                  }`}
                  data-testid="vote-target"
                >
                  <Avatar name={nameOf(p.id)} color={colorOf(p.id)} size="lg" />
                  <span className="max-w-full truncate font-extrabold">{nameOf(p.id)}</span>
                  {selected && <span className="text-xs font-extrabold text-rose-300">投票中 🎯</span>}
                </button>
              );
            })}
        </div>
      )}
      <MyCard />
      <StatementLog statements={game.statements} />
      <SubmissionStatus targets={targets.map((p) => p.id)} done={game.voted} label="投票" />
      <HostSkip label="投票を締め切る" />
    </div>
  );
}

function LiarGuessPhase() {
  const { game, act, room, nameOf } = useGame<LiarView>();
  const isGuesser = game.guesserId === room.youId;
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader
        emoji="🎯"
        title={isGuesser ? '見破られた…！でもまだチャンス' : `嘘つきは${nameOf(game.guesserId)}さんでした！`}
        sub={isGuesser ? '本当のお題を当てれば逆転ボーナス！' : '嘘つきが本当のお題を推理しています…'}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {(game.guessChoices ?? []).map((t) => (
          <Button
            key={t}
            size="lg"
            variant={isGuesser ? 'white' : 'secondary'}
            disabled={!isGuesser}
            onClick={() => act('guessTopic', { topic: t })}
            className="!h-auto min-h-14 py-3"
            data-testid="topic-choice"
          >
            {t}
          </Button>
        ))}
      </div>
      <StatementLog statements={game.statements} />
      <HostSkip />
    </div>
  );
}

function ResultPhase() {
  const { game, nameOf, colorOf } = useGame<LiarView>();
  const r = game.result;
  if (!r) return null;
  const voteEntries = Object.entries(r.votes);
  return (
    <div className="flex flex-col gap-4">
      <div className="animate-pop-in rounded-3xl bg-gradient-to-br from-rose-500 to-orange-500 p-6 text-center shadow-2xl">
        <p className="text-sm font-extrabold text-white/85">嘘つきは…</p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <Avatar name={nameOf(r.liarId)} color={colorOf(r.liarId)} size="lg" ring />
          <p className="font-display text-4xl" data-testid="liar-name">
            {nameOf(r.liarId)}さん！
          </p>
        </div>
        <p className="mt-4 font-display text-2xl">
          {r.note ? '⚠️ ラウンド無効' : r.caught ? (r.liarGuessCorrect ? '🔄 見破ったけど逆転された！' : '🎉 市民の勝ち！') : '🤫 嘘つきの逃げ切り！'}
        </p>
      </div>
      {r.note && <p className="rounded-xl bg-amber-400/15 px-4 py-2 text-center text-sm font-bold text-amber-200">{r.note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-white p-4 text-center text-ink">
          <p className="text-xs font-extrabold tracking-[0.2em] text-rose-500">本当のお題</p>
          <p className="font-display text-2xl">{r.topic}</p>
        </div>
        <div className="rounded-3xl bg-panel p-4 text-center ring-1 ring-line">
          <p className="text-xs font-extrabold tracking-[0.2em] text-muted">{r.liarTopic ? '嘘つきのお題' : '嘘つきの推理'}</p>
          <p className="font-display text-2xl">
            {r.liarTopic ?? (r.liarGuess ? `${r.liarGuess} ${r.liarGuessCorrect ? '⭕' : '❌'}` : '—')}
          </p>
        </div>
      </div>
      {voteEntries.length > 0 && (
        <div className="rounded-3xl bg-white/4 p-4 ring-1 ring-line">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">投票結果</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {voteEntries.map(([voter, target]) => (
              <li key={voter} className="flex items-center gap-2 text-sm font-bold">
                <Avatar name={nameOf(voter)} color={colorOf(voter)} size="xs" />
                {nameOf(voter)}
                <span className="text-muted">→</span>
                <Avatar name={nameOf(target)} color={colorOf(target)} size="xs" />
                <span className={target === r.liarId ? 'text-pop-mint' : ''}>{nameOf(target)}</span>
                {target === r.liarId && '✓'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Scoreboard deltas={r.deltas} />
      <HostNext label={game.round >= game.totalRounds ? '最終結果へ' : '次のラウンドへ'} />
    </div>
  );
}
