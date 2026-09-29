import { useState } from 'react';
import { getGameMeta } from '../../../shared/games';
import type { UnanimousGroup, UnanimousView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import {
  AnswerForm,
  Confetti,
  GameOverPanel,
  HostNext,
  HostSkip,
  PhaseHeader,
  QuestionCard,
  RoundIntro,
  StartSplash,
  SubmissionStatus,
} from '../../components/game';
import { Avatar, Button, Card } from '../../components/ui';
import { useGame } from '../RoomContext';

const meta = getGameMeta('unanimous')!;

export function UnanimousScreen() {
  const { game } = useGame<UnanimousView>();
  switch (game.phase) {
    case 'START':
      return <StartSplash meta={meta} />;
    case 'ROUND_INTRO':
      return (
        <RoundIntro round={game.round} total={game.totalRounds}>
          {game.question && <QuestionCard text={game.question} accent={meta.theme.to} />}
        </RoundIntro>
      );
    case 'ANSWER':
      return <AnswerPhase />;
    case 'REVEAL':
      return <RevealPhase />;
    case 'GAME_OVER':
      return <GameOver />;
  }
}

function TeamScore({ extra }: { extra?: number }) {
  const { game } = useGame<UnanimousView>();
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/5 px-4 py-2 ring-1 ring-line">
      <span className="text-sm font-bold text-muted">チーム得点</span>
      <span className="font-display text-2xl" data-testid="team-score">
        {game.teamScore}
      </span>
      {extra ? <span className="animate-pop-in font-display text-xl text-pop-mint">+{extra}</span> : null}
    </div>
  );
}

function AnswerPhase() {
  const { game, act } = useGame<UnanimousView>();
  const targets = game.players.filter((p) => !p.left).map((p) => p.id);
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader emoji="🤝" title="みんなと同じ答えを書こう！" sub="みんなが書きそうな答えを予想して入力しよう" />
      <QuestionCard text={game.question ?? ''} accent={meta.theme.to} />
      {game.me ? (
        <AnswerForm
          submitted={game.myAnswer}
          placeholder="答えを入力"
          maxLength={LIMITS.answerLength}
          deadline={game.deadline}
          onSubmit={(text) => act('answer', { text })}
        />
      ) : null}
      <SubmissionStatus targets={targets} done={game.submitted} />
      <div className="flex flex-wrap justify-center gap-2 text-xs text-muted">
        {game.pointTable.map((p) => (
          <span key={p.size} className="rounded-full bg-white/5 px-2.5 py-1">
            {p.size}一致 <b className="text-white">{p.points}点</b>
          </span>
        ))}
      </div>
      <TeamScore />
      <HostSkip label="締め切って結果へ" />
    </div>
  );
}

function GroupCard({
  group,
  selectable,
  selected,
  onToggle,
  index,
}: {
  group: UnanimousGroup;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  index: number;
}) {
  const { nameOf, colorOf } = useGame<UnanimousView>();
  const matched = group.playerIds.length >= 2;
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onToggle}
      className={`animate-pop-in flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-2 transition sm:p-4 ${
        selected ? 'bg-pop-violet/25 ring-pop-violet' : matched ? 'bg-white/10 ring-transparent' : 'bg-white/4 ring-transparent'
      } ${selectable ? 'cursor-pointer hover:bg-white/15' : 'cursor-default'}`}
      style={{ animationDelay: `${index * 90}ms` }}
      data-testid="answer-group"
    >
      {selectable && (
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-2 ${selected ? 'bg-pop-violet ring-pop-violet' : 'ring-white/30'}`}>
          {selected && '✓'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`font-display break-all ${matched ? 'text-2xl' : 'text-lg text-white/75'}`}>{group.label}</p>
        {group.variants.length > 1 && <p className="text-xs text-muted">表記: {group.variants.join(' / ')}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {group.playerIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-black/25 py-0.5 pr-2.5 pl-0.5 text-xs font-bold">
              <Avatar name={nameOf(id)} color={colorOf(id)} size="xs" />
              {nameOf(id)}
            </span>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-3xl">{group.playerIds.length}<span className="text-base">人</span></p>
        {group.points > 0 ? <p className="font-extrabold text-pop-mint">+{group.points}点</p> : <p className="text-xs text-muted">0点</p>}
      </div>
    </button>
  );
}

function RevealPhase() {
  const { game, isHost, act, nameOf } = useGame<UnanimousView>();
  const [merging, setMerging] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const result = game.result;
  if (!result) return null;

  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  const merge = async () => {
    if (await act('merge', { keys: selected })) {
      setSelected([]);
      setMerging(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {result.unanimous && <Confetti />}
      <PhaseHeader
        emoji={result.unanimous ? '🎉' : '📣'}
        title={result.unanimous ? '全員一致！！' : '答え合わせ'}
        sub={result.question}
      />
      <div className="animate-pop-in text-center">
        <p className="text-sm font-bold text-muted">このラウンドの得点</p>
        <p className="font-display text-6xl text-gradient" data-testid="round-score">
          +{result.roundScore}
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        {result.groups.map((g, i) => (
          <GroupCard key={g.key} group={g} index={i} selectable={merging} selected={selected.includes(g.key)} onToggle={() => toggle(g.key)} />
        ))}
        {result.noAnswer.length > 0 && (
          <p className="text-center text-sm text-muted">未回答: {result.noAnswer.map(nameOf).join('、')}</p>
        )}
      </div>
      {isHost && (result.groups.length > 1 || result.merged) && (
        <Card className="!p-4">
          {merging ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <p className="flex-1 text-sm font-bold text-white/80">同じ意味の答えを2つ以上選んでください</p>
              <Button size="sm" variant="secondary" onClick={() => setMerging(false)}>
                やめる
              </Button>
              <Button size="sm" onClick={merge} disabled={selected.length < 2}>
                まとめる
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {result.groups.length > 1 && (
                <Button size="sm" variant="secondary" onClick={() => setMerging(true)}>
                  🔗 表記ゆれをまとめる
                </Button>
              )}
              {result.merged && (
                <Button size="sm" variant="ghost" onClick={() => act('unmerge')}>
                  元に戻す
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
      <TeamScore extra={result.roundScore} />
      <HostNext label={game.round >= game.totalRounds ? '最終結果へ' : '次のラウンドへ'} />
    </div>
  );
}

function rating(ratio: number) {
  if (ratio >= 0.8) return { emoji: '🏆', title: '以心伝心マスター', text: '心が完全につながっています！' };
  if (ratio >= 0.5) return { emoji: '💞', title: '息ぴったりチーム', text: 'かなり通じ合っています！' };
  if (ratio >= 0.25) return { emoji: '😊', title: 'なかなかの仲良し', text: 'もう一回やればもっと揃うかも？' };
  return { emoji: '🌈', title: '個性派ぞろい', text: 'バラバラなのもまた楽しい！' };
}

function GameOver() {
  const { game, nameOf, colorOf } = useGame<UnanimousView>();
  const r = rating(game.maxScore > 0 ? game.teamScore / game.maxScore : 0);
  const players = [...game.players].sort((a, b) => (game.matchCounts[b.id] ?? 0) - (game.matchCounts[a.id] ?? 0));
  return (
    <GameOverPanel ranking={false}>
      <Card className="text-center">
        <p className="text-sm font-bold text-muted">チーム合計</p>
        <p className="font-display text-7xl text-gradient" data-testid="final-team-score">
          {game.teamScore}
        </p>
        <p className="text-sm text-muted">/ 最大 {game.maxScore} 点</p>
        <div className="mt-4 text-5xl">{r.emoji}</div>
        <p className="mt-1 font-display text-2xl">{r.title}</p>
        <p className="text-sm text-white/75">{r.text}</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="!p-4">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">ラウンド別</p>
          <ol className="space-y-1.5 text-sm">
            {game.history.map((h) => (
              <li key={h.round} className="flex items-center gap-2">
                <span className="w-6 font-display text-muted">{h.round}</span>
                <span className="flex-1 truncate">{h.question}</span>
                <span className="font-extrabold">{h.unanimous ? '🎉 ' : ''}+{h.roundScore}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="!p-4">
          <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">シンクロ回数</p>
          <ol className="space-y-1.5">
            {players.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Avatar name={nameOf(p.id)} color={colorOf(p.id)} size="sm" dim={p.left} />
                <span className="flex-1 truncate font-bold">{nameOf(p.id)}</span>
                <span className="font-display">{game.matchCounts[p.id] ?? 0}</span>
                <span className="text-xs text-muted">/ {game.history.length}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </GameOverPanel>
  );
}
