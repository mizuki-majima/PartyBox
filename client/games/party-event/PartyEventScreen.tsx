import type { EventSection, PartyEventView } from '../../../shared/games/views';
import { Button, Card } from '../../components/ui';
import { useGame } from '../RoomContext';
import { BingoSection } from './BingoSection';
import { QuizSection } from './QuizSection';
import { SeatsSection } from './SeatsSection';

const SECTIONS: { id: EventSection; emoji: string; label: string }[] = [
  { id: 'quiz', emoji: '📝', label: 'クイズ' },
  { id: 'seats', emoji: '🪑', label: '座席決め' },
  { id: 'bingo', emoji: '🎱', label: 'ビンゴ' },
];

/**
 * 懇親会の画面。司会が出している企画だけが全員に見える。
 * 司会は上の切り替えでいつでも行き来でき、どの企画の状態も消えない。
 */
export function PartyEventScreen() {
  const { game, act } = useGame<PartyEventView>();

  return (
    <div className="flex flex-col gap-4">
      {game.isHost && (
        <Card className="!p-3">
          <div className="grid grid-cols-4 gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => act('event:section', { section: s.id })}
                data-testid={`section-${s.id}`}
                className={`rounded-2xl px-2 py-3 text-sm font-extrabold transition ${
                  game.section === s.id ? 'bg-white text-ink' : 'bg-white/8 text-white/80 hover:bg-white/12'
                }`}
              >
                <span className="block text-xl">{s.emoji}</span>
                {s.label}
              </button>
            ))}
            <button
              onClick={() => act('event:section', { section: 'none' })}
              data-testid="section-none"
              className={`rounded-2xl px-2 py-3 text-sm font-extrabold transition ${
                game.section === 'none' ? 'bg-white text-ink' : 'bg-white/8 text-white/80 hover:bg-white/12'
              }`}
            >
              <span className="block text-xl">⏸</span>
              待機
            </button>
          </div>
          <p className="mt-2 text-center text-xs font-bold text-muted">
            👑 司会の画面です。ここでの操作が参加者全員の画面に出ます
          </p>
        </Card>
      )}

      {game.section === 'none' && <Waiting isHost={game.isHost} />}
      {game.section === 'quiz' && <QuizSection />}
      {game.section === 'seats' && <SeatsSection />}
      {game.section === 'bingo' && <BingoSection />}
    </div>
  );
}

function Waiting({ isHost }: { isHost: boolean }) {
  return (
    <Card className="py-14 text-center">
      <div className="animate-float text-6xl">🎊</div>
      <h2 className="mt-4 font-display text-2xl">
        {isHost ? '上から企画を選んでください' : 'もうすぐ始まります'}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {isHost ? '選んだ企画が参加者全員の画面に出ます。' : 'この画面のまま、司会の合図をお待ちください。'}
      </p>
    </Card>
  );
}

/** 各企画で使う、司会だけに出す操作のまとまり */
export function HostPanel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Card className="border border-amber-400/30 bg-amber-400/5">
      <p className="mb-3 text-xs font-extrabold tracking-[0.2em] text-amber-200 uppercase">👑 {title}</p>
      {children}
    </Card>
  );
}

/** 司会の進行ボタン（横いっぱいで押しやすく） */
export function HostButton({
  onClick,
  children,
  variant = 'primary',
  disabled,
  testId,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Button size="lg" block variant={variant} onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </Button>
  );
}
