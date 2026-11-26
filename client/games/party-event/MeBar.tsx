import { useEffect, useState } from 'react';
import type { PartyEventView } from '../../../shared/games/views';
import { LIMITS } from '../../../shared/protocol';
import { Icon } from '../../components/Icon';
import { Button, Modal, TextInput } from '../../components/ui';
import { request } from '../../lib/socket';
import { useToast } from '../../lib/toast';
import { useGame } from '../RoomContext';
import { DinnerSeating, useStartTeamPlay } from './DinnerSeating';
import { nowText } from './nowText';
import { PickMyName } from './SeatsSection';

/**
 * 参加者の「あなた」の帯。自分の表示名・名簿で選んだ名前・夕食のチームと、
 * 「夕食の席」「表示名を変える」をいつでも出せるようにする（リハーサルで、自分がどこの誰として入っているか分からなくなったため）
 */
export function MeBar() {
  const { game, me, room } = useGame<PartyEventView>();
  const startTeamPlay = useStartTeamPlay();
  const [dinnerOpen, setDinnerOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const person = game.seats.myPersonId ? game.seats.roster.find((p) => p.id === game.seats.myPersonId) : null;
  const display = me?.name ?? '';

  // 名前を選んだら、選ぶ画面は閉じる
  useEffect(() => {
    if (person) setPickOpen(false);
  }, [person]);

  // 表紙を軽くするため1行にする。夕食の席・表示名は押したときだけ開く
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1" data-testid="me-bar">
      <p className="text-base font-extrabold">
        {display} さん
        {game.dinner?.myTeam && (
          <span className="ml-2 font-bold text-muted">
            {game.dinner.myTeam}（{game.dinner.myTable}）
          </span>
        )}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-x-3">
        {!person && (
          <Button size="sm" onClick={() => setPickOpen(true)} data-testid="me-pick">
            <Icon name="users" /> 名簿から自分の名前を選ぶ
          </Button>
        )}
        {game.dinner && (
          <button className="min-h-11 text-sm font-bold text-info-ink underline underline-offset-4" onClick={() => setDinnerOpen(true)} data-testid="me-dinner-open">
            夕食の席
          </button>
        )}
        <button className="min-h-11 text-sm font-bold text-info-ink underline underline-offset-4" onClick={() => setRenaming(true)} data-testid="me-rename">
          表示名を変える
        </button>
      </div>

      <Modal open={dinnerOpen} onClose={() => setDinnerOpen(false)}>
        {/* デモでは「このチームでゲームを遊ぶ」を出さない（端末にデモのチーム名が残り、次に作る本物のルームに付くため） */}
        {game.dinner && <DinnerSeating dinner={game.dinner} onTeamPlay={room.demo ? undefined : startTeamPlay} />}
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
  // 大きな箱にせず、細い1行にする（表紙の主役はゲームそのもの）
  return (
    <p className="flex items-center gap-2 rounded-full bg-hi px-4 py-2 text-base font-extrabold text-on-hi" data-testid="now-banner" role="status">
      <Icon name="spark" className="h-5 w-5 shrink-0" />
      {nowText(game)}
    </p>
  );
}
