import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import { LIMITS, type RoomSummary } from '../../shared/protocol';
import { Button, Modal, TextInput } from '../components/ui';
import { useToast } from '../lib/toast';
import { useTheme } from '../themes';

type RosterEntry = NonNullable<RoomSummary['roster']>[number];

/** 名前の比べ方。空白・全角半角・大文字小文字の違いは同じとみなす（サーバーの nameKey と同じ） */
const nameKey = (name: string) => name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/** 「名簿に無い方」の見出し（夕食の席に載っていない人） */
const NO_TEAM = 'そのほか';

/**
 * 懇親会の参加: 名簿から自分の名前を押す → 表示名（直してもよい）を確かめて参加。
 * 中では選んだ名簿の人として扱う（座席のくじ・夕食の席・クイズのチーム）。表示名は画面に出る名前だけ。
 * リハーサルで「どこを押せばいいか分からない」となったため、最初の画面は名前のボタンだけにする
 */
export function RosterJoin({
  roster,
  onJoin,
  onFree,
}: {
  roster: RosterEntry[];
  onJoin: (name: string, opts: { personId: string; takeover?: boolean }) => Promise<string | null>;
  onFree: () => void;
}) {
  const toast = useToast();
  // 参加者が最初に見る画面なので、入ったあとと同じ懇親会のデザインで見せる（共通画面のデザインから急に変わらないように）
  useTheme('party-event');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<RosterEntry | null>(null);
  const [display, setDisplay] = useState('');
  const [loading, setLoading] = useState(false);
  const [inUse, setInUse] = useState(false);

  // 夕食のチームごとにまとめる（チームの無い人は最後に「そのほか」）
  const groups = useMemo(() => {
    const key = nameKey(q);
    const byTeam = new Map<string, RosterEntry[]>();
    for (const p of roster) {
      if (key && !nameKey(p.name).includes(key)) continue;
      const team = p.team ?? NO_TEAM;
      byTeam.set(team, [...(byTeam.get(team) ?? []), p]);
    }
    return [...byTeam.entries()].sort(([a], [b]) =>
      a === NO_TEAM ? 1 : b === NO_TEAM ? -1 : a.localeCompare(b, 'ja', { numeric: true }),
    );
  }, [roster, q]);

  const pick = (p: RosterEntry) => {
    setPicked(p);
    setDisplay(p.name);
  };

  const submit = async (takeover = false) => {
    if (!picked) return;
    // 表示名を空にしたら、選んだ名前に戻す
    const name = display.trim() || picked.name;
    setLoading(true);
    const err = await onJoin(name, { personId: picked.id, takeover });
    setLoading(false);
    if (err === 'PERSON_IN_USE') setInUse(true);
    else if (err) toast(err, 'error');
  };

  return (
    <div data-testid="join-roster">
      <h2 className="font-display text-2xl">名簿から、自分の名前を押してください</h2>
      <p className="mt-1 text-base text-fg/80">押したあと、下の「この名前で参加する」を押すと始まります。</p>
      <div className="mt-4">
        <TextInput value={q} onChange={setQ} maxLength={20} showCount={false} placeholder="名前で絞り込む" aria-label="名前で絞り込む" />
      </div>

      <div className="mt-4 flex flex-col gap-4 pb-56">
        {groups.map(([team, people]) => (
          <section key={team}>
            <h3 className="mb-2 text-sm font-extrabold text-muted">{team}</h3>
            <div className="grid grid-cols-2 gap-2">
              {people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  aria-pressed={picked?.id === p.id}
                  data-testid="join-roster-person"
                  className={`ui-tile min-h-14 px-3 py-3 text-left text-lg font-extrabold transition ${picked?.id === p.id ? 'bg-ok text-on-ok' : ''}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="py-6 text-center text-base text-muted">見つかりません</p>}
        <button
          className="min-h-11 w-full py-2 text-sm font-bold text-info-ink underline underline-offset-4"
          onClick={onFree}
          data-testid="join-free-open"
        >
          名簿に名前が無い方はこちら
        </button>
      </div>

      {/* 選んだら、下に固定した欄で表示名を確かめて参加する（スクロールしなくても押せるように） */}
      {picked &&
        createPortal(
          <div className="ui-bar fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-edge="bottom">
            <div className="mx-auto max-w-md">
              <label className="block text-sm font-extrabold" htmlFor="join-display-name">
                表示名（変えてもかまいません）
              </label>
              <div className="mt-1">
                <TextInput
                  id="join-display-name"
                  value={display}
                  onChange={setDisplay}
                  onEnter={() => submit()}
                  maxLength={LIMITS.nameLength}
                  enterKeyHint="go"
                  data-testid="join-display-name"
                />
              </div>
              <Button size="xl" block className="mt-3" onClick={() => submit()} loading={loading} data-testid="join-submit">
                この名前で参加する
              </Button>
            </div>
          </div>,
          document.body,
        )}

      <Modal open={inUse} onClose={() => setInUse(false)}>
        <h2 className="font-display text-xl">{picked?.name} さんは、別のスマホで参加中です</h2>
        <p className="mt-2 text-base text-fg/80">
          ご本人なら、このスマホに切り替えます。前のスマホの画面は止まります（ビンゴのカードなどはそのまま引き継ぎます）。
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setInUse(false)}>
            やめる
          </Button>
          <Button
            size="lg"
            data-testid="join-takeover"
            onClick={async () => {
              setInUse(false);
              await submit(true);
            }}
          >
            本人です
          </Button>
        </div>
      </Modal>
    </div>
  );
}
