import { useEffect, useState } from 'react';
import type { PartyEventView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import { Icon } from '../../components/Icon';
import { Button, Modal, TextInput } from '../../components/ui';
import { request } from '../../lib/socket';
import { useToast } from '../../lib/toast';
import { useGame } from '../RoomContext';
import { DinnerSeating } from './DinnerSeating';
import { PickMyName } from './SeatsSection';

/**
 * 参加者の「あなた」の帯。自分の表示名・名簿で選んだ名前・夕食のチームと、
 * 「夕食の席」「表示名を変える」をいつでも出せるようにする（リハーサルで、自分がどこの誰として入っているか分からなくなったため）
 */
export function MeBar() {
  const { game, me } = useGame<PartyEventView>();
  const [dinnerOpen, setDinnerOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const person = game.seats.myPersonId ? game.seats.roster.find((p) => p.id === game.seats.myPersonId) : null;
  const display = me?.name ?? '';

  // 名前を選んだら、選ぶ画面は閉じる
  useEffect(() => {
    if (person) setPickOpen(false);
  }, [person]);

  return (
    <div className="ui-tile flex flex-col gap-2 px-4 py-3" data-testid="me-bar">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-lg font-extrabold">
          {display} さん
          {person && person.name !== display && <span className="ml-2 text-sm font-bold text-muted">（名簿: {person.name}）</span>}
        </p>
        <button className="min-h-11 px-1 text-sm font-bold text-info-ink underline underline-offset-4" onClick={() => setRenaming(true)} data-testid="me-rename">
          表示名を変える
        </button>
      </div>
      {game.dinner?.myTeam && (
        <p className="text-base font-bold">
          夕食: {game.dinner.myTeam}
          <span className="ml-1 text-muted">（{game.dinner.myTable}）</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!person && (
          <Button size="sm" onClick={() => setPickOpen(true)} data-testid="me-pick">
            <Icon name="users" /> 名簿から自分の名前を選ぶ
          </Button>
        )}
        {game.dinner && (
          <Button size="sm" variant="secondary" onClick={() => setDinnerOpen(true)} data-testid="me-dinner-open">
            <Icon name="seat" /> 夕食の席
          </Button>
        )}
      </div>

      <Modal open={dinnerOpen} onClose={() => setDinnerOpen(false)}>
        {game.dinner && <DinnerSeating dinner={game.dinner} />}
        <Button variant="secondary" block className="mt-4" onClick={() => setDinnerOpen(false)}>
          閉じる
        </Button>
      </Modal>
      <Modal open={pickOpen} onClose={() => setPickOpen(false)}>
        <PickMyName />
        <Button variant="secondary" block className="mt-4" onClick={() => setPickOpen(false)}>
          閉じる
        </Button>
      </Modal>
      <RenameModal open={renaming} current={display} onClose={() => setRenaming(false)} />
    </div>
  );
}

/** 表示名だけを変える（名簿で選んだ人・座席・チームは変わらない） */
function RenameModal({ open, current, onClose }: { open: boolean; current: string; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(current);
  }, [open, current]);

  const save = async () => {
    if (!name.trim()) {
      toast('名前を入力してください', 'error');
      return;
    }
    setBusy(true);
    const res = await request('room:rename', { name: name.trim() });
    setBusy(false);
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="font-display text-xl">表示名を変える</h2>
      <p className="mt-2 text-base text-fg/80">画面に出る名前だけが変わります。席やチームはそのままです。</p>
      <div className="mt-4">
        <TextInput value={name} onChange={setName} onEnter={save} maxLength={LIMITS.nameLength} data-testid="me-rename-input" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" onClick={onClose}>
          やめる
        </Button>
        <Button size="lg" onClick={save} loading={busy} data-testid="me-rename-save">
          変える
        </Button>
      </div>
    </Modal>
  );
}

/**
 * いまやることを1文で（参加者だけ）。リハーサルで「どこを押したらいいの」となったため、
 * 企画と段に合わせて、押すもの・待つことだけを大きく出す
 */
export function NowBanner() {
  const { game } = useGame<PartyEventView>();
  const text = nowText(game);
  return (
    <p className="ui-tile flex items-center gap-2 bg-hi px-4 py-3 text-lg font-extrabold text-on-hi" data-testid="now-banner" role="status">
      <Icon name="spark" className="h-6 w-6 shrink-0" />
      {text}
    </p>
  );
}

function nowText(game: PartyEventView): string {
  const me = game.seats.myPersonId ? game.seats.roster.find((p) => p.id === game.seats.myPersonId) : null;
  switch (game.section) {
    case 'quiz': {
      const q = game.quiz;
      if (q.phase === 'idle') return 'まもなくクイズです。そのまま待ちましょう';
      if (q.phase === 'question') return '問題を読みましょう（まだ答えられません）';
      if (q.phase === 'answering') return q.myTeam ? 'チームで相談して、下の答えを押しましょう' : '下で、自分のチームを押しましょう';
      if (q.phase === 'reveal') return '答えと、みんなの回答を見てみましょう';
      return '結果発表です';
    }
    case 'seats':
      if (!me) return '名簿から、自分の名前を押しましょう';
      if (me.table == null) return '下の「くじを引く」を押しましょう';
      return '出たテーブルへ移動しましょう';
    case 'bingo':
      return '読み上げられた番号を待ちましょう。そろったら「ビンゴ！」を押します';
    default:
      return '何も押さずに、司会の合図を待ちましょう';
  }
}
