import { useState } from 'react';
import type { GateView } from '../../shared/protocol';
import { useRoomContext } from '../games/RoomContext';
import { useRemaining } from '../lib/clock';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';
import { Icon } from './Icon';
import { Avatar, Button, Modal } from './ui';

/**
 * 準備の関門（ゲーム開始・説明を読む画面・2ラウンド目からの頭）。サーバーの BaseGame.openGate と対になる。
 *
 * - 全員（切れている人を除く）が「準備OK」を押すと、自動で 3・2・1 のカウントダウンに入り、終わると進む
 * - カウントダウン中は、ホストが「止める」で戻せる（全員の準備OKが取り消される）
 * - 待っている間、ホストは「待たずに始める／進む」「ロビーに戻る」、2ラウンド目からは「ここで終了」を押せる
 */
export function ReadyGate({ readyLabel = '準備OK', skipLabel = '待たずに進む' }: { readyLabel?: string; skipLabel?: string }) {
  const { room, isHost, act, nameOf, colorOf } = useRoomContext();
  const game = room.game;
  const gate = (game?.gate ?? null) as GateView | null;
  const remaining = useRemaining(gate?.counting ? (game?.deadline ?? null) : null);
  const [confirm, setConfirm] = useState<'lobby' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!game || !gate) return null;

  const readySet = new Set(gate.ready);
  // 待つ相手は、つながっていて抜けていない参加者（サーバーと同じ）
  const targets = game.players.filter((p) => !p.left && p.connected).map((p) => p.id);
  const done = targets.filter((id) => readySet.has(id)).length;
  const mineReady = game.me != null && readySet.has(game.me);
  const sec = remaining == null ? null : Math.max(1, Math.ceil(remaining / 1000));
  const finishedRounds = Math.max(0, game.round - 1);

  const backToLobby = async () => {
    setBusy(true);
    const res = await request('room:backToLobby', {});
    setBusy(false);
    setConfirm(null);
    if (!res.ok) toast(res.error, 'error');
  };
  const endHere = async () => {
    setBusy(true);
    await act('gate:end');
    setBusy(false);
    setConfirm(null);
  };

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4 self-center" data-testid="ready-gate">
      {gate.counting ? (
        <>
          <p className="text-sm font-extrabold text-muted">全員そろいました。まもなく始まります</p>
          {sec != null && (
            <p key={sec} className="animate-pop-in font-display text-6xl text-ok-ink" data-testid="gate-count">
              {sec}
            </p>
          )}
          {isHost && (
            <Button size="lg" variant="secondary" onClick={() => void act('gate:stop')} data-testid="gate-stop">
              <Icon name="close" /> 止める（ホスト）
            </Button>
          )}
        </>
      ) : (
        <>
          {game.me != null && (
            <Button
              size="xl"
              block
              onClick={() => void act('ready')}
              disabled={mineReady}
              variant={mineReady ? 'secondary' : 'primary'}
              data-testid="gate-ready"
            >
              {mineReady ? `✓ ${readyLabel}` : readyLabel}
            </Button>
          )}
          <div className="ui-tile w-full p-4 text-center" data-testid="gate-status">
            <p className="text-sm font-bold">
              {readyLabel} <span className="font-display text-ok-ink">{done}</span> / {targets.length}人
            </p>
            <p className="mt-1 text-sm text-muted">全員が「{readyLabel}」を押すと、3・2・1 で始まります</p>
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              {targets.map((id) => (
                <div key={id} className="flex w-14 flex-col items-center gap-1">
                  <Avatar name={nameOf(id)} color={colorOf(id)} dim={!readySet.has(id)} />
                  <span className="w-full truncate text-xs">{nameOf(id)}</span>
                </div>
              ))}
            </div>
          </div>
          {isHost && (
            <div className="flex flex-wrap items-center justify-center gap-x-4">
              <button className="min-h-11 px-2 text-xs font-bold text-muted underline underline-offset-4 hover:text-fg" onClick={() => void act('skip')} data-testid="gate-skip">
                {skipLabel}（ホスト）
              </button>
              <button className="min-h-11 px-2 text-xs font-bold text-muted underline underline-offset-4 hover:text-fg" onClick={() => setConfirm('lobby')} data-testid="gate-lobby">
                ロビーに戻る
              </button>
              {gate.canEnd && (
                <button className="min-h-11 px-2 text-xs font-bold text-muted underline underline-offset-4 hover:text-fg" onClick={() => setConfirm('end')} data-testid="gate-end">
                  ここで終了
                </button>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={confirm === 'lobby'} onClose={() => setConfirm(null)}>
        <h2 className="font-display text-xl">ロビーに戻りますか？</h2>
        <p className="mt-2 text-sm text-fg/80">このゲームは終わり、結果は残りません。ロビーで別のゲームを選べます。</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setConfirm(null)}>
            やめる
          </Button>
          <Button size="lg" onClick={() => void backToLobby()} loading={busy} data-testid="gate-lobby-confirm">
            ロビーに戻る
          </Button>
        </div>
      </Modal>
      <Modal open={confirm === 'end'} onClose={() => setConfirm(null)}>
        <h2 className="font-display text-xl">ここで終了しますか？</h2>
        <p className="mt-2 text-sm text-fg/80">
          ここまでの {finishedRounds} ラウンドの点で最終結果を出し、勝者の記録に残します。
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setConfirm(null)}>
            やめる
          </Button>
          <Button size="lg" onClick={() => void endHere()} loading={busy} data-testid="gate-end-confirm">
            ここで終了
          </Button>
        </div>
      </Modal>
    </div>
  );
}
