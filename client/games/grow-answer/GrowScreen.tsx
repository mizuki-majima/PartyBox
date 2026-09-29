import { useRef, useState } from 'react';
import { getGameMeta } from '../../../shared/games';
import type { GrowAlbum, GrowEntry, GrowView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import { GameOverPanel, HostSkip, PhaseHeader, StartSplash, SubmissionStatus, useAutoSubmit } from '../../components/game';
import { Avatar, Button, TextInput } from '../../components/ui';
import { useGame } from '../RoomContext';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';

const meta = getGameMeta('grow-answer')!;

export function GrowScreen() {
  const { game } = useGame<GrowView>();
  switch (game.phase) {
    case 'START':
      return <StartSplash meta={meta} />;
    case 'WRITE':
    case 'DRAW':
    case 'DESCRIBE':
      return <WorkPhase />;
    case 'ALBUM':
      return <AlbumPhase />;
    case 'GAME_OVER':
      return <GameOver />;
  }
}

/* ------------------------------------------------------------------ */
function WorkPhase() {
  const { game } = useGame<GrowView>();
  const targets = game.players.filter((p) => !p.left).map((p) => p.id);
  const task = game.task;
  const status = <SubmissionStatus targets={targets} done={game.submitted} label="提出" />;

  if (!task || game.mySubmitted) {
    return (
      <div className="flex flex-col gap-5">
        <PhaseHeader emoji="⏳" title={task ? 'ナイス！みんなを待っています' : 'みんなが作業中です'} sub="全員がそろうと次のステップへ進みます" />
        {status}
        <HostSkip label="締め切って次へ" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {task.kind === 'write' && <WriteTask />}
      {task.kind === 'draw' && <DrawTask />}
      {task.kind === 'describe' && <DescribeTask />}
      {status}
      <HostSkip label="締め切って次へ" />
    </div>
  );
}

function SourceView({ entry }: { entry: GrowEntry }) {
  const { nameOf } = useGame<GrowView>();
  if (entry.kind === 'drawing' && entry.imageUrl) {
    return (
      <div className="animate-pop-in overflow-hidden rounded-2xl bg-white shadow-2xl">
        <img src={entry.imageUrl} alt="前の人の絵" className="block aspect-[4/3] w-full object-contain" data-testid="source-image" />
      </div>
    );
  }
  return (
    <div className="animate-pop-in rounded-3xl bg-white px-5 py-6 text-center text-ink shadow-2xl">
      <p className="text-xs font-extrabold tracking-[0.25em] text-emerald-600">
        {entry.kind === 'prompt' ? (entry.playerId ? `${nameOf(entry.playerId)}さんのお題` : 'お題') : '前の人の説明'}
      </p>
      <p className="mt-1 font-display text-3xl break-all" data-testid="source-text">
        {entry.text}
      </p>
    </div>
  );
}

function TextTask({ placeholder, maxLength }: { placeholder: string; maxLength: number }) {
  const { game, act } = useGame<GrowView>();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    await act('submitText', { text: text.trim() });
    setSending(false);
  };
  useAutoSubmit(game.deadline, text.trim().length > 0, () => void act('submitText', { text: text.trim() }), 900);
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex-1">
        <TextInput value={text} onChange={setText} onEnter={send} maxLength={maxLength} placeholder={placeholder} autoFocus enterKeyHint="send" data-testid="grow-text" />
      </div>
      <Button size="lg" onClick={send} loading={sending} disabled={!text.trim()} data-testid="grow-text-submit">
        決定！
      </Button>
    </div>
  );
}

function WriteTask() {
  return (
    <>
      <PhaseHeader emoji="✍️" title="最初のお題を書こう" sub="次の人がこのお題を絵にします。ちょっと難しいくらいが面白い！" />
      <TextTask placeholder="例：宇宙で焼き芋を売るロボット" maxLength={LIMITS.promptLength} />
    </>
  );
}

function DrawTask() {
  const { game, act } = useGame<GrowView>();
  const canvas = useRef<DrawingCanvasHandle>(null);
  const [sending, setSending] = useState(false);
  const source = game.task!.source;
  const submit = async () => {
    if (!canvas.current) return;
    setSending(true);
    await act('submitDrawing', { dataUrl: canvas.current.toDataURL() });
    setSending(false);
  };
  // 締切直前に自動提出（何か描いていれば）
  useAutoSubmit(game.deadline, true, () => {
    if (canvas.current && !canvas.current.isEmpty()) void submit();
  }, 1500);

  return (
    <>
      <PhaseHeader
        emoji="🎨"
        title={source?.kind === 'drawing' ? 'この絵を描き直そう！' : 'これを絵にしよう！'}
        sub={source?.kind === 'drawing' ? '前の人の説明がなかったので、絵をもとに描いてください' : '文字は書かずに、絵だけで伝えよう'}
      />
      {source && (source.kind === 'drawing' ? <div className="mx-auto w-1/2"><SourceView entry={source} /></div> : <SourceView entry={source} />)}
      <DrawingCanvas ref={canvas} />
      <Button size="xl" block onClick={submit} loading={sending} data-testid="drawing-submit">
        🖌 完成！
      </Button>
    </>
  );
}

function DescribeTask() {
  const { game } = useGame<GrowView>();
  const source = game.task!.source;
  return (
    <>
      <PhaseHeader
        emoji="🔍"
        title={source?.kind === 'drawing' ? 'この絵は何？' : 'この文章を言い換えよう'}
        sub={source?.kind === 'drawing' ? '見たままを文章で説明しよう。次の人がそれを絵にします' : '前の人の絵がなかったので、別の言葉で説明してください'}
      />
      {source && <SourceView entry={source} />}
      <TextTask placeholder="例：屋根の上で踊るペンギン" maxLength={LIMITS.answerLength} />
    </>
  );
}

/* ------------------------------------------------------------------ */
function AlbumEntry({ entry, index }: { entry: GrowEntry; index: number }) {
  const { nameOf, colorOf } = useGame<GrowView>();
  const label =
    entry.kind === 'prompt'
      ? entry.playerId
        ? `${nameOf(entry.playerId)}さんのお題`
        : '最初のお題'
      : entry.kind === 'drawing'
        ? `${nameOf(entry.playerId)}さんの絵`
        : `${nameOf(entry.playerId)}さんの説明`;
  return (
    <li className="animate-slide-up flex flex-col gap-2" style={{ animationDelay: `${index * 700}ms` }} data-testid="album-entry">
      <div className="flex items-center gap-2">
        {entry.playerId ? <Avatar name={nameOf(entry.playerId)} color={colorOf(entry.playerId)} size="sm" /> : <span className="text-2xl">🎁</span>}
        <span className="text-sm font-extrabold text-white/80">{label}</span>
      </div>
      {entry.empty ? (
        <div className="rounded-2xl border-2 border-dashed border-white/15 p-6 text-center text-muted">（時間切れ…）</div>
      ) : entry.kind === 'drawing' ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <img src={entry.imageUrl!} alt={label} className="block aspect-[4/3] w-full object-contain" loading="lazy" />
        </div>
      ) : (
        <div className={`rounded-2xl px-5 py-4 font-display text-2xl break-all shadow-xl ${entry.kind === 'prompt' ? 'bg-white text-ink' : 'bg-pop-yellow text-ink'}`}>
          {entry.text}
        </div>
      )}
    </li>
  );
}

function Album({ album, animate = true }: { album: GrowAlbum; animate?: boolean }) {
  const { nameOf } = useGame<GrowView>();
  const first = album.entries[0];
  const last = [...album.entries].reverse().find((e) => !e.empty && e.kind !== 'prompt');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-display text-xl">{nameOf(album.ownerId)}さんのアルバム</p>
      <ol className="flex flex-col gap-5">
        {album.entries.map((e, i) => (
          <AlbumEntry key={i} entry={e} index={animate ? i : 0} />
        ))}
      </ol>
      {first && last && (
        <div
          className="animate-slide-up rounded-3xl bg-gradient-to-r from-emerald-500 to-yellow-500 p-5 text-center shadow-2xl"
          style={{ animationDelay: `${animate ? album.entries.length * 700 : 0}ms` }}
        >
          <p className="text-sm font-extrabold text-white/90">最初と最後をくらべると…</p>
          <p className="mt-1 font-display text-xl break-all">「{first.text}」</p>
          <p className="text-2xl">⬇</p>
          {last.kind === 'drawing' ? (
            <img src={last.imageUrl!} alt="最後の絵" className="mx-auto w-1/2 rounded-xl bg-white" />
          ) : (
            <p className="font-display text-2xl break-all">「{last.text}」</p>
          )}
        </div>
      )}
    </div>
  );
}

function AlbumPhase() {
  const { game, isHost, act } = useGame<GrowView>();
  const album = game.albums?.[game.albumIndex];
  const isLast = game.albumIndex >= game.albumCount - 1;
  return (
    <div className="flex flex-col gap-4">
      <PhaseHeader emoji="📖" title="アルバム公開！" sub={`${game.albumIndex + 1} / ${game.albumCount} 冊目`} />
      <div className="flex justify-center gap-1.5">
        {Array.from({ length: game.albumCount }, (_, i) => (
          <span key={i} className={`h-2 rounded-full transition-all ${i === game.albumIndex ? 'w-6 bg-white' : i < game.albumIndex ? 'w-2 bg-white/50' : 'w-2 bg-white/15'}`} />
        ))}
      </div>
      {album && <Album key={album.ownerId} album={album} />}
      {isHost ? (
        <div className="sticky bottom-3 z-10 grid grid-cols-[auto_1fr] gap-3">
          <Button size="xl" variant="secondary" disabled={game.albumIndex === 0} onClick={() => act('album', { index: game.albumIndex - 1 })}>
            ◀
          </Button>
          {isLast ? (
            <Button size="xl" onClick={() => act('next')} data-testid="album-finish">
              おしまい！結果へ ▶
            </Button>
          ) : (
            <Button size="xl" onClick={() => act('album', { index: game.albumIndex + 1 })} data-testid="album-next">
              次のアルバム ▶
            </Button>
          )}
        </div>
      ) : (
        <p className="animate-pulse text-center text-sm font-bold text-muted">ホストがアルバムをめくります…</p>
      )}
    </div>
  );
}

function GameOver() {
  const { game, nameOf } = useGame<GrowView>();
  const [index, setIndex] = useState(0);
  const albums = game.albums ?? [];
  const album = albums[Math.min(index, albums.length - 1)];
  return (
    <GameOverPanel ranking={false}>
      <p className="text-center text-white/80">おつかれさま！アルバムを見返してみよう 📚</p>
      {albums.length > 0 && (
        <>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {albums.map((a, i) => (
              <button
                key={a.ownerId}
                onClick={() => setIndex(i)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${i === index ? 'bg-white text-ink' : 'bg-white/8'}`}
              >
                {nameOf(a.ownerId)}
              </button>
            ))}
          </div>
          {album && <Album key={album.ownerId} album={album} animate={false} />}
        </>
      )}
    </GameOverPanel>
  );
}
