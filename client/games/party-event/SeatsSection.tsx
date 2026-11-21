import { useState } from 'react';
import type { PartyEventView, SeatsRosterEntry } from '../../../shared/games/views';
import { Badge, Button, Card, SectionTitle, TextInput } from '../../components/ui';
import { useGame } from '../RoomContext';
import { HostButton, HostPanel } from './PartyEventScreen';

export function SeatsSection() {
  const { game } = useGame<PartyEventView>();
  const s = game.seats;

  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center">
        <p className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">{s.title}</p>
        <p className="mt-2 font-display text-2xl">
          {s.drawn} / {s.drawn + s.remaining} 人
        </p>
        {s.last && (
          <div key={s.last.id} className="animate-pop-in mt-3 rounded-2xl bg-white/8 px-4 py-3">
            <p className="text-sm text-muted">いま引いた人</p>
            <p className="font-display text-2xl" data-testid="seats-last">
              {s.last.name}
            </p>
            <p className="mt-1 font-display text-xl text-pop-mint">
              {s.last.table == null ? '席なし' : (s.tables[s.last.table]?.name ?? `テーブル ${s.last.table + 1}`)}
            </p>
          </div>
        )}
      </Card>

      {game.isHost ? <HostControls /> : <MySeat />}

      <Tables />
      {game.isHost && <Roster />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 参加者                                                               */
/* ------------------------------------------------------------------ */
function MySeat() {
  const { game, act } = useGame<PartyEventView>();
  const s = game.seats;
  const me = s.myPersonId ? s.roster.find((p) => p.id === s.myPersonId) : null;

  if (!me) return <PickMyName />;

  if (me.table == null) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-muted">{me.name} さん</p>
        <div className="animate-float mt-3 text-5xl">🎐</div>
        <p className="mt-3 font-display text-xl">くじを待っています</p>
        <button className="mt-4 text-xs font-bold text-muted underline" onClick={() => act('seats:claim', { personId: '' })}>
          名前を選び直す
        </button>
      </Card>
    );
  }

  const table = s.tables[me.table];
  const mates = table?.people.filter((p) => p.id !== me.id) ?? [];
  return (
    <Card className="animate-pop-in bg-gradient-to-br from-pop-mint/20 to-pop-sky/10 text-center">
      <p className="text-sm text-muted">{me.name} さんの席は</p>
      <p className="mt-2 font-display text-5xl text-pop-mint" data-testid="my-table">
        {table?.name ?? `テーブル ${me.table + 1}`}
      </p>
      {mates.length > 0 && (
        <>
          <p className="mt-5 text-xs font-extrabold tracking-[0.2em] text-muted uppercase">同じテーブルの方</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {mates.map((p) => (
              <Badge key={p.id} className="bg-white/12 text-base text-white">
                {p.name}
              </Badge>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function PickMyName() {
  const { game, act } = useGame<PartyEventView>();
  const [q, setQ] = useState('');
  const taken = new Set(game.seats.roster.filter((p) => p.absent).map((p) => p.id));
  const list = game.seats.roster.filter((p) => !taken.has(p.id) && p.name.includes(q.trim()));

  return (
    <Card>
      <SectionTitle>名簿から自分を選んでください</SectionTitle>
      <TextInput value={q} onChange={setQ} maxLength={20} showCount={false} placeholder="名前で絞り込む" />
      <div className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto" data-testid="seats-roster-pick">
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => act('seats:claim', { personId: p.id })}
            className="rounded-xl bg-white/8 px-3 py-3 text-left text-sm font-bold hover:bg-white/14"
          >
            <span className="block truncate">{p.name}</span>
            {p.group && <span className="block truncate text-xs font-normal text-muted">{p.group}</span>}
          </button>
        ))}
        {!list.length && <p className="col-span-2 py-6 text-center text-sm text-muted">見つかりません</p>}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 司会                                                                 */
/* ------------------------------------------------------------------ */
function HostControls() {
  const { game, act } = useGame<PartyEventView>();
  const s = game.seats;
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');

  return (
    <HostPanel title="座席決めの進行">
      <div className="flex flex-col gap-3">
        <HostButton onClick={() => act('seats:draw')} disabled={s.remaining === 0} testId="seats-draw">
          🎐 1人引く（残り {s.remaining}）
        </HostButton>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => act('seats:drawAll')} disabled={s.remaining === 0}>
            残り全員
          </Button>
          <Button size="sm" variant="secondary" onClick={() => act('seats:undo')} disabled={!s.drawn}>
            ↩ 1つ戻す
          </Button>
        </div>
        <div>
          <SectionTitle>名簿に無い人を足す</SectionTitle>
          <div className="flex gap-2">
            <TextInput value={name} onChange={setName} maxLength={20} showCount={false} placeholder="名前" />
            <TextInput value={group} onChange={setGroup} maxLength={20} showCount={false} placeholder="所属" />
            <Button
              variant="secondary"
              onClick={() => {
                act('seats:addExtra', { name, group });
                setName('');
                setGroup('');
              }}
            >
              追加
            </Button>
          </div>
        </div>
      </div>
    </HostPanel>
  );
}

function Roster() {
  const { game, act } = useGame<PartyEventView>();
  const pending = game.seats.roster.filter((p) => p.table == null && !p.absent);
  const absent = game.seats.roster.filter((p) => p.absent);
  return (
    <Card>
      <SectionTitle right={<span className="text-xs text-muted">まだの人をタップで欠席に</span>}>
        まだ引いていない人（{pending.length}）
      </SectionTitle>
      <RosterChips people={pending} onClick={(p) => act('seats:absent', { personId: p.id, absent: true })} />
      {absent.length > 0 && (
        <>
          <SectionTitle>欠席（{absent.length}）</SectionTitle>
          <RosterChips
            people={absent}
            muted
            onClick={(p) => act('seats:absent', { personId: p.id, absent: false })}
          />
        </>
      )}
    </Card>
  );
}

function RosterChips({
  people,
  onClick,
  muted,
}: {
  people: SeatsRosterEntry[];
  onClick: (p: SeatsRosterEntry) => void;
  muted?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {people.map((p) => (
        <button
          key={p.id}
          onClick={() => onClick(p)}
          className={`rounded-lg px-2.5 py-1.5 text-sm font-bold ${
            muted ? 'bg-white/5 text-muted line-through' : 'bg-white/8 text-white/85 hover:bg-white/14'
          }`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

function Tables() {
  const { game } = useGame<PartyEventView>();
  const s = game.seats;
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="seats-tables">
      {s.tables.map((t, i) => (
        <Card key={i}>
          <SectionTitle right={<span className="text-xs text-muted">{t.people.length} / {t.seats}</span>}>
            {t.name}
          </SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {t.people.map((p) => (
              <Badge
                key={p.id}
                className={`text-sm ${p.id === s.myPersonId ? 'bg-pop-mint text-ink' : 'bg-white/10 text-white/85'}`}
              >
                {p.name}
              </Badge>
            ))}
            {!t.people.length && <span className="text-sm text-muted">まだ誰もいません</span>}
          </div>
        </Card>
      ))}
      {s.noSeat.length > 0 && (
        <Card className="sm:col-span-2">
          <SectionTitle>席なし</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {s.noSeat.map((p) => (
              <Badge key={p.id} className="bg-rose-400/20 text-sm text-rose-200">
                {p.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
