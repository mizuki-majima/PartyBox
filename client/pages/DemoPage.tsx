import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { type GameMeta, getGameMeta, isEventGame } from '../../shared/games';
import { Icon } from '../components/Icon';
import { Button, Card, FullScreenMessage, Logo, Modal, Spinner } from '../components/ui';
import { type DemoRoom, GUEST_COUNTS, HOST_SEAT, addDemoGuests, closeDemoRoom, createDemoRoom, guestSeat } from '../lib/demo';
import { useToast } from '../lib/toast';

/**
 * 1人で試すデモ（/demo/<id>）。懇親会のような、司会が進行する催し物向け。
 *
 * 司会の画面と参加者の画面（1〜5台）を並べて、同時に動かせる。どの枠も本物の画面で、
 * 本物のサーバーに繋がる。使い捨てのデモ用ルームを作るので、本番のルームには触れない。
 */
export function DemoPage() {
  const { gameId = '' } = useParams();
  const meta = getGameMeta(gameId);
  if (!meta || !isEventGame(meta.id)) {
    return (
      <FullScreenMessage icon="search" title="デモが見つかりません">
        <Link to="/">
          <Button size="lg">トップへ</Button>
        </Link>
      </FullScreenMessage>
    );
  }
  return <Demo meta={meta} />;
}

const COUNT_KEY = 'partybox:demo:guests';
const DEFAULT_COUNT = 3;

function loadCount(): number {
  try {
    const n = Number(localStorage.getItem(COUNT_KEY));
    return (GUEST_COUNTS as readonly number[]).includes(n) ? n : DEFAULT_COUNT;
  } catch {
    return DEFAULT_COUNT;
  }
}

function saveCount(n: number): void {
  try {
    localStorage.setItem(COUNT_KEY, String(n));
  } catch {
    /* 覚えておけなくても動く */
  }
}

function Demo({ meta }: { meta: GameMeta }) {
  const toast = useToast();
  const [count, setCount] = useState(loadCount);
  const [room, setRoom] = useState<DemoRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const roomRef = useRef<DemoRoom | null>(null);
  const started = useRef(false);

  /** 新しいデモ用ルームを作る。前のルームがあれば閉じる */
  const start = useCallback(
    async (guests: number) => {
      setBusy(true);
      setError(null);
      try {
        const next = await createDemoRoom(meta.id, guests);
        const prev = roomRef.current;
        roomRef.current = next;
        setRoom(next);
        if (prev) void closeDemoRoom(prev);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'デモのルームを作れませんでした');
      } finally {
        setBusy(false);
      }
    },
    [meta.id],
  );

  useEffect(() => {
    // StrictMode の二重実行でルームを2つ作らないように
    if (started.current) return;
    started.current = true;
    void start(loadCount());
  }, [start]);

  const changeCount = async (n: number) => {
    setCount(n);
    saveCount(n);
    const current = roomRef.current;
    if (!current || n <= current.guests) return;
    setBusy(true);
    try {
      const next = await addDemoGuests(current, n);
      if (roomRef.current?.code !== current.code) return; // その間に作り直された
      roomRef.current = next;
      setRoom(next);
    } catch (err) {
      toast(err instanceof Error ? err.message : '参加者を増やせませんでした', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shown = room ? Math.min(count, room.guests) : 0;

  return (
    <div className="min-h-dvh pb-12">
      <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <Link to="/" className="text-sm font-bold text-muted hover:text-fg">
          ← トップ
        </Link>
      </header>

      <section className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <Card className="!p-4 sm:!p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="mr-auto">
              <p className="text-xs font-extrabold tracking-[0.3em] text-ok-ink">DEMO</p>
              <h1 className="font-display text-2xl">
                {meta.title}を試す
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="参加者の台数">
              <span className="text-sm font-extrabold text-muted">参加者</span>
              {GUEST_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => void changeCount(n)}
                  disabled={busy}
                  aria-pressed={count === n}
                  data-testid={`demo-guests-${n}`}
                  className={`min-h-11 rounded-xl px-3 text-sm font-extrabold ring-1 ring-line transition disabled:opacity-50 ${
                    count === n ? 'bg-fg text-bg' : 'bg-panel'
                  }`}
                >
                  {n}台
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowQr(true)} disabled={!room}>
                <Icon name="qr" /> スマホで参加
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={!room}>
                読み込み直す
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void start(count)} disabled={busy} data-testid="demo-restart">
                最初からやり直す
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-fg/75">
            <span className="hidden lg:inline">左が司会、右が参加者のスマホの画面です。</span>
            <span className="lg:hidden">上が司会、下が参加者のスマホの画面です。</span>司会の枠で企画を選んで「引く」「次へ」などを押すと、参加者の枠が同時に変わります。
            どの枠も本物の画面で、それぞれ別のスマホとして動きます。
            <br className="hidden sm:inline" />
            このデモは使い捨てのルームなので、本番のルームには影響しません（誰もいなくなって30分で消えます）。
            <span className="lg:hidden">PCの大きな画面で開くのがおすすめです。</span>
          </p>
        </Card>
      </section>

      <main className="mx-auto mt-4 max-w-[1600px] px-4 sm:px-6">
        {error ? (
          <Card className="py-12 text-center">
            <Icon name="alert" className="mx-auto !block h-12 w-12" />
            <p className="mt-3 font-extrabold">デモのルームを作れませんでした</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
            <Button className="mt-5" onClick={() => void start(count)} loading={busy}>
              もう一度試す
            </Button>
          </Card>
        ) : !room ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Spinner className="h-8 w-8 text-accent-ink" />
            <p className="font-bold">デモのルームを用意しています…</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <Frame
              key={`host-${room.code}-${reloadKey}`}
              label="司会（進行する人の画面）"
              title="司会"
              src={`/room/${room.code}/h/${room.hostToken}?seat=${HOST_SEAT}`}
              className="lg:sticky lg:top-3 lg:flex-1"
              frameClassName="h-[80dvh] min-h-[520px] lg:h-[calc(100dvh-3.5rem)]"
            />
            {/* 参加者の枠は実際のスマホに近い幅（380px）にそろえる。広い画面では2列 */}
            <div className="grid gap-4 md:grid-cols-2 lg:w-[380px] lg:shrink-0 lg:grid-cols-1 min-[90rem]:w-[776px] min-[90rem]:grid-cols-2">
              {Array.from({ length: shown }, (_, i) => (
                <Frame
                  key={`guest-${i + 1}-${room.code}-${reloadKey}`}
                  label={`参加者 ${i + 1}`}
                  title={`参加者 ${i + 1}`}
                  src={`/room/${room.code}?seat=${guestSeat(i + 1)}`}
                  frameClassName="h-[680px]"
                />
              ))}
              {busy && shown < count && (
                <div className="flex h-40 items-center justify-center gap-2 rounded-3xl text-muted ring-1 ring-line">
                  <Spinner /> 参加者を増やしています…
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {room && <JoinQr open={showQr} onClose={() => setShowQr(false)} code={room.code} />}
    </div>
  );
}

function Frame({
  label,
  title,
  src,
  className = '',
  frameClassName = '',
}: {
  label: string;
  title: string;
  src: string;
  className?: string;
  frameClassName?: string;
}) {
  return (
    <figure className={`min-w-0 ${className}`}>
      <figcaption className="mb-1.5 border-t-4 border-line px-1 pt-1 text-sm font-extrabold">{label}</figcaption>
      <iframe
        src={src}
        title={title}
        className={`block w-full bg-bg ring-1 ring-line ${frameClassName}`}
        data-testid={`demo-frame-${title}`}
      />
    </figure>
  );
}

/** 手元のスマホからもデモのルームに入れるように（入った人は参加者として加わる） */
function JoinQr({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const url = `${location.origin}/room/${code}`;
  const [qr, setQr] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0f0c24', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('招待URLをコピーしました', 'success');
    } catch {
      toast('コピーできませんでした', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="font-display text-xl">スマホで参加する</h2>
      <p className="mt-1 text-sm text-muted">読み取ると、このデモに参加者として加わります。</p>
      {qr && <img src={qr} alt="デモのルームの招待QRコード" className="mx-auto mt-4 w-56 border border-line bg-[#fff] p-2" />}
      <p className="mt-3 text-center font-display text-2xl tracking-[0.15em]">{code}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={copy}>
          URLをコピー
        </Button>
        <Button onClick={onClose}>閉じる</Button>
      </div>
    </Modal>
  );
}
