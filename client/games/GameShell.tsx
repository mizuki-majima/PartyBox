import { useEffect, useState } from 'react';
import { getGameMeta } from '../../shared/games';
import { TimerBar } from '../components/game';
import { Button, Modal } from '../components/ui';
import { request } from '../lib/socket';
import { GAME_SCREENS } from './registry';
import { useRoomContext } from './RoomContext';

/** ゲーム中の共通フレーム（ゲーム名・ラウンド・タイマー・観戦表示） */
export function GameShell() {
  const { room } = useRoomContext();
  const game = room.game;
  const meta = getGameMeta(room.gameId)!;
  const phaseKey = game ? `${game.phase}-${game.round}` : '';
  // フェーズが変わったら画面の先頭へ（前の画面のスクロール位置を引き継がない）
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phaseKey]);
  if (!game) return null;
  const Screen = GAME_SCREENS[game.gameId];
  const showRound = game.phase !== 'START' && game.phase !== 'GAME_OVER' && game.round > 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-3 flex flex-col gap-2 bg-ink/80 px-3 py-2 backdrop-blur-lg sm:mx-0 sm:rounded-2xl sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg"
              style={{ background: `linear-gradient(135deg, ${meta.theme.from}, ${meta.theme.to})` }}
            >
              {meta.emoji}
            </span>
            <span className="truncate font-extrabold">{meta.title}</span>
          </div>
          {showRound && (
            <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 font-display text-sm" data-testid="round">
              {game.gameId === 'grow-answer' ? 'STEP' : 'ROUND'} {game.round}/{game.totalRounds}
            </span>
          )}
        </div>
        <TimerBar deadline={game.deadline} duration={game.duration} />
      </div>

      {game.me === null && (
        <div className="rounded-2xl bg-sky-400/15 px-4 py-3 text-center text-sm font-bold text-sky-200 ring-1 ring-sky-300/30">
          👀 観戦中です。次のゲームから参加できます。
        </div>
      )}

      <div key={`${game.phase}-${game.round}`} className="animate-slide-up">
        {Screen ? <Screen /> : <p>このゲームは準備中です</p>}
      </div>

      {game.phase !== 'GAME_OVER' && <AbortGame />}
    </div>
  );
}

/** ホストがゲームを途中で終了してロビーに戻る */
function AbortGame() {
  const { isHost } = useRoomContext();
  const [open, setOpen] = useState(false);
  if (!isHost) return null;
  return (
    <div className="pt-6 text-center">
      <button className="text-xs font-bold text-muted/70 hover:text-white" onClick={() => setOpen(true)}>
        ⏹ ゲームを中断してロビーに戻る
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <h2 className="font-display text-xl">ゲームを中断しますか？</h2>
        <p className="mt-2 text-sm text-muted">全員がロビーに戻ります。得点はリセットされます。</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setOpen(false)}>
            続ける
          </Button>
          <Button
            variant="danger"
            size="lg"
            onClick={async () => {
              await request('room:backToLobby', {});
              setOpen(false);
            }}
          >
            中断する
          </Button>
        </div>
      </Modal>
    </div>
  );
}
