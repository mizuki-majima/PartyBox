import { useState } from 'react';
import type { Statement } from '../../shared/games/views';
import { useRoomContext } from '../games/RoomContext';
import { BigTimer, useAutoSubmit } from './game';
import { Avatar, Button, TextInput } from './ui';

/** 発言の順番（現在の人をハイライト） */
export function TurnOrder({ order, index, labelOf }: { order: string[]; index: number; labelOf?: (id: string) => string | null }) {
  const { nameOf, colorOf } = useRoomContext();
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {order.map((id, i) => {
        const state = i < index ? 'done' : i === index ? 'now' : 'next';
        return (
          <div
            key={id}
            className={`flex shrink-0 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-bold transition ${
              state === 'now' ? 'bg-white text-ink shadow-lg' : state === 'done' ? 'bg-white/5 text-white/40' : 'bg-white/8 text-white/80'
            }`}
          >
            <Avatar name={nameOf(id)} color={colorOf(id)} size="xs" dim={state === 'done'} />
            <span>{nameOf(id)}</span>
            {labelOf?.(id) && <span className="text-[10px] opacity-70">{labelOf(id)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** 今しゃべっている人の表示と、自分の番のときの入力欄 */
export function SpeakerPanel({
  speakerId,
  deadline,
  duration,
  hint,
  roleLabel,
  onSpeak,
  maxLength,
}: {
  speakerId: string | null;
  deadline: number | null;
  duration: number | null;
  hint: string;
  roleLabel?: string | null;
  onSpeak: (text: string) => Promise<boolean>;
  maxLength: number;
}) {
  const { room, nameOf, colorOf } = useRoomContext();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const isMe = speakerId === room.youId;

  const send = async () => {
    setSending(true);
    await onSpeak(text.trim());
    setSending(false);
    setText('');
  };
  // 時間切れ直前に入力途中の発言を送る
  useAutoSubmit(deadline, isMe && text.trim().length > 0, () => void onSpeak(text.trim()), 400);

  if (!speakerId) return null;
  return (
    <div
      className={`animate-pop-in flex flex-col items-center gap-4 rounded-3xl p-5 text-center ring-2 ${isMe ? 'bg-gradient-to-b from-pop-pink/25 to-pop-orange/10 ring-pop-pink/60' : 'bg-panel ring-line'}`}
    >
      <div className="flex items-center gap-4">
        <Avatar name={nameOf(speakerId)} color={colorOf(speakerId)} size="lg" ring={isMe} />
        <div className="text-left">
          {roleLabel && <p className="text-xs font-extrabold text-pop-yellow">{roleLabel}</p>}
          <p className="font-display text-2xl" data-testid="speaker">
            {isMe ? 'あなたの番です！' : `${nameOf(speakerId)}さんの番`}
          </p>
          {!isMe && <p className="text-sm text-muted">話を聞こう 👂</p>}
        </div>
        <BigTimer deadline={deadline} duration={duration} />
      </div>
      {isMe && (
        <div className="flex w-full flex-col gap-3">
          <p className="text-sm font-bold text-white/85">{hint}</p>
          <TextInput
            value={text}
            onChange={setText}
            onEnter={send}
            maxLength={maxLength}
            placeholder="発言を入力（通話で話すだけでもOK）"
            autoFocus
            enterKeyHint="send"
            data-testid="speak-input"
          />
          <Button size="lg" block onClick={send} loading={sending} data-testid="speak-submit">
            {text.trim() ? '発言して次の人へ' : '話し終わった！次の人へ'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** これまでの発言ログ */
export function StatementLog({ statements, labelOf, title = 'みんなの発言' }: { statements: Statement[]; labelOf?: (id: string) => string | null; title?: string }) {
  const { nameOf, colorOf } = useRoomContext();
  if (statements.length === 0) return null;
  return (
    <div className="rounded-3xl bg-white/4 p-4 ring-1 ring-line">
      <p className="mb-2 text-xs font-extrabold tracking-[0.2em] text-muted">{title}</p>
      <ul className="space-y-2">
        {statements.map((s, i) => (
          <li key={i} className="animate-slide-up flex items-start gap-2">
            <Avatar name={nameOf(s.playerId)} color={colorOf(s.playerId)} size="sm" />
            <div className="min-w-0 rounded-2xl rounded-tl-sm bg-white/10 px-3 py-2">
              <p className="text-[11px] font-bold text-muted">
                {nameOf(s.playerId)}
                {labelOf?.(s.playerId) && <span className="ml-1 text-pop-yellow">{labelOf(s.playerId)}</span>}
              </p>
              <p className="font-bold break-all">{s.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
