import { useEffect, useState } from 'react';
import type { PartyEventView } from '../../../shared/games/views';
import { BigTimer, QuestionCard } from '../../components/game';
import { Badge, Button, Card, SectionTitle, TextInput } from '../../components/ui';
import { useGame } from '../RoomContext';
import { HostButton, HostPanel } from './PartyEventScreen';

const PHASE_LABEL: Record<string, string> = {
  idle: 'これから',
  question: '問題',
  answering: '回答タイム',
  reveal: '答え',
  result: '結果',
};

export function QuizSection() {
  const { game } = useGame<PartyEventView>();
  const q = game.quiz;

  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center">
        <p className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">{q.title}</p>
        <p className="mt-1 font-display text-xl">
          {q.qno > 0 ? `第 ${q.qno} 問 / ${q.total}` : `全 ${q.total} 問`}
          <span className="ml-2 text-sm text-pop-yellow">{PHASE_LABEL[q.phase]}</span>
        </p>
        {q.phase === 'answering' && q.deadline && (
          <div className="mt-3 flex justify-center">
            <BigTimer deadline={q.deadline} duration={q.secondsPerQuestion * 1000} />
          </div>
        )}
      </Card>

      {q.phase === 'result' ? <Ranking /> : q.question ? <QuestionArea /> : <Idle />}

      {game.isHost ? <HostControls /> : <MyTeam />}
      {q.phase !== 'idle' && <Scores />}
    </div>
  );
}

function Idle() {
  const { game } = useGame<PartyEventView>();
  return (
    <Card className="py-12 text-center">
      <div className="animate-float text-5xl">📝</div>
      <p className="mt-3 font-display text-xl">
        {game.isHost ? '「次へ」で第1問を出します' : 'まもなくクイズが始まります'}
      </p>
      <p className="mt-2 text-sm text-muted">全 {game.quiz.total} 問</p>
    </Card>
  );
}

function QuestionArea() {
  const { game } = useGame<PartyEventView>();
  const q = game.quiz;
  const question = q.question!;
  const revealed = q.phase === 'reveal';
  const myCorrect = q.myCorrect;

  return (
    <div className="flex flex-col gap-3">
      <QuestionCard label={`第 ${q.qno} 問`} text={question.question} accent="#f59e0b" />

      {q.phase === 'answering' && !game.isHost && <AnswerArea />}

      {q.phase === 'answering' && (
        <Card>
          <SectionTitle>送信ずみ</SectionTitle>
          <div className="flex flex-wrap gap-1.5" data-testid="quiz-answered">
            {q.teams.map((t) => (
              <Badge
                key={t}
                className={q.answeredTeams.includes(t) ? 'bg-pop-mint text-ink' : 'bg-white/8 text-white/60'}
              >
                {q.answeredTeams.includes(t) ? '✓ ' : ''}
                {t}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {revealed && (
        <Card className="animate-pop-in bg-gradient-to-br from-pop-mint/20 to-pop-sky/10 text-center">
          <p className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">答え</p>
          <p className="mt-2 font-display text-3xl text-pop-mint" data-testid="quiz-answer">
            {question.choices && typeof question.answer === 'number'
              ? question.choices[question.answer]
              : String(question.answer ?? '')}
          </p>
          {question.note && <p className="mt-3 text-sm text-white/80">{question.note}</p>}
          {myCorrect !== null && (
            <p className="mt-4 font-display text-xl" data-testid="quiz-my-result">
              {myCorrect ? '🎉 正解！' : '😢 ざんねん'}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 参加者                                                               */
/* ------------------------------------------------------------------ */
function MyTeam() {
  const { game, act } = useGame<PartyEventView>();
  const q = game.quiz;
  const [changing, setChanging] = useState(false);
  if (q.myTeam && !changing) {
    return (
      <Card className="flex items-center justify-between gap-2 !py-3">
        <span className="text-sm text-muted">あなたのチーム</span>
        <span className="flex items-center gap-3">
          <span data-testid="my-team">
            <Badge className="bg-pop-violet/30 text-base text-white">{q.myTeam}</Badge>
          </span>
          <button className="text-xs font-bold text-muted underline" onClick={() => setChanging(true)} data-testid="quiz-team-change">
            変える
          </button>
        </span>
      </Card>
    );
  }
  return (
    <Card>
      <SectionTitle>{q.myTeam ? 'チームを選び直してください' : 'チームを選んでください'}</SectionTitle>
      <div className="grid grid-cols-2 gap-2" data-testid="quiz-team-pick">
        {q.teams.map((t) => (
          <Button
            key={t}
            size="lg"
            variant={t === q.myTeam ? 'success' : 'secondary'}
            onClick={async () => {
              await act('quiz:team', { team: t });
              setChanging(false);
            }}
          >
            {t}
          </Button>
        ))}
      </div>
      {q.myTeam && (
        <button className="mt-3 w-full text-xs font-bold text-muted underline" onClick={() => setChanging(false)}>
          やめる（{q.myTeam} のまま）
        </button>
      )}
    </Card>
  );
}

function AnswerArea() {
  const { game, act } = useGame<PartyEventView>();
  const q = game.quiz;
  const question = q.question!;
  const [text, setText] = useState('');

  useEffect(() => setText(q.myAnswer?.text ?? ''), [q.qno]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!q.myTeam) return <Card className="text-center text-sm text-muted">先にチームを選んでください</Card>;

  if (question.choices) {
    return (
      <div className="grid gap-2" data-testid="quiz-choices">
        {question.choices.map((c, i) => (
          <Button
            key={i}
            size="xl"
            block
            variant={q.myAnswer?.choice === i ? 'success' : 'secondary'}
            onClick={() => act('quiz:answer', { qno: q.qno, choice: i })}
          >
            {q.myAnswer?.choice === i ? '✓ ' : ''}
            {c}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <SectionTitle>チームの答え</SectionTitle>
      <TextInput
        value={text}
        onChange={setText}
        onEnter={() => act('quiz:answer', { qno: q.qno, text })}
        maxLength={100}
        placeholder="答えを入力"
        data-testid="quiz-answer-input"
      />
      <Button
        size="xl"
        block
        className="mt-3"
        onClick={() => act('quiz:answer', { qno: q.qno, text })}
        data-testid="quiz-answer-submit"
      >
        {q.myAnswer ? '送信しなおす' : '送信する'}
      </Button>
      {q.myAnswer && <p className="mt-2 text-center text-xs text-pop-mint">送信ずみ: {q.myAnswer.text}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 司会                                                                 */
/* ------------------------------------------------------------------ */
function HostControls() {
  const { game, act } = useGame<PartyEventView>();
  const q = game.quiz;
  const nextLabel =
    q.phase === 'idle'
      ? '第1問を出す'
      : q.phase === 'question'
        ? '回答タイム開始'
        : q.phase === 'answering'
          ? '締め切って答えを出す'
          : q.qno < q.total
            ? '次の問題へ'
            : '結果発表';

  // 問題・回答タイムの間も、司会にだけ答えを小さく出す（読み上げながら確かめられるように）
  const question = q.question;
  const preview =
    question && (q.phase === 'question' || q.phase === 'answering') && question.answer != null
      ? question.choices && typeof question.answer === 'number'
        ? `${question.answer + 1}. ${question.choices[question.answer]}`
        : String(question.answer)
      : null;

  return (
    <HostPanel title="クイズの進行">
      <div className="flex flex-col gap-3">
        {preview && (
          <p className="rounded-xl bg-black/25 px-3 py-2 text-sm" data-testid="quiz-host-answer">
            <span className="mr-2 text-xs font-extrabold text-amber-200">答え（司会だけに表示）</span>
            <span className="font-bold">{preview}</span>
          </p>
        )}
        <HostButton onClick={() => act('quiz:next', { at: q.position })} disabled={q.phase === 'result'} testId="quiz-next">
          ▶ {nextLabel}
        </HostButton>
        <Button size="sm" variant="secondary" onClick={() => act('quiz:prev', { at: q.position })} disabled={q.phase === 'idle'}>
          ↩ 1つ戻す
        </Button>
        {q.answers && q.answers.length > 0 && <AnswerTable />}
      </div>
    </HostPanel>
  );
}

function AnswerTable() {
  const { game, act } = useGame<PartyEventView>();
  const q = game.quiz;
  const free = !q.question?.choices;
  return (
    <div>
      <SectionTitle right={<span className="text-xs text-muted">{free ? '○ を付けてください' : '自動採点ずみ'}</span>}>
        各チームの回答
      </SectionTitle>
      <ul className="flex flex-col gap-1.5" data-testid="quiz-host-answers">
        {q.answers!.map((a) => (
          <li key={a.team} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
            <span className="w-20 shrink-0 truncate text-xs font-extrabold text-muted">{a.team}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{a.text}</span>
            {a.seconds != null && <span className="shrink-0 text-xs text-muted">{a.seconds}s</span>}
            {free ? (
              <div className="flex shrink-0 gap-1">
                <button
                  className={`rounded-lg px-2 py-1 text-sm font-extrabold ${a.correct === true ? 'bg-pop-mint text-ink' : 'bg-white/10'}`}
                  onClick={() => act('quiz:grade', { qno: q.qno, team: a.team, correct: true })}
                >
                  ○
                </button>
                <button
                  className={`rounded-lg px-2 py-1 text-sm font-extrabold ${a.correct === false ? 'bg-rose-400 text-ink' : 'bg-white/10'}`}
                  onClick={() => act('quiz:grade', { qno: q.qno, team: a.team, correct: false })}
                >
                  ×
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-lg">{a.correct === true ? '⭕' : a.correct === false ? '❌' : ''}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 得点                                                                 */
/* ------------------------------------------------------------------ */
function Scores() {
  const { game } = useGame<PartyEventView>();
  const q = game.quiz;
  return (
    <Card>
      <SectionTitle>とくてん</SectionTitle>
      <ul className="flex flex-col gap-1.5" data-testid="quiz-scores">
        {q.ranking.map((r) => (
          <li
            key={r.team}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.team === q.myTeam ? 'bg-pop-violet/25' : 'bg-white/5'}`}
          >
            <span className="font-display text-lg text-pop-yellow">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{r.team}</span>
            <span className="font-display text-xl">{r.score}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Ranking() {
  const { game } = useGame<PartyEventView>();
  // 同点なら並べて出す
  const winners = game.quiz.ranking.filter((r) => r.rank === 1);
  return (
    <Card className="animate-pop-in bg-gradient-to-br from-pop-yellow/20 to-pop-orange/10 py-10 text-center">
      <div className="text-6xl">🏆</div>
      <p className="mt-3 text-sm text-muted">{winners.length > 1 ? '同点優勝' : '優勝'}</p>
      <p className="font-display text-4xl text-pop-yellow" data-testid="quiz-winner">
        {winners.length ? winners.map((r) => r.team).join('・') : '—'}
      </p>
      <p className="mt-2 font-display text-xl">{winners[0]?.score ?? 0} 問正解</p>
    </Card>
  );
}
