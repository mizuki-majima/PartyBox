import { useState } from 'react';
import { Link } from 'react-router';
import { clearTeamPlay, getLastEventRoom, getTeamPlay } from '../lib/eventReturn';
import { Icon } from './Icon';
import { Button } from './ui';

/**
 * 懇親会から通常のゲームへ来たときの帯（トップ・ゲームのルームの上）。
 * どのチームとして遊んでいるかと、「懇親会の画面に戻る」を出す。
 * inRoom はゲームのルームの中（label はそのルームに付いたチーム名）。トップでは「このチームでゲームを遊ぶ」で選んだチームを出す
 */
export function TeamPlayBar({ inRoom = false, label = null }: { inRoom?: boolean; label?: string | null }) {
  const [play, setPlay] = useState(getTeamPlay);
  const back = play?.eventCode ?? getLastEventRoom();
  const text = inRoom
    ? label
      ? `${label} のルームです（勝者の記録にチーム名が付きます）`
      : null
    : play
      ? `${play.team} で遊ぶゲームを選んでください`
      : null;
  if (!text && !back) return null;
  return (
    <div className="mx-auto max-w-5xl px-3 pb-3 sm:px-6" data-testid="team-play-banner">
      <div className="ui-tile flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        {text && (
          <p className="text-base font-bold" data-testid={inRoom ? 'room-label' : undefined}>
            {text}
          </p>
        )}
        <div className="ml-auto flex items-center gap-3">
          {back && (
            <Link to={`/room/${back}`} data-testid="back-to-event">
              <Button size="sm" variant="secondary">
                <Icon name="undo" /> 懇親会の画面に戻る
              </Button>
            </Link>
          )}
          {!inRoom && play && (
            <button
              className="min-h-11 text-sm font-bold text-muted underline underline-offset-4"
              onClick={() => {
                clearTeamPlay();
                setPlay(null);
              }}
              data-testid="team-play-clear"
            >
              チームで遊ぶのをやめる
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
