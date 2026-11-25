import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EventSection, PartyEventView } from '../../../shared/games/views';
import { Button, Card, Modal } from '../../components/ui';
import { SEAT } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { HostUrl } from '../../pages/Lobby';
import { useGame, useRoomContext } from '../RoomContext';
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
          <Invite />
        </Card>
      )}

      {game.section === 'none' && <Waiting isHost={game.isHost} />}
      {game.section === 'quiz' && <QuizSection />}
      {game.section === 'seats' && <SeatsSection />}
      {game.section === 'bingo' && <BingoSection />}
    </div>
  );
}

/**
 * 遅れて来た人に見せる参加用のQR・URLと、ほかの司会に渡す司会用URL。
 * 始めるとロビー（招待の欄）が消えるので、司会の画面から出せるようにしておく
 */
function Invite() {
  const { room } = useRoomContext();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const url = `${location.origin}/room/${room.code}`;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#0f0c24', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [open, url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('参加用URLをコピーしました', 'success');
    } catch {
      toast('コピーできませんでした。長押しで選択してください', 'error');
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" block className="mt-3" onClick={() => setOpen(true)} data-testid="event-invite-open">
        📱 参加用のQR・URL（遅れて来た人に）
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col items-center gap-3 text-center" data-testid="event-invite">
          <h2 className="font-display text-xl">スマホで読み取って参加</h2>
          {qr ? (
            <img src={qr} alt="参加用QRコード" className="w-72 max-w-full rounded-2xl bg-white p-2" />
          ) : (
            <div className="h-72 w-72 max-w-full rounded-2xl bg-white/10" />
          )}
          <p className="font-display text-3xl tracking-[0.15em]">{room.code}</p>
          <div className="flex w-full items-center gap-2 rounded-xl bg-black/30 p-1.5 pl-3 ring-1 ring-line">
            <span className="min-w-0 flex-1 truncate text-left text-xs font-bold text-white/80" data-testid="event-invite-url">
              {url}
            </span>
            <Button size="sm" variant="white" onClick={copy}>
              コピー
            </Button>
          </div>
        </div>
        <HostUrl />
        <Button variant="secondary" block className="mt-4" onClick={() => setOpen(false)}>
          閉じる
        </Button>
      </Modal>
    </>
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

/**
 * 司会の進行ボタンを画面の下に固定する帯。
 * スマホで司会をすると、進行のボタンが最初の1画面に収まらず、押すたびにスクロールが要るため。
 * body 直下に出す（登場アニメーションの付いた枠の中だと、fixed がその枠基準になる）
 */
export function HostActionBar({ children }: { children: React.ReactNode }) {
  // デモの枠（iframe）の中では固定しない。枠の下端がブラウザの画面の外に出ていて、固定すると見えなくなるため
  if (SEAT) return <>{children}</>;
  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-amber-400/30 bg-ink/90 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg"
      data-testid="host-action-bar"
    >
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>,
    document.body,
  );
}

/** 取り返しにくい操作の前に、1回確かめる */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  testId,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
  testId?: string;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-2 text-sm text-white/80">{children}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" onClick={onClose}>
          やめる
        </Button>
        <Button
          variant="danger"
          size="lg"
          data-testid={testId}
          onClick={async () => {
            onClose();
            await onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * 各企画の「最初からやり直す」。試しに進めたあと、本番の前に戻せるように。
 * 押し間違えると進行が消えるので、小さく置いて、必ず確かめる
 */
export function ResetButton({
  title,
  children,
  onReset,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  onReset: () => void | Promise<unknown>;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="mt-2 self-center px-3 py-2 text-xs font-bold text-rose-300/80 underline underline-offset-4 hover:text-rose-200"
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        最初からやり直す
      </button>
      <ConfirmModal
        open={open}
        title={title}
        confirmLabel="やり直す"
        onConfirm={onReset}
        onClose={() => setOpen(false)}
        testId={`${testId}-confirm`}
      >
        {children}
      </ConfirmModal>
    </>
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
