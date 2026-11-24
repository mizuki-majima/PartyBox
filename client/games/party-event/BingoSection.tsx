import { useState } from 'react';
import type { PartyEventView } from '../../../shared/games/views';
import { Badge, Button, Card, Modal, SectionTitle, TextInput } from '../../components/ui';
import { useGame } from '../RoomContext';
import { HostButton, HostPanel } from './PartyEventScreen';

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
          <p className="mt-4 mb-2 font-display text-2xl text-white/60">まだ引いていません</p>
        ) : (
          <div key={b.last} className="animate-pop-in mt-3">
            <div className="font-display text-7xl leading-none sm:text-8xl" data-testid="bingo-last">
              <span className="text-pop-yellow">{letterOf(b.last)}</span> {b.last}
            </div>
          </div>
        )}
        <p className="mt-3 text-sm font-bold text-muted">
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
      <SectionTitle right={<Badge className="bg-white/10 text-white/80">カード {card.cardId}</Badge>}>
        あなたのカード
      </SectionTitle>
      <div className="grid grid-cols-5 gap-1.5" data-testid="bingo-card">
        {['B', 'I', 'N', 'G', 'O'].map((l) => (
          <div key={l} className="pb-1 text-center font-display text-sm text-pop-yellow">
            {l}
          </div>
        ))}
        {card.cells.map((n, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-lg text-base font-extrabold transition sm:text-lg ${
              n === 0
                ? 'bg-pop-violet/40 text-white/80'
                : card.marked[i]
                  ? 'bg-pop-mint text-ink'
                  : 'bg-white/8 text-white/85'
            }`}
          >
            {n === 0 ? '★' : n}
          </div>
        ))}
      </div>

      <div className="mt-4">
        {card.bingo ? (
          myRank ? (
            <p className="rounded-2xl bg-pop-mint/15 py-3 text-center text-sm font-extrabold text-pop-mint" data-testid="bingo-claimed">
              🎉 受付ずみです（{myRank} 番目）
            </p>
          ) : (
            <Button size="xl" block onClick={() => act('bingo:claim')} data-testid="bingo-claim">
              🎉 ビンゴ！
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
        <HostButton onClick={() => act('bingo:draw')} disabled={b.remaining === 0} testId="bingo-draw">
          🎱 番号を引く
        </HostButton>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => act('bingo:undo')} disabled={!b.called.length}>
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
            {b.prizes ? '🎁 景品を引き直す' : '🎁 景品を抽選'}
          </Button>
        </div>
        <Modal open={redraw} onClose={() => setRedraw(false)}>
          <h2 className="font-display text-xl">景品を引き直しますか？</h2>
          <p className="mt-2 text-sm text-white/80">いま出ている景品の割り当ては消えて、全員の画面が新しい結果に変わります。</p>
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
            <Button variant="secondary" onClick={() => act('bingo:inspect', { cardId })}>
              確認
            </Button>
          </div>
          {b.inspected && <InspectedCard />}
        </div>
      </div>
    </HostPanel>
  );
}

function InspectedCard() {
  const { game } = useGame<PartyEventView>();
  const card = game.bingo.inspected!;
  return (
    <div className="mt-3 rounded-2xl bg-black/20 p-3">
      <p className="mb-2 text-center text-sm font-extrabold">
        {card.cardId}:{' '}
        {card.bingo ? (
          <span className="text-pop-mint">ビンゴ（{card.lines} 列）</span>
        ) : (
          <span className="text-rose-300">まだ揃っていません（リーチ {card.reach}）</span>
        )}
      </p>
      <div className="grid grid-cols-5 gap-1">
        {card.cells.map((n, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded text-xs font-extrabold ${
              n === 0 ? 'bg-pop-violet/40' : card.marked[i] ? 'bg-pop-mint text-ink' : 'bg-white/10'
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
            className={`rounded-lg px-2 py-1 text-sm font-extrabold ${
              i === called.length - 1 ? 'bg-pop-yellow text-ink' : 'bg-white/8 text-white/80'
            }`}
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
            className={`flex items-center gap-2 rounded-xl px-3 py-2 ${c.inPrize ? 'bg-pop-yellow/15' : 'bg-white/5'}`}
          >
            <span className="font-display text-lg text-pop-yellow">{c.rank}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{c.name}</span>
            {c.cardId && <span className="text-xs text-muted">{c.cardId}</span>}
            {game.isHost && c.cardId && (
              <button
                className="text-xs font-bold text-rose-300 hover:text-rose-200"
                onClick={() => act('bingo:removeClaim', { cardId: c.cardId })}
              >
                取消
              </button>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Prizes() {
  const { game } = useGame<PartyEventView>();
  const prizes = game.bingo.prizes!;
  return (
    <Card className="bg-gradient-to-br from-pop-yellow/15 to-pop-orange/10">
      <SectionTitle>🎁 景品</SectionTitle>
      <ul className="flex flex-col gap-2" data-testid="bingo-prize-result">
        {prizes.assigned.map((p, i) => (
          <li key={p.cardId} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2.5">
            <span className="font-display text-lg text-pop-yellow">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-extrabold">{p.name}</span>
            <span className="text-sm font-bold text-pop-mint">{p.prize ?? '—'}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
