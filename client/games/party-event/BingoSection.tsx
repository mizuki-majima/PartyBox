import { useState } from 'react';
import type { PartyEventView } from '../../../shared/games/views';
import { Icon } from '../../components/Icon';
import { Badge, Button, Card, Modal, SectionTitle, TextInput } from '../../components/ui';
import { useGame } from '../RoomContext';
import { ConfirmModal, HostActionBar, HostButton, HostPanel, ResetButton } from './PartyEventScreen';

const letterOf = (n: number) => 'BINGO'[Math.min(4, Math.floor((n - 1) / 15))];

export function BingoSection() {
  const { game } = useGame<PartyEventView>();
  const b = game.bingo;

  return (
    <div className="flex flex-col gap-4">
      {/* いま読み上げている番号 */}
      <Card className="text-center">
        <p className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">{b.title}</p>
        {b.last == null ? (
          <p className="mt-4 mb-2 font-display text-2xl text-fg/60">まだ引いていません</p>
        ) : (
          <div key={b.last} className="animate-pop-in mt-3">
            <div className="font-display text-7xl leading-none sm:text-8xl" data-testid="bingo-last">
              <span className="text-accent-ink">{letterOf(b.last)}</span> {b.last}
            </div>
          </div>
        )}
        <p className="mt-3 text-sm font-bold text-muted" data-testid="bingo-count">
          {b.called.length} 個 / 残り {b.remaining}
        </p>
      </Card>

      {game.isHost ? <HostControls /> : <MyCard />}

      <CalledNumbers called={b.called} />
      <Claims />
      {b.prizes && <Prizes />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 参加者: 自分のカード                                                  */
/* ------------------------------------------------------------------ */
function MyCard() {
  const { game, act } = useGame<PartyEventView>();
  const card = game.bingo.myCard;
  if (!card) {
    return (
      <Card className="text-center text-sm text-muted">カードを準備しています…</Card>
    );
  }
  const myRank = game.bingo.myRank;

  return (
    <Card>
      <SectionTitle right={<Badge className="bg-panel">カード {card.cardId}</Badge>}>
        あなたのカード
      </SectionTitle>
      <div className="grid grid-cols-5 gap-1.5" data-testid="bingo-card">
        {['B', 'I', 'N', 'G', 'O'].map((l) => (
          <div key={l} className="pb-1 text-center font-display text-sm text-accent-ink">
            {l}
          </div>
        ))}
        {card.cells.map((n, i) => (
          <div
            key={i}
            // 開いたマスは、色だけでなく形でも分かるようにする（開いた = 丸、まだ = 四角）
            className={`flex aspect-square items-center justify-center text-base font-extrabold ring-2 ring-line transition sm:text-lg ${
              n === 0 ? 'rounded-full bg-hi text-on-hi' : card.marked[i] ? 'rounded-full bg-ok text-on-ok' : 'rounded-lg bg-panel'
            }`}
          >
            {n === 0 ? '★' : n}
          </div>
        ))}
      </div>

      <div className="mt-4">
        {card.bingo ? (
          myRank ? (
            <p className="ui-tile bg-ok py-3 text-center text-sm font-extrabold text-on-ok" data-testid="bingo-claimed">
              <Icon name="check" className="mr-1 inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
              受付ずみです（{myRank} 番目）
            </p>
          ) : (
            <Button size="xl" block onClick={() => act('bingo:claim')} data-testid="bingo-claim">
              <Icon name="spark" /> ビンゴ！
            </Button>
          )
        ) : (
          <p className="text-center text-sm font-bold text-muted">
            {card.reach > 0 ? `あと1つでビンゴ！（リーチ ${card.reach}）` : '読み上げられた番号を待ちましょう'}
          </p>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        マスは自動で開きます。タップは要りません
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 司会                                                                 */
/* ------------------------------------------------------------------ */
function HostControls() {
  const { game, act } = useGame<PartyEventView>();
  const b = game.bingo;
  const [cardId, setCardId] = useState('');
  const [redraw, setRedraw] = useState(false);

  return (
    <HostPanel title="ビンゴの進行">
      <div className="flex flex-col gap-3">
        <HostActionBar>
          <HostButton onClick={() => act('bingo:draw', { at: b.called.length })} disabled={b.remaining === 0} testId="bingo-draw">
            <Icon name="bingo" /> 番号を引く
          </HostButton>
        </HostActionBar>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => act('bingo:undo', { at: b.called.length })} disabled={!b.called.length}>
            ↩ 1つ戻す
          </Button>
          <Button
            size="sm"
            variant="secondary"
            // もう抽選してあれば、引き直す前に確かめる（押し間違いで結果が変わらないように）
            onClick={() => (b.prizes ? setRedraw(true) : act('bingo:prizes'))}
            disabled={!b.claims.length}
            data-testid="bingo-prizes"
          >
            <Icon name="gift" /> {b.prizes ? '景品を引き直す' : '景品を抽選'}
          </Button>
        </div>
        <Modal open={redraw} onClose={() => setRedraw(false)}>
          <h2 className="font-display text-xl">景品を引き直しますか？</h2>
          <p className="mt-2 text-sm text-fg/80">いま出ている景品の割り当ては消えて、全員の画面が新しい結果に変わります。</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => setRedraw(false)}>
              やめる
            </Button>
            <Button
              variant="danger"
              size="lg"
              data-testid="bingo-prizes-confirm"
              onClick={async () => {
                setRedraw(false);
                await act('bingo:prizes');
              }}
            >
              引き直す
            </Button>
          </div>
        </Modal>

        <div>
          <SectionTitle>カードを確かめる</SectionTitle>
          <div className="flex gap-2">
            <TextInput
              value={cardId}
              onChange={(v) => setCardId(v.toUpperCase())}
              onEnter={() => act('bingo:inspect', { cardId })}
              maxLength={4}
              showCount={false}
              placeholder="A1B2"
              className="uppercase"
            />
            <Button variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => act('bingo:inspect', { cardId })}>
              確認
            </Button>
          </div>
          {b.inspected && <InspectedCard />}
        </div>
        {b.called.length > 0 && (
          <ResetButton title="ビンゴを最初からやり直しますか？" onReset={() => act('bingo:reset')} testId="bingo-reset">
            引いた番号・ビンゴした人の受付・景品の結果が全部消えます。配ったカードはそのままです。
          </ResetButton>
        )}
      </div>
    </HostPanel>
  );
}

function InspectedCard() {
  const { game } = useGame<PartyEventView>();
  const card = game.bingo.inspected!;
  return (
    <div className="ui-tile mt-3 p-3">
      <p className="mb-2 text-center text-sm font-extrabold">
        {card.cardId}:{' '}
        {card.bingo ? (
          <span className="text-ok-ink">ビンゴ（{card.lines} 列）</span>
        ) : (
          <span className="text-danger-ink">まだ揃っていません（リーチ {card.reach}）</span>
        )}
      </p>
      <div className="grid grid-cols-5 gap-1">
        {card.cells.map((n, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center text-xs font-extrabold ring-1 ring-line ${
              n === 0 ? 'rounded-full bg-hi text-on-hi' : card.marked[i] ? 'rounded-full bg-ok text-on-ok' : 'rounded bg-panel'
            }`}
          >
            {n === 0 ? '★' : n}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 共通                                                                 */
/* ------------------------------------------------------------------ */
function CalledNumbers({ called }: { called: number[] }) {
  if (!called.length) return null;
  return (
    <Card>
      <SectionTitle>読み上げた番号</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {called.map((n, i) => (
          <span
            key={n}
            className={`ui-badge px-2 py-1 text-sm font-extrabold ${i === called.length - 1 ? 'bg-hi text-on-hi' : 'bg-panel'}`}
          >
            {letterOf(n)}
            {n}
          </span>
        ))}
      </div>
    </Card>
  );
}

function Claims() {
  const { game, act } = useGame<PartyEventView>();
  const b = game.bingo;
  const [removing, setRemoving] = useState<{ cardId: string; name: string } | null>(null);
  if (!b.claims.length) return null;
  return (
    <Card>
      <SectionTitle right={<span className="text-xs text-muted">上位 {b.winnersCount} 名に景品</span>}>
        ビンゴした人
      </SectionTitle>
      <ol className="flex flex-col gap-1.5" data-testid="bingo-claims">
        {b.claims.map((c) => (
          <li
            key={c.rank}
            className={`ui-tile flex items-center gap-2 px-3 py-2 ${c.inPrize ? 'bg-hi' : ''}`}
          >
            <span className="font-display text-lg">{c.rank}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{c.name}</span>
            {c.cardId && <span className="text-xs text-muted">{c.cardId}</span>}
            {game.isHost && c.cardId && (
              <button
                className="min-h-11 px-2 text-xs font-bold text-danger-ink underline"
                onClick={() => setRemoving({ cardId: c.cardId!, name: c.name })}
                data-testid="bingo-claim-remove"
              >
                取消
              </button>
            )}
          </li>
        ))}
      </ol>
      <ConfirmModal
        open={removing !== null}
        title={`${removing?.name ?? ''} さんの受付を取り消しますか？`}
        confirmLabel="取り消す"
        onConfirm={() => act('bingo:removeClaim', { cardId: removing?.cardId })}
        onClose={() => setRemoving(null)}
        testId="bingo-claim-remove-confirm"
      >
        順位が繰り上がります。{b.prizes ? '景品の抽選結果も消えるので、抽選はやり直しになります。' : ''}
      </ConfirmModal>
    </Card>
  );
}

function Prizes() {
  const { game } = useGame<PartyEventView>();
  const prizes = game.bingo.prizes!;
  return (
    <Card className="bg-hi/30">
      <SectionTitle>景品</SectionTitle>
      <ul className="flex flex-col gap-2" data-testid="bingo-prize-result">
        {prizes.assigned.map((p, i) => (
          <li key={p.cardId} className="ui-tile flex items-center gap-3 px-3 py-2.5">
            <span className="font-display text-lg">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-extrabold">{p.name}</span>
            <span className="text-sm font-bold">{p.prize ?? '—'}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
