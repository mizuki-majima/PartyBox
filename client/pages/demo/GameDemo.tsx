import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { GameMeta } from '../../../shared/games';
import { Icon } from '../../components/Icon';
import { Button, Card, Logo, Spinner } from '../../components/ui';
import { type SoloDemoRoom, closeSoloDemoRoom, createSoloDemoRoom } from '../../lib/demo';
import { soloCounts, soloDefault, soloName, soloSeat } from '../../lib/soloDemo';
import { Frame, JoinQr } from './DemoParts';

/**
 * 通常のゲームを1人で試す（/demo/<ゲーム>）。全員ぶんの画面（どれも本物の画面）を並べ、1人で全員を操作する。
 *
 * 1枚目がホスト。ロビーから始まり、設定と「スタート」はホストの枠で押す（流れを最初から体験できるように）。
 * 人数を変える・最初からやり直すと、使い捨てのルームを作り直す（前のルームは閉じる）。
 * デモのルームは保存せず、勝者の記録にも残らない（サーバー側で room.demo を見て判断する）
 */
export function GameDemo({ meta }: { meta: GameMeta }) {
  const counts = soloCounts(meta);
  const [count, setCount] = useState(() => soloDefault(meta));
  const [room, setRoom] = useState<SoloDemoRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const roomRef = useRef<SoloDemoRoom | null>(null);
  /** 何回目の作り直しか。続けて押されたときは、最後に押した人数のルームだけを残す */
  const latest = useRef(0);
  const started = useRef(false);

  const build = useCallback(
    async (players: number) => {
      const id = ++latest.current;
      setBusy(true);
      setError(null);
      try {
        const next = await createSoloDemoRoom(meta.id, players);
        if (id !== latest.current) {
          // 作っている間に別の人数が押された。こちらは使わないので閉じる
          void closeSoloDemoRoom(next);
          return;
        }
        const prev = roomRef.current;
        roomRef.current = next;
        setRoom(next);
        if (prev) void closeSoloDemoRoom(prev);
      } catch (err) {
        if (id === latest.current) setError(err instanceof Error ? err.message : 'デモのルームを作れませんでした');
      } finally {
        if (id === latest.current) setBusy(false);
      }
    },
    [meta.id],
  );

  useEffect(() => {
    // StrictMode の二重実行でルームを2つ作らないように
    if (started.current) return;
    started.current = true;
    void build(soloDefault(meta));
  }, [build, meta]);

  const changeCount = (n: number) => {
    setCount(n);
    void build(n);
  };

  return (
    <div className="min-h-dvh pb-12">
      <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <Link to={`/play/${meta.id}`} className="text-sm font-bold text-muted hover:text-fg">
          ← もどる
        </Link>
      </header>

      <section className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <Card className="!p-4 sm:!p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="mr-auto">
              <p className="text-xs font-extrabold tracking-[0.3em] text-ok-ink">DEMO</p>
              <h1 className="font-display text-2xl">{meta.title}を1人で試す</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="人数">
              <span className="text-sm font-extrabold text-muted">人数</span>
              {counts.map((n) => (
                <button
                  key={n}
                  onClick={() => changeCount(n)}
                  aria-pressed={count === n}
                  data-testid={`demo-count-${n}`}
                  className={`min-h-11 rounded-xl px-3 text-sm font-extrabold ring-1 ring-line transition ${
                    count === n ? 'bg-fg text-bg' : 'bg-panel'
                  }`}
                >
                  {n}人
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
              <Button size="sm" variant="secondary" onClick={() => void build(count)} disabled={busy} data-testid="demo-restart">
                最初からやり直す
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-fg/75">
            1枚目があなた（ホスト）の画面です。ホストの画面で設定を選んで「スタート」を押すと、全員の画面が同時に動きます。
            どの枠も本物の画面で、それぞれ別のスマホとして動きます。
            <br className="hidden sm:inline" />
            デモのルームは使い捨てで、勝者の記録には残りません（誰もいなくなって30分で消えます）。PCの大きな画面で開くのがおすすめです。
          </p>
        </Card>
      </section>

      <main className="mx-auto mt-4 max-w-[1600px] px-4 sm:px-6">
        {error ? (
          <Card className="py-12 text-center">
            <Icon name="alert" className="mx-auto !block h-12 w-12" />
            <p className="mt-3 font-extrabold">デモのルームを作れませんでした</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
            <Button className="mt-5" onClick={() => void build(count)} loading={busy}>
              もう一度試す
            </Button>
          </Card>
        ) : !room ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Spinner className="h-8 w-8 text-accent-ink" />
            <p className="font-bold">デモのルームを用意しています…</p>
          </Card>
        ) : (
          // 枠は実際のスマホに近い幅で横に並べ、入りきらなければ折り返す
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
            {Array.from({ length: room.players }, (_, i) => {
              const n = i + 1;
              return (
                <Frame
                  key={`${n}-${room.code}-${reloadKey}`}
                  label={n === 1 ? `${soloName(1)}（あなた・ホスト）` : soloName(n)}
                  title={soloName(n)}
                  src={`/room/${room.code}?seat=${soloSeat(n)}`}
                  frameClassName="h-[680px]"
                />
              );
            })}
          </div>
        )}
      </main>

      {room && <JoinQr open={showQr} onClose={() => setShowQr(false)} code={room.code} />}
    </div>
  );
}
