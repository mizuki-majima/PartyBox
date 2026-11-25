import { useEffect, useState } from 'react';
import { getGameMeta, isEventGame } from '../../shared/games';
import { TimerBar } from '../components/game';
import { GameEmblem, Icon } from '../components/Icon';
import { Button, Modal } from '../components/ui';
import { GameGuide } from '../guides';
import { request } from '../lib/socket';
import { themeOfGame, useTheme } from '../themes';
import { GAME_SCREENS } from './registry';
import { useRoomContext } from './RoomContext';

/** ゲーム中の共通フレーム（ゲーム名・ラウンド・タイマー・観戦表示） */
export function GameShell() {
  const { room } = useRoomContext();
  const game = room.game;
  const meta = getGameMeta(room.gameId)!;
  const phaseKey = game ? `${game.phase}-${game.round}` : '';
  // ゲーム中は、ページ全体をそのゲームのデザインにする。ロビーに戻る・退出すると共通画面のデザインに戻る
  useTheme(themeOfGame(room.gameId));
  // フェーズが変わったら画面の先頭へ（前の画面のスクロール位置を引き継がない）
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phaseKey]);
  if (!game) return null;
  const Screen = GAME_SCREENS[game.gameId];
  const showRound = game.phase !== 'START' && game.phase !== 'GAME_OVER' && game.round > 0;
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="ui-bar sticky top-0 z-10 -mx-3 flex flex-col gap-2 px-3 py-2 sm:mx-0 sm:px-4" data-edge="top">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <GameEmblem id={meta.id} className="h-8 w-10" />
            <span className="truncate font-extrabold">{meta.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showRound && (
              <span className="ui-badge shrink-0 bg-fg px-3 py-1 font-display text-sm text-bg" data-testid="round">
                {game.gameId === 'grow-answer' ? 'STEP' : 'ROUND'} {game.round}/{game.totalRounds}
              </span>
            )}
            {/* ルールを忘れても、いつでも見返せるように（開いている間もゲームは止まらない） */}
            <button
              onClick={() => setGuideOpen(true)}
              className="ui-tile inline-flex min-h-11 shrink-0 items-center gap-1 px-3 text-sm font-extrabold"
              data-testid="guide-open"
            >
              <Icon name="help" /> 遊び方
            </button>
          </div>
        </div>
        <Modal open={guideOpen} onClose={() => setGuideOpen(false)}>
          <h2 className="mb-4 font-display text-xl">{meta.title}の遊び方</h2>
          <GameGuide gameId={meta.id} isHost={room.youAreHost} />
          <Button variant="secondary" block size="lg" className="mt-6" onClick={() => setGuideOpen(false)} data-testid="guide-close">
            とじる
          </Button>
        </Modal>
        <TimerBar deadline={game.deadline} duration={game.duration} />
      </div>

      {game.me === null && (
        <div className="ui-tile px-4 py-3 text-center text-sm font-bold text-info-ink">
          <Icon name="eye" className="mr-1 inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
          観戦中です。次のゲームから参加できます。
        </div>
      )}

      <div key={`${game.phase}-${game.round}`} className="animate-slide-up">
        {Screen ? <Screen /> : <p>このゲームは準備中です</p>}
      </div>

      {/* 懇親会はロビーに戻すと進行が全部消えるので出さない（各企画に「最初からやり直す」がある） */}
      {game.phase !== 'GAME_OVER' && !isEventGame(room.gameId) && <AbortGame />}
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
      <button className="min-h-11 px-3 text-xs font-bold text-muted underline underline-offset-4 hover:text-fg" onClick={() => setOpen(true)}>
        ゲームを中断してロビーに戻る
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
