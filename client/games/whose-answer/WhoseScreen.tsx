import { getGameMeta } from '../../../shared/games';
import type { WhoseView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import {
  AnswerForm,
  GameOverPanel,
  HostNext,
  HostSkip,
  PhaseHeader,
  QuestionCard,
  RoundIntro,
  Scoreboard,
  StartSplash,
  SubmissionStatus,
} from '../../components/game';
import { Icon } from '../../components/Icon';
import { Avatar, Button } from '../../components/ui';
import { useGame } from '../RoomContext';

const meta = getGameMeta('whose-answer')!;

export function WhoseScreen() {
  const { game } = useGame<WhoseView>();
  switch (game.phase) {
    case 'START':
      return <StartSplash meta={meta} />;
    case 'ROUND_INTRO':
      return (
        <RoundIntro round={game.round} total={game.totalRounds}>
          {game.question && <QuestionCard label="質問" text={game.question} accent={meta.theme.from} />}
        </RoundIntro>
      );
    case 'ANSWER':
      return <AnswerPhase />;
    case 'GUESS':
      return <GuessPhase />;
    case 'RESULT':
      return <ResultPhase />;
    case 'GAME_OVER':
      return <GameOverPanel />;
  }
}

function AnswerPhase() {
  const { game, act } = useGame<WhoseView>();
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader icon="pencil" title="質問に答えよう" sub="回答は匿名で集められます。自分らしい答えでも、なりすましでもOK！" />
      <QuestionCard label="質問" text={game.question ?? ''} accent={meta.theme.from} />
      {game.me && (
        <AnswerForm
          submitted={game.myAnswer}
          placeholder="あなたの答え"
          maxLength={LIMITS.answerLength}
          deadline={game.deadline}
          onSubmit={(text) => act('answer', { text })}
        />
      )}
      <SubmissionStatus targets={game.players.filter((p) => !p.left).map((p) => p.id)} done={game.submitted} />
      <HostSkip label="締め切る" />
    </div>
  );
}

function GuessPhase() {
  const { game, act, nameOf, colorOf } = useGame<WhoseView>();
  const answers = game.answers ?? [];
  const others = answers.filter((a) => !a.mine);
  const assignedCount = others.filter((a) => game.myGuesses[a.id]).length;
  const usedBy = new Map<string, string>();
  for (const [answerId, pid] of Object.entries(game.myGuesses)) usedBy.set(pid, answerId);
  const canPlay = game.me !== null && game.candidates.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader
        icon="search"
        title="この回答を書いたのは誰？"
        sub={canPlay ? '各回答に「書いたと思う人」を選ぼう（自分の回答は選べません）' : 'みんなが推理中です…'}
      />
      <QuestionCard label="質問" text={game.question ?? ''} accent={meta.theme.from} />
      <div className="flex flex-col gap-3">
        {answers.map((a, i) => (
          <div
            key={a.id}
            className={`ui-card animate-pop-in !p-4 ${a.mine ? 'opacity-75' : ''}`}
            style={{ animationDelay: `${i * 60}ms` }}
            data-testid="guess-card"
          >
            <div className="flex items-center gap-3">
              <p className="flex-1 font-display text-2xl break-all">「{a.text}」</p>
              {a.mine && <span className="ui-badge shrink-0 px-3 py-1 text-xs font-extrabold text-muted">あなたの回答</span>}
            </div>
            {!a.mine && canPlay && (
              <div className="mt-3 flex flex-wrap gap-2">
                {game.candidates.map((pid) => {
                  const selected = game.myGuesses[a.id] === pid;
                  const usedElsewhere = !selected && usedBy.has(pid);
                  return (
                    <button
                      key={pid}
                      disabled={game.locked}
                      onClick={() => act('guess', { answerId: a.id, playerId: selected ? null : pid })}
                      aria-pressed={selected}
                      className={`ui-badge inline-flex min-h-11 items-center gap-1.5 py-1 pr-3.5 pl-1.5 text-sm font-extrabold transition ${
                        selected ? 'bg-fg text-bg' : usedElsewhere ? 'border-dashed bg-transparent text-muted' : 'bg-panel'
                      }`}
                    >
                      {/* 選んだ人には、色だけでなく印も付ける */}
                      {selected && <Icon name="check" className="h-4 w-4" />}
                      <Avatar name={nameOf(pid)} color={colorOf(pid)} size="xs" dim={usedElsewhere} />
                      {nameOf(pid)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {canPlay && (
        <div className="sticky bottom-3 z-10">
          {game.locked ? (
            <Button size="xl" block variant="secondary" onClick={() => act('unlock')}>
              <Icon name="check" /> 確定済み（タップで修正）
            </Button>
          ) : (
            <Button size="xl" block onClick={() => act('lock')} data-testid="lock-guesses">
              {assignedCount < others.length ? `推理を確定（${assignedCount}/${others.length}）` : '推理を確定する'}
            </Button>
          )}
        </div>
      )}
      <SubmissionStatus targets={game.players.filter((p) => !p.left).map((p) => p.id)} done={game.submitted} label="推理確定" />
      <HostSkip label="締め切って答え合わせ" />
    </div>
  );
}

function ResultPhase() {
  const { game, nameOf, colorOf } = useGame<WhoseView>();
  const result = game.result;
  if (!result) return null;
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader icon="check" title="答え合わせ！" sub={game.question ?? undefined} />
      {result.note && <p className="ui-tile px-4 py-2 text-center text-sm font-bold text-warn-ink">{result.note}</p>}
      <div className="flex flex-col gap-3">
        {result.entries.map((e, i) => {
          const wrong = Object.entries(e.guesses).filter(([, g]) => g !== e.authorId);
          return (
            <div
              key={e.id}
              className="ui-card animate-slide-up !p-4"
              style={{ animationDelay: `${i * 250}ms` }}
              data-testid="result-entry"
            >
              <p className="font-display text-2xl break-all">「{e.text}」</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-muted">この回答は</span>
                <Avatar name={nameOf(e.authorId)} color={colorOf(e.authorId)} size="sm" />
                <span className="text-lg font-extrabold">{nameOf(e.authorId)}さん</span>
                <span className="text-sm text-muted">でした！</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {e.correctGuessers.length === 0 ? (
                  <span className="ui-badge px-2.5 py-1 font-bold text-ok-ink">誰にもバレなかった！ +1</span>
                ) : (
                  e.correctGuessers.map((g) => (
                    <span key={g} className="ui-badge px-2.5 py-1 font-bold text-ok-ink">
                      ✓ {nameOf(g)}
                    </span>
                  ))
                )}
                {wrong.map(([g, guessed]) => (
                  <span key={g} className="ui-badge px-2.5 py-1 font-bold text-danger-ink">
                    ✗ {nameOf(g)}→{nameOf(guessed)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Scoreboard deltas={result.deltas} />
      <HostNext label={game.round >= game.totalRounds ? '最終結果へ' : '次のラウンドへ'} />
    </div>
  );
}
