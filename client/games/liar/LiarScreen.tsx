import { getGameMeta } from '../../../shared/games';
import type { LiarView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import { GameOverPanel, HostNext, HostSkip, PhaseHeader, Scoreboard, StartSplash, SubmissionStatus } from '../../components/game';
import { SpeakerPanel, StatementLog, TurnOrder } from '../../components/talk';
import { Icon } from '../../components/Icon';
import { Avatar, Button } from '../../components/ui';
import { keepAwakeIn, useWakeLock } from '../../lib/wakeLock';
import { useGame } from '../RoomContext';

const meta = getGameMeta('liar')!;

export function LiarScreen() {
  const { game } = useGame<LiarView>();
  // 話を聞いている間に画面が消えて切断し、自分の番が飛ばされないように
  useWakeLock(keepAwakeIn('liar', game.phase));
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
        className={`animate-pop-in bg-danger text-center text-on-danger ring-1 ring-line ${large ? 'p-8' : 'p-4'}`}
        data-testid="liar-card"
      >
        <Icon name="alert" className={`mx-auto !block ${large ? 'h-14 w-14' : 'h-7 w-7'}`} />
        <p className={`font-display ${large ? 'mt-3 text-3xl' : 'text-xl'}`}>あなたは嘘つきです</p>
        {large && (
          <p className="mt-3 text-sm font-bold">
            お題は分かりません。みんなの発言から本当のお題を推理して、
            <br className="hidden sm:inline" />
            バレないように話を合わせよう！
          </p>
        )}
      </div>
    );
  }
  return (
    <div className={`ui-question animate-pop-in text-center ${large ? 'p-8' : 'p-4'}`} data-testid="topic-card">
      <p className="ui-question-label text-xs font-extrabold tracking-[0.25em]">{game.mode === 'wordwolf' ? 'あなたのお題' : 'お題'}</p>
      <p className={`font-display ${large ? 'mt-2 text-4xl' : 'text-2xl'}`}>{game.myTopic}</p>
      {large && (
        <p className="mt-3 text-sm font-bold">
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
      <PhaseHeader icon="eye" title="自分のカードを確認しよう" sub="他の人に画面を見せないように！" />
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
      <PhaseHeader icon="users" title="順番にお題について答えよう" sub="答えそのものを言いすぎると嘘つきにバレるかも？" />
      {game.laps > 1 && (
        // 1つのお題で何周も話すので、いま何周目かを大きく出す（あと何周で投票かが分かるように）
        <p className="ui-tile self-center px-4 py-1.5 font-display text-lg" data-testid="liar-lap">
          {game.lap}周目 <span className="text-base text-muted">/ {game.laps}周</span>
        </p>
      )}
      <p className="text-center text-base text-muted">自分の番まで、画面をつけたままにしてください（消えると番が飛ばされます）</p>
      <TurnOrder order={game.order} index={game.turnIndex} />
      <SpeakerPanel
        // 周をまたいで同じ人が続いても、入力欄を作り直す（前の文字が残って送り直されないように）
        key={`${game.lap}-${game.turnIndex}`}
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
      <PhaseHeader icon="search" title="嘘つきだと思う人に投票！" sub="話し合ってOK。全員が投票すると結果発表（投票は変更できます）" />
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
                  aria-pressed={selected}
                  className={`ui-tile animate-pop-in flex flex-col items-center gap-2 p-4 transition active:scale-95 ${
                    selected ? 'outline-4 outline-accent' : ''
                  }`}
                  data-testid="vote-target"
                >
                  <Avatar name={nameOf(p.id)} color={colorOf(p.id)} size="lg" />
                  <span className="max-w-full truncate font-extrabold">{nameOf(p.id)}</span>
                  {selected && (
                    <span className="ui-badge inline-flex items-center gap-1 bg-accent px-2 py-0.5 text-xs font-extrabold text-on-accent">
                      <Icon name="check" className="h-3 w-3" /> 投票中
                    </span>
                  )}
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
        icon="search"
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
      <div className="animate-pop-in bg-danger p-6 text-center text-on-danger ring-1 ring-line">
        <p className="text-sm font-extrabold">嘘つきは…</p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <Avatar name={nameOf(r.liarId)} color={colorOf(r.liarId)} size="lg" ring />
          <p className="font-display text-4xl" data-testid="liar-name">
            {nameOf(r.liarId)}さん！
          </p>
        </div>
        <p className="mt-4 font-display text-2xl">
          {r.note ? 'ラウンド無効' : r.caught ? (r.liarGuessCorrect ? '見破ったけど逆転された！' : '市民の勝ち！') : '嘘つきの逃げ切り！'}
        </p>
      </div>
      {r.note && <p className="ui-tile px-4 py-2 text-center text-sm font-bold text-warn-ink">{r.note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="ui-question p-4 text-center">
          <p className="ui-question-label text-xs font-extrabold tracking-[0.2em]">本当のお題</p>
          <p className="font-display text-2xl">{r.topic}</p>
        </div>
        <div className="ui-tile p-4 text-center">
          <p className="text-xs font-extrabold tracking-[0.2em] text-muted">{r.liarTopic ? '嘘つきのお題' : '嘘つきの推理'}</p>
          <p className="font-display text-2xl">
            {r.liarTopic ?? (r.liarGuess ? `${r.liarGuess} ${r.liarGuessCorrect ? '○ 正解' : '× はずれ'}` : '—')}
          </p>
        </div>
      </div>
      {voteEntries.length > 0 && (
        <div className="ui-tile p-4">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">投票結果</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {voteEntries.map(([voter, target]) => (
              <li key={voter} className="flex items-center gap-2 text-sm font-bold">
                <Avatar name={nameOf(voter)} color={colorOf(voter)} size="xs" />
                {nameOf(voter)}
                <span className="text-muted">→</span>
                <Avatar name={nameOf(target)} color={colorOf(target)} size="xs" />
                <span className={target === r.liarId ? 'text-ok-ink' : ''}>{nameOf(target)}</span>
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
