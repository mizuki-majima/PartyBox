import { useState } from 'react';
import type { PartyEventView, SeatsRosterEntry } from '../../../shared/games/views';
import { Icon } from '../../components/Icon';
import { Badge, Button, Card, Modal, SectionTitle, TextInput } from '../../components/ui';
import { useGame } from '../RoomContext';
import { ConfirmModal, HostActionBar, HostButton, HostPanel, ResetButton } from './PartyEventScreen';

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
          <div key={s.last.id} className="ui-tile animate-pop-in mt-3 bg-hi px-4 py-3 text-on-hi">
            <p className="text-sm">いま引いた人</p>
            <p className="font-display text-2xl" data-testid="seats-last">
              {s.last.name}
            </p>
            <p className="mt-1 font-display text-xl">
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

  // くじは引かれたが、席が足りなかった
  if (s.noSeat.some((p) => p.id === me.id)) {
    return (
      <Card className="py-10 text-center" data-testid="my-no-seat">
        <p className="text-sm text-muted">{me.name} さん</p>
        <Icon name="alert" className="mx-auto mt-3 !block h-12 w-12" />
        <p className="mt-3 font-display text-xl">席が足りませんでした</p>
        <p className="mt-2 text-sm text-fg/75">司会の案内をお待ちください。</p>
      </Card>
    );
  }

  if (me.table == null) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-muted">{me.name} さん</p>
        <Icon name="seat" className="animate-float mx-auto mt-3 !block h-12 w-12" />
        <p className="mt-3 font-display text-xl">くじを待っています</p>
        <button className="mt-4 min-h-11 px-3 text-xs font-bold text-muted underline" onClick={() => act('seats:claim', { personId: '' })}>
          名前を選び直す
        </button>
      </Card>
    );
  }

  const table = s.tables[me.table];
  const mates = table?.people.filter((p) => p.id !== me.id) ?? [];
  return (
    <Card className="animate-pop-in bg-ok/15 text-center">
      <p className="text-sm text-muted">{me.name} さんの席は</p>
      <p className="mt-2 font-display text-5xl" data-testid="my-table">
        {table?.name ?? `テーブル ${me.table + 1}`}
      </p>
      {mates.length > 0 && (
        <>
          <p className="mt-5 text-xs font-extrabold tracking-[0.2em] text-muted uppercase">同じテーブルの方</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {mates.map((p) => (
              <Badge key={p.id} className="bg-panel text-base">
                {p.name}
              </Badge>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/** 名前の比べ方。空白・全角半角・大文字小文字の違いは同じとみなす（サーバーの nameKey と同じ） */
const nameKey = (name: string) => name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

function PickMyName() {
  const { game, act } = useGame<PartyEventView>();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<SeatsRosterEntry | null>(null);
  const key = nameKey(q);
  const list = game.seats.roster.filter((p) => !p.absent && nameKey(p.name).includes(key));
  // 絞り込んで見つからなければ、そのまま名前を足せるようにする
  const showAdd = adding || (key !== '' && list.length === 0);
  const pick = (p: SeatsRosterEntry) => (p.taken ? setConfirm(p) : act('seats:claim', { personId: p.id }));

  return (
    <Card>
      <SectionTitle>名簿から自分を選んでください</SectionTitle>
      <p className="-mt-1 mb-3 text-sm text-fg/75">名前を選んだ人だけが、席のくじに入ります。</p>
      <TextInput value={q} onChange={setQ} maxLength={20} showCount={false} placeholder="名前で絞り込む" />
      <div className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto" data-testid="seats-roster-pick">
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p)}
            className={`ui-tile min-h-14 px-3 py-3 text-left text-sm font-bold ${p.taken ? 'border-dashed text-muted' : ''}`}
          >
            <span className="block truncate">{p.name}</span>
            <span className="block truncate text-xs font-normal text-muted">
              {p.taken ? '選ばれています' : p.group}
            </span>
          </button>
        ))}
        {!list.length && <p className="col-span-2 py-6 text-center text-sm text-muted">見つかりません</p>}
      </div>
      {showAdd ? (
        <AddMyName key={q.trim()} initialName={q.trim()} />
      ) : (
        <button
          className="mt-4 min-h-11 w-full rounded-xl py-2 text-sm font-bold text-info-ink underline underline-offset-4"
          onClick={() => setAdding(true)}
          data-testid="seats-add-open"
        >
          名簿に名前が無い方はこちら
        </button>
      )}
      <Modal open={confirm !== null} onClose={() => setConfirm(null)}>
        <h2 className="font-display text-xl">{confirm?.name} さんですか？</h2>
        <p className="mt-2 text-sm text-fg/80">
          この名前は、別のスマホですでに選ばれています。ご本人で間違いなければ、このスマホに切り替えます
          （前のスマホでは名前の選び直しになります）。
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setConfirm(null)}>
            やめる
          </Button>
          <Button
            size="lg"
            data-testid="seats-takeover"
            onClick={async () => {
              const id = confirm?.id;
              setConfirm(null);
              if (id) await act('seats:claim', { personId: id, takeover: true });
            }}
          >
            本人です
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/** 名簿に無い人が、自分の名前を足してくじに入る */
function AddMyName({ initialName }: { initialName: string }) {
  const { game, act } = useGame<PartyEventView>();
  const groups = game.seats.groups;
  const choices = groups.length ? [...groups, 'その他'] : [];
  const [name, setName] = useState(initialName);
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = name.trim() !== '' && (choices.length === 0 || group !== '');

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    await act('seats:addSelf', { name, group });
    setBusy(false);
  };

  return (
    <div className="ui-tile mt-4 p-4" data-testid="seats-add-self">
      <p className="font-extrabold">名簿に名前が無い方</p>
      <p className="mt-1 text-sm text-fg/75">名前と所属を入れると、名簿に加わって、そのまま席のくじに入ります。</p>
      <div className="mt-3">
        <TextInput
          value={name}
          onChange={setName}
          onEnter={submit}
          maxLength={20}
          placeholder="名前（例：山田 太郎）"
          data-testid="seats-add-name"
        />
      </div>
      {choices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="所属">
          {choices.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              aria-pressed={group === g}
              className={`ui-tile h-11 min-w-16 px-4 text-sm font-extrabold transition ${group === g ? 'bg-fg text-bg' : ''}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <Button className="mt-3" block onClick={submit} loading={busy} disabled={!ready} data-testid="seats-add-submit">
        名前を足して、くじに入る
      </Button>
    </div>
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
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <HostPanel title="座席決めの進行">
      <div className="flex flex-col gap-3">
        <HostActionBar>
          <HostButton onClick={() => act('seats:draw', { at: s.drawn })} disabled={s.remaining === 0} testId="seats-draw">
            1人引く（残り {s.remaining}）
          </HostButton>
        </HostActionBar>
        <ConfirmModal
          open={confirmAll}
          title={`残りの ${s.remaining} 人を、一度に引きますか？`}
          confirmLabel="全員引く"
          onConfirm={() => act('seats:drawAll', { at: s.drawn })}
          onClose={() => setConfirmAll(false)}
          testId="seats-draw-all-confirm"
        >
          1人ずつではなく、残り全員の席がまとめて決まり、全員の画面に出ます。
        </ConfirmModal>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => setConfirmAll(true)} disabled={s.remaining === 0} data-testid="seats-draw-all">
            残り全員
          </Button>
          <Button size="sm" variant="secondary" onClick={() => act('seats:undo', { at: s.drawn })} disabled={!s.drawn}>
            ↩ 1つ戻す
          </Button>
        </div>
        <p className="text-xs text-fg/70">
          くじは下の「くじに入る人」（名前を選んだ人・名前を足した人・司会がくじに入れた人）だけから引きます。
          みんなが名前を選び終わってから引いてください。
        </p>
        <div>
          <SectionTitle>名簿に無い人を足す</SectionTitle>
          <div className="flex gap-2">
            <TextInput value={name} onChange={setName} maxLength={20} showCount={false} placeholder="名前" />
            <TextInput value={group} onChange={setGroup} maxLength={20} showCount={false} placeholder="所属" />
            <Button
              variant="secondary"
              className="shrink-0"
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
        {(s.drawn > 0 || s.roster.some((p) => p.absent)) && (
          <ResetButton title="座席決めを最初からやり直しますか？" onReset={() => act('seats:reset')} testId="seats-reset">
            決まった席と欠席の印が全部消えます。各自が選んだ名前と、当日足した人はそのままです。
          </ResetButton>
        )}
      </div>
    </HostPanel>
  );
}

function Roster() {
  const { game, act } = useGame<PartyEventView>();
  const notDrawn = game.seats.roster.filter((p) => p.table == null && !p.absent);
  const inDraw = notDrawn.filter((p) => p.chosen);
  const notChosen = notDrawn.filter((p) => !p.chosen);
  const absent = game.seats.roster.filter((p) => p.absent);
  return (
    <Card>
      <SectionTitle right={<span className="text-xs text-muted">タップで欠席に</span>}>
        くじに入る人（{inDraw.length}）
      </SectionTitle>
      {inDraw.length ? (
        <RosterChips people={inDraw} onClick={(p) => act('seats:absent', { personId: p.id, absent: true })} />
      ) : (
        <p className="mb-3 text-sm text-muted">まだ誰も名前を選んでいません</p>
      )}
      {notChosen.length > 0 && (
        <details className="mb-3" data-testid="seats-not-chosen">
          <summary className="cursor-pointer text-sm font-extrabold text-fg/85">
            名前を選んでいない人（{notChosen.length}）
          </summary>
          <p className="mt-2 mb-2 text-xs text-fg/70">
            来ていない人も含みます。スマホが無いなど、自分で選べない方はタップするとくじに入ります。
          </p>
          <RosterChips people={notChosen} onClick={(p) => act('seats:present', { personId: p.id, present: true })} />
        </details>
      )}
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
          className={`ui-badge min-h-11 bg-panel px-3 py-1.5 text-sm font-bold ${muted ? 'text-muted line-through' : ''}`}
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
                className={`text-sm ${p.id === s.myPersonId ? 'bg-ok text-on-ok' : 'bg-panel'}`}
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
              <Badge key={p.id} className="bg-panel text-sm text-danger-ink">
                {p.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
