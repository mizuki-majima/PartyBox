import { useState } from 'react';
import { Link } from 'react-router';
import { clearTeamPlay, getTeamPlay } from '../lib/eventReturn';
import { Icon } from './Icon';
import { Button } from './ui';

/**
 * 「このチームでゲームを遊ぶ」で懇親会の画面から来たときの帯。どのチームとして遊んでいるかと、
 * 懇親会の画面に戻る入口を出す（トップ・ゲームのルームの上）。label はルームに付いたチーム名（ルームの中だけ）
 */
export function TeamPlayBar({ label = null }: { label?: string | null }) {
  const [play, setPlay] = useState(getTeamPlay);
  const team = label ?? play?.team ?? null;
  if (!team && !play) return null;
  return (
    <div className="mx-auto max-w-5xl px-3 pb-3 sm:px-6" data-testid="team-play-banner">
      <div className="ui-tile flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="text-base font-bold">
          {label ? (
            <span data-testid="room-label">{label} のルームです（勝者の記録にチーム名が付きます）</span>
          ) : (
            <>{team} で遊ぶゲームを選んでください</>
          )}
        </p>
        <div className="flex items-center gap-3">
          {play && (
            <Link to={`/room/${play.eventCode}`} data-testid="back-to-event">
              <Button size="sm" variant="secondary">
                <Icon name="undo" /> 懇親会の画面に戻る
              </Button>
            </Link>
          )}
          {!label && play && (
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
