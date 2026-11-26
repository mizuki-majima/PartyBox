import { useEffect, useState } from 'react';
import type { PartyEventView } from '../../../shared/games/views';
import { BigTimer, QuestionCard, TimerBar } from '../../components/game';
import { Icon } from '../../components/Icon';
import { Badge, Button, Card, SectionTitle, TextInput } from '../../components/ui';
import { useGame } from '../RoomContext';
import { MoreRow, MoreSheet } from './MoreSheet';
import { HostActionBar, HostButton, HostPanel, ResetButton } from './PartyEventScreen';

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
  if (!game.isHost) return <GuestQuiz />;

  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center">
        <p className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">{q.title}</p>
        <p className="mt-1 font-display text-xl">
          {q.qno > 0 ? `第 ${q.qno} 問 / ${q.total}` : `全 ${q.total} 問`}
          <span className="ml-2 text-sm text-hi-ink">{PHASE_LABEL[q.phase]}</span>
        </p>
        {q.phase === 'answering' && q.deadline && (
          <div className="mt-3 flex justify-center">
            <BigTimer deadline={q.deadline} duration={q.secondsPerQuestion * 1000} />
          </div>
        )}
      </Card>

      {q.phase === 'result' ? <Ranking /> : q.question ? <QuestionArea /> : <Idle />}

      <HostControls />
      {q.phase !== 'idle' && <Scores />}
    </div>
  );
}

/**
 * 参加者の表紙: 何問目・問題・答える所（答えの段では答えとみんなの回答、結果では優勝）だけを大きく出す。
 * 得点とチームの変更は「得点・チーム」から開く（リハーサルで画面が煩雑だったため）
 */
function GuestQuiz() {
  const { game } = useGame<PartyEventView>();
  const q = game.quiz;
  return (
    <div className="flex flex-col gap-3">
      <Card className="!py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-display text-2xl">
            {q.qno > 0 ? `第 ${q.qno} 問` : 'クイズ'}
            <span className="ml-1 text-base text-muted">/ {q.total}</span>
          </p>
          <span className="text-base font-bold text-hi-ink">{PHASE_LABEL[q.phase]}</span>
          {q.myTeam && (
            <span className="ml-auto" data-testid="my-team">
              <Badge className="bg-hi text-base text-on-hi">{q.myTeam}</Badge>
            </span>
          )}
        </div>
        {q.phase === 'answering' && q.deadline && (
          // 参加者は細い横長のタイマーにして、問題と答えを1画面目に収める
          <div className="mt-2">
            <TimerBar deadline={q.deadline} duration={q.secondsPerQuestion * 1000} />
          </div>
        )}
      </Card>

      {/* チームが無い人（名簿に無い人など）は、答えるためにチームを選ぶ必要があるので表紙に出す */}
      {!q.myTeam && q.phase !== 'result' && (
        <Card>
          <SectionTitle>チームを選んでください</SectionTitle>
          <TeamPicker />
        </Card>
      )}

      {q.phase === 'result' ? <Ranking /> : q.question ? <QuestionArea /> : <Idle />}

      <MoreRow>
        <MoreSheet label="得点・チーム" title="得点とチーム" testId="quiz-more" closeOn={q.position}>
          {(close) => (
            <div className="flex flex-col gap-4">
              {q.myTeam && <TeamChanger onPicked={close} />}
              {q.phase !== 'idle' ? <Scores /> : <p className="text-base text-muted">得点は、第1問が終わると出ます。</p>}
            </div>
          )}
        </MoreSheet>
      </MoreRow>
    </div>
  );
}

function Idle() {
  const { game } = useGame<PartyEventView>();
  return (
    <Card className="py-12 text-center">
      <Icon name="quiz" className="animate-float mx-auto !block h-14 w-14" />
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

  const final = q.qno === q.total && q.total > 1;
  return (
    <div className="flex flex-col gap-3">
      {(final || question.points > 1) && (
        // 最後の問題などで点数が高いことを、問題の前に大きく知らせる（逆転のチャンスで盛り上げる）
        <p className="ui-tile flex items-center justify-center gap-2 bg-hi px-4 py-2 font-display text-xl text-on-hi" data-testid="quiz-points">
          <Icon name="spark" />
          {final ? '最終問題' : `第 ${q.qno} 問`}
          {question.points > 1 && <span>この問題は {question.points} 点！</span>}
        </p>
      )}
      {/* 参加者の画面では上の見出しに「第 n 問」があるので、ここは「問題」とだけ書く */}
      <QuestionCard label={game.isHost ? `第 ${q.qno} 問` : '問題'} text={question.question} accent="#f59e0b" />

      {q.phase === 'answering' && !game.isHost && <AnswerArea />}

      {q.phase === 'answering' && game.isHost && (
        <Card>
          <SectionTitle>送信ずみ</SectionTitle>
          <div className="flex flex-wrap gap-1.5" data-testid="quiz-answered">
            {q.teams.map((t) => (
              <Badge
                key={t}
                className={q.answeredTeams.includes(t) ? 'bg-ok text-on-ok' : 'bg-panel text-muted'}
              >
                {q.answeredTeams.includes(t) ? '✓ ' : ''}
                {t}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {revealed && (
        // 地の模様が透けないよう、塗りつぶしたカードにする（「答え」の印で目立たせる）
        <Card className="animate-pop-in text-center">
          <Badge className="bg-ok text-on-ok">答え</Badge>
          <p className="mt-2 font-display text-3xl" data-testid="quiz-answer">
            {question.answer == null
              ? // 答えを書いていない問題は、司会が口頭で発表して ○ を付ける
                '司会から発表します'
              : question.choices && typeof question.answer === 'number'
                ? question.choices[question.answer]
                : String(question.answer)}
          </p>
          {question.note && <p className="mt-3 text-sm text-fg/80">{question.note}</p>}
          {myCorrect !== null && (
            <p className="mt-4 font-display text-xl" data-testid="quiz-my-result">
              {/* 正誤は色だけでなく、印と言葉で */}
              {myCorrect ? (
                <span className="ui-badge inline-flex items-center gap-2 bg-ok px-4 py-1 text-on-ok">
                  <Icon name="check" /> 正解！
                </span>
              ) : (
                <span className="ui-badge inline-flex items-center gap-2 bg-panel px-4 py-1">
                  <Icon name="close" /> ざんねん
                </span>
              )}
            </p>
          )}
        </Card>
      )}

      {revealed && !game.isHost && q.answers && <AllAnswers />}
    </div>
  );
}

/** 答えの段で、参加者にみんなの回答と正誤を見せる（回答タイム中はサーバーが送らない） */
function AllAnswers() {
  const { game } = useGame<PartyEventView>();
  const q = game.quiz;
  const rows = q.answers ?? [];
  return (
    <Card>
      <SectionTitle>みんなの回答</SectionTitle>
      {rows.length ? (
        <ul className="flex flex-col gap-1.5" data-testid="quiz-all-answers">
          {rows.map((a) => (
            <li key={a.team} className={`ui-tile flex items-center gap-2 px-3 py-2 ${a.team === q.myTeam ? 'bg-hi/40' : ''}`}>
              <span className="w-20 shrink-0 truncate text-sm font-extrabold text-muted">{a.team}</span>
              <span className="min-w-0 flex-1 truncate text-base font-bold">{a.text}</span>
              {/* 正誤は色だけでなく、印と言葉で */}
              {a.correct === true && (
                <span className="ui-badge inline-flex shrink-0 items-center gap-1 bg-ok px-2 py-0.5 text-sm font-extrabold text-on-ok">
                  <Icon name="check" /> 正解
                </span>
              )}
              {a.correct === false && (
                <span className="ui-badge inline-flex shrink-0 items-center gap-1 bg-panel px-2 py-0.5 text-sm font-extrabold">
                  <Icon name="close" /> 不正解
                </span>
              )}
              {a.correct === null && <span className="shrink-0 text-sm text-muted">採点中</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted" data-testid="quiz-all-answers">答えたチームはありませんでした</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 参加者                                                               */
/* ------------------------------------------------------------------ */
/** チームのボタン（押すとそのチームに入る） */
function TeamPicker({ onPicked }: { onPicked?: () => void }) {
  const { game, act } = useGame<PartyEventView>();
  const q = game.quiz;
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="quiz-team-pick">
      {q.teams.map((t) => (
        <Button
          key={t}
          size="lg"
          variant={t === q.myTeam ? 'success' : 'secondary'}
          onClick={async () => {
            if (await act('quiz:team', { team: t })) onPicked?.();
          }}
        >
          {t}
        </Button>
      ))}
    </div>
  );
}

/** 「得点・チーム」の中: いまのチームと、押し間違えたときの選び直し */
function TeamChanger({ onPicked }: { onPicked: () => void }) {
  const { game } = useGame<PartyEventView>();
  const [changing, setChanging] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base">
          あなたのチーム: <span className="font-extrabold">{game.quiz.myTeam}</span>
        </span>
        {!changing && (
          <button className="min-h-11 px-2 text-sm font-bold text-info-ink underline" onClick={() => setChanging(true)} data-testid="quiz-team-change">
            変える
          </button>
        )}
      </div>
      {changing && (
        <div className="mt-2">
          <TeamPicker onPicked={onPicked} />
        </div>
      )}
    </div>
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
      {q.myAnswer && <p className="mt-2 text-center text-xs text-ok-ink">送信ずみ: {q.myAnswer.text}</p>}
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
  const asking = question && (q.phase === 'question' || q.phase === 'answering');
  const preview =
    asking && question.answer != null
      ? question.choices && typeof question.answer === 'number'
        ? `${question.answer + 1}. ${question.choices[question.answer]}`
        : String(question.answer)
      : null;

  return (
    <HostPanel title="クイズの進行">
      <div className="flex flex-col gap-3">
        {preview && (
          <p className="ui-tile px-3 py-2 text-sm" data-testid="quiz-host-answer">
            <span className="mr-2 text-xs font-extrabold text-warn-ink">答え（司会だけに表示）</span>
            <span className="font-bold">{preview}</span>
          </p>
        )}
        {asking && question.answer == null && (
          // 答えが当日まで分からない問題など。締め切ったあと、司会が各チームの回答に ○ を付ける
          <p className="ui-tile px-3 py-2 text-sm" data-testid="quiz-host-answer">
            <span className="mr-2 text-xs font-extrabold text-warn-ink">答えは未設定</span>
            <span className="font-bold">締め切ったあと、正解のチームに ○ を付けてください</span>
          </p>
        )}
        <HostActionBar>
          <HostButton onClick={() => act('quiz:next', { at: q.position })} disabled={q.phase === 'result'} testId="quiz-next">
            {nextLabel} <Icon name="play" className="h-4 w-4" />
          </HostButton>
        </HostActionBar>
        <Button size="sm" variant="secondary" onClick={() => act('quiz:prev', { at: q.position })} disabled={q.phase === 'idle'}>
          ↩ 1つ戻す
        </Button>
        {q.answers && q.answers.length > 0 && <AnswerTable />}
        {q.phase !== 'idle' && (
          <ResetButton title="クイズを最初からやり直しますか？" onReset={() => act('quiz:reset')} testId="quiz-reset">
            第1問の前に戻り、これまでの回答と得点が消えます。各自が選んだチームはそのままです。
          </ResetButton>
        )}
      </div>
    </HostPanel>
  );
}

function AnswerTable() {
  const { game, act } = useGame<PartyEventView>();
  const q = game.quiz;
  // 自由回答と、答えを書いていない選択問題は、司会が ○ を付ける（サーバーは自動採点しない）
  const free = q.question?.hostGraded ?? !q.question?.choices;
  return (
    <div>
      <SectionTitle right={<span className="text-xs text-muted">{free ? '○ を付けてください' : '自動採点ずみ'}</span>}>
        各チームの回答
      </SectionTitle>
      <ul className="flex flex-col gap-1.5" data-testid="quiz-host-answers">
        {q.answers!.map((a) => (
          <li key={a.team} className="ui-tile flex items-center gap-2 px-3 py-2">
            <span className="w-20 shrink-0 truncate text-xs font-extrabold text-muted">{a.team}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{a.text}</span>
            {a.seconds != null && <span className="shrink-0 text-xs text-muted">{a.seconds}s</span>}
            {free ? (
              <div className="flex shrink-0 gap-1">
                <button
                  aria-label="正解にする"
                  aria-pressed={a.correct === true}
                  className={`h-11 w-11 rounded-lg text-lg font-extrabold ring-2 ring-line ${a.correct === true ? 'bg-ok text-on-ok' : 'bg-panel'}`}
                  onClick={() => act('quiz:grade', { qno: q.qno, team: a.team, correct: true })}
                >
                  ○
                </button>
                <button
                  aria-label="不正解にする"
                  aria-pressed={a.correct === false}
                  className={`h-11 w-11 rounded-lg text-lg font-extrabold ring-2 ring-line ${a.correct === false ? 'bg-danger text-on-danger' : 'bg-panel'}`}
                  onClick={() => act('quiz:grade', { qno: q.qno, team: a.team, correct: false })}
                >
                  ×
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-lg font-black" aria-label={a.correct === true ? '正解' : a.correct === false ? '不正解' : undefined}>
                {a.correct === true ? '○' : a.correct === false ? '×' : ''}
              </span>
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
            className={`ui-tile flex items-center gap-3 px-3 py-2 ${r.team === q.myTeam ? 'bg-hi' : ''}`}
          >
            <span className="font-display text-lg">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{r.team}</span>
            <span className="font-display text-xl">
              {r.score}
              <span className="ml-0.5 text-sm">点</span>
            </span>
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
    <Card className="animate-pop-in bg-hi/40 py-10 text-center">
      <Icon name="trophy" className="mx-auto !block h-16 w-16" />
      <p className="mt-3 text-sm text-muted">{winners.length > 1 ? '同点優勝' : '優勝'}</p>
      <p className="font-display text-4xl" data-testid="quiz-winner">
        {winners.length ? winners.map((r) => r.team).join('・') : '—'}
      </p>
      <p className="mt-2 font-display text-xl">{winners[0]?.score ?? 0} 点</p>
    </Card>
  );
}
