import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { GAMES, type GameMeta, type GameSettingDef, getGameMeta, isEventGame } from '../../shared/games';
import { LIMITS } from '../../shared/protocol';
import { GameEmblem, Icon } from '../components/Icon';
import { Avatar, Badge, Button, Card, Modal, SectionTitle, TextInput } from '../components/ui';
import { useRoomContext } from '../games/RoomContext';
import { loadSession, setLastName } from '../lib/session';
import { request } from '../lib/socket';
import { GameGuide } from '../guides';
import { useToast } from '../lib/toast';
import { themeOfGame } from '../themes';

/**
 * 司会用URL。懇親会のような催し物のルームを作ったときだけ出る。
 * これを開いた人が進行役になるので、司会の方だけに渡すこと。
 */
export function HostUrl() {
  const { room, isHost } = useRoomContext();
  const { hostToken: urlToken } = useParams();
  const toast = useToast();
  // 司会用URLから入った直後は、保存した参加情報にまだ合言葉が入っていないので、開いているURLのものを使う
  const token = loadSession(room.code)?.hostToken ?? (isHost ? urlToken : undefined);
  if (!token) return null;
  const url = `${location.origin}/room/${room.code}/h/${token}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('司会用URLをコピーしました', 'success');
    } catch {
      toast('コピーできませんでした');
    }
  };
  return (
    <div className="ui-tile relative mt-5 p-4">
      <p className="text-xs font-extrabold tracking-[0.2em] text-warn-ink uppercase">
        <Icon name="crown" className="mr-1 inline-block h-[1.2em] w-[1.2em] align-[-0.2em]" />
        司会用URL
      </p>
      <p className="mt-1 text-xs text-fg/70">
        これを開いた人が進行できます。<strong className="text-warn-ink">司会の方にだけ</strong>渡してください。
        別の端末で開いても、回線が切れても司会のままです。
      </p>
      <div className="ui-tile mt-2 flex items-center gap-2 p-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-fg/80" data-testid="host-url">
          {url}
        </span>
        <Button size="sm" variant="white" onClick={copy}>
          コピー
        </Button>
      </div>
    </div>
  );
}

/** ロビー（ゲーム開始前の待機画面） */
export function Lobby() {
  const { room, isHost } = useRoomContext();
  const meta = getGameMeta(room.gameId)!;
  return (
    // スマホでは「招待 → 参加者 → 設定 → 遊び方」の順、PCでは2カラム
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-5">
      <div className="contents min-w-0 lg:flex lg:flex-col lg:gap-5">
        <div className="order-1 min-w-0">
          <InviteCard />
        </div>
        {/* 懇親会の参加者は待つだけなので、遊び方をいちばん上に出す（招待や設定より先に読めるように） */}
        <div className={`min-w-0 ${isEventGame(room.gameId) && !room.youAreHost ? "-order-1" : "order-4"}`}>
          <GameInfoCard meta={meta} />
        </div>
      </div>
      <div className="contents min-w-0 lg:flex lg:flex-col lg:gap-5">
        <div className="order-2 min-w-0">
          <PlayersCard meta={meta} />
        </div>
        <div className="order-3 min-w-0">
          <SettingsCard meta={meta} />
        </div>
        {isHost && (
          <div className="order-5">
            <DangerZone />
          </div>
        )}
      </div>
      <StartBar meta={meta} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function InviteCard() {
  const { room } = useRoomContext();
  const toast = useToast();
  const url = `${location.origin}/room/${room.code}`;
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0f0c24', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label}をコピーしました`, 'success');
    } catch {
      toast('コピーできませんでした。長押しで選択してください', 'error');
    }
  };
  const share = async () => {
    const meta = getGameMeta(room.gameId)!;
    try {
      await navigator.share({ title: 'PartyBox', text: `「${meta.title}」で遊ぼう！ ルームコード: ${room.code}`, url });
    } catch {
      /* キャンセル */
    }
  };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <Card className="animate-slide-up relative overflow-hidden">
      <SectionTitle>友達を招待</SectionTitle>
      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-muted">ROOM CODE</p>
          <button
            onClick={() => copy(room.code, 'ルームコード')}
            className="font-display text-5xl tracking-[0.12em] sm:text-6xl"
            data-testid="room-code"
          >
            {room.code}
          </button>
        </div>
        {qr && (
          <button onClick={() => setShowQr(true)} className="hidden shrink-0 border border-line bg-[#fff] p-1.5 sm:block" title="QRコードを拡大">
            <img src={qr} alt="招待QRコード" className="h-24 w-24" />
          </button>
        )}
      </div>
      <p className="mt-4 text-xs font-extrabold text-muted">招待URL</p>
      <div className="ui-tile mt-1 flex items-center gap-2 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg/85" data-testid="invite-url">
          {url}
        </span>
        <Button size="sm" variant="white" onClick={() => copy(url, '招待URL')}>
          コピー
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
        {canShare ? (
          <Button variant="secondary" className="whitespace-nowrap" onClick={share}>
            <Icon name="share" /> 共有
          </Button>
        ) : (
          <Button variant="secondary" className="whitespace-nowrap" onClick={() => copy(url, '招待URL')}>
            <Icon name="link" /> コピー
          </Button>
        )}
        <Button variant="secondary" className="whitespace-nowrap" onClick={() => setShowQr(true)} disabled={!qr}>
          <Icon name="qr" /> QRコード
        </Button>
      </div>
      <HostUrl />
      <Modal open={showQr} onClose={() => setShowQr(false)}>
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-display text-xl">スマホで読み取って参加</h2>
          {qr && <img src={qr} alt="招待QRコード" className="w-64 border border-line bg-[#fff] p-2" />}
          <p className="font-display text-3xl tracking-[0.15em]">{room.code}</p>
          <Button variant="secondary" onClick={() => setShowQr(false)}>
            閉じる
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function PlayersCard({ meta }: { meta: GameMeta }) {
  const { room, isHost } = useRoomContext();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [kicking, setKicking] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');

  const kick = async (id: string) => {
    const res = await request('room:kick', { playerId: id });
    if (!res.ok) toast(res.error, 'error');
  };
  const rename = async () => {
    const res = await request('room:rename', { name });
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    setLastName(name.trim());
    setRenaming(false);
  };

  return (
    <Card className="animate-slide-up">
      <SectionTitle
        right={
          <span className="text-sm font-bold text-fg/80">
            <span className="font-display text-lg text-ok-ink" data-testid="player-count">
              {room.players.length}
            </span>{' '}
            / {meta.maxPlayers}人
          </span>
        }
      >
        参加者
      </SectionTitle>
      <ul className="grid gap-2 sm:grid-cols-2" data-testid="player-list">
        {room.players.map((p) => {
          const isMe = p.id === room.youId;
          return (
            <li
              key={p.id}
              className={`ui-tile animate-pop-in flex items-center gap-3 p-2.5 pr-3 ${isMe ? 'bg-fg/10' : ''}`}
            >
              <div className="relative">
                <Avatar name={p.name} color={p.color} dim={!p.connected} />
                <span
                  className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-panel ${p.connected ? 'bg-ok' : 'bg-muted'}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">
                  {p.isHost && (
                    <span title="ホスト">
                      <Icon name="crown" className="mr-1 inline-block h-[1em] w-[1em] align-[-0.1em]" />
                    </span>
                  )}
                  {p.name}
                </p>
                <p className="text-xs text-muted">
                  {isMe ? 'あなた' : p.connected ? '参加中' : 'オフライン'}
                  {p.isHost && ' ・ ホスト'}
                </p>
              </div>
              {isMe && (
                <button
                  className="text-xs font-bold text-muted hover:text-fg"
                  onClick={() => {
                    setName(p.name);
                    setRenaming(true);
                  }}
                >
                  名前変更
                </button>
              )}
              {isHost && !isMe && (
                <button
                  // 懇親会は数十人が並ぶので、押し間違いで外さないように確かめる
                  onClick={() => (isEventGame(room.gameId) ? setKicking({ id: p.id, name: p.name }) : kick(p.id))}
                  data-testid="kick-player"
                  className="flex h-11 w-11 items-center justify-center text-muted hover:text-danger-ink"
                  aria-label={`${p.name}さんを退出させる`}
                  title={`${p.name}さんを退出させる`}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
        {Array.from({ length: Math.max(0, meta.minPlayers - room.players.length) }, (_, i) => (
          <li key={`empty-${i}`} className="flex items-center gap-3 border-2 border-dashed border-line p-2.5 text-sm text-muted">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fg/5">？</span>
            招待を待っています
          </li>
        ))}
      </ul>
      <Modal open={kicking !== null} onClose={() => setKicking(null)}>
        <h2 className="font-display text-xl">{kicking?.name} さんをルームから外しますか？</h2>
        <p className="mt-2 text-sm text-fg/80">外された人は、参加用のQR・URLからもう一度入れます。</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setKicking(null)}>
            やめる
          </Button>
          <Button
            variant="danger"
            size="lg"
            data-testid="kick-confirm"
            onClick={async () => {
              const id = kicking?.id;
              setKicking(null);
              if (id) await kick(id);
            }}
          >
            外す
          </Button>
        </div>
      </Modal>
      <Modal open={renaming} onClose={() => setRenaming(false)}>
        <h2 className="font-display text-xl">名前を変更</h2>
        <div className="mt-4">
          <TextInput value={name} onChange={setName} onEnter={rename} maxLength={LIMITS.nameLength} autoFocus />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setRenaming(false)}>
            キャンセル
          </Button>
          <Button size="lg" onClick={rename}>
            変更する
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function GameInfoCard({ meta }: { meta: GameMeta }) {
  const { isHost, room } = useRoomContext();
  const [picking, setPicking] = useState(false);
  const toast = useToast();
  const change = async (id: string) => {
    const res = await request('room:changeGame', { gameId: id as GameMeta['id'] });
    if (!res.ok) toast(res.error, 'error');
    else setPicking(false);
  };
  return (
    <Card className="animate-slide-up overflow-hidden !p-0">
      <div className="theme-swatch flex items-center gap-4 border-b border-line p-5" data-theme={themeOfGame(meta.id)}>
        <GameEmblem id={meta.id} className="h-16 w-20" />
        <div className="min-w-0 flex-1">
          <Badge className="bg-fg text-bg">{meta.category}</Badge>
          <h2 className="mt-1 font-display text-2xl" data-testid="lobby-game-title">
            {meta.title}
          </h2>
          <p className="text-sm font-bold text-fg/85">
            <Icon name="users" className="mr-1 inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            {meta.minPlayers}〜{meta.maxPlayers}人 ・ <Icon name="clock" className="mr-1 inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            {meta.estimatedTime}
          </p>
        </div>
        {/* 催し物のルームは、他のゲームに変えると進行中の内容が消えるので変更させない */}
        {isHost && !isEventGame(room.gameId) && (
          <Button variant="white" size="sm" onClick={() => setPicking(true)}>
            変更
          </Button>
        )}
      </div>
      <div className="p-5">
        <SectionTitle>遊び方</SectionTitle>
        {/* 始まる前に読んでおけるように、くわしい説明を出す（懇親会は、司会と参加者で中身を変える） */}
        <GameGuide gameId={meta.id} isHost={room.youAreHost} />
      </div>
      <Modal open={picking} onClose={() => setPicking(false)}>
        <h2 className="font-display text-xl">ゲームを変更</h2>
        <div className="mt-4 grid gap-2">
          {GAMES.map((g) => {
            const tooMany = room.players.length > g.maxPlayers;
            return (
              <button
                key={g.id}
                disabled={tooMany}
                onClick={() => change(g.id)}
                className={`ui-tile flex items-center gap-3 p-3 text-left transition disabled:opacity-40 ${g.id === meta.id ? 'bg-fg/12' : 'hover:bg-fg/10'}`}
              >
                <span data-theme={themeOfGame(g.id)} className="theme-swatch flex h-12 w-14 shrink-0 items-center justify-center border border-line">
                  <GameEmblem id={g.id} className="h-9 w-11" />
                </span>
                <span className="flex-1">
                  <span className="block font-extrabold">{g.title}</span>
                  <span className="text-xs text-muted">
                    {g.category} ・ {g.minPlayers}〜{g.maxPlayers}人 ・ {g.estimatedTime}
                    {tooMany && ' ・ 人数オーバー'}
                  </span>
                </span>
                {g.id === meta.id && <span className="text-xs font-bold text-ok-ink">選択中</span>}
              </button>
            );
          })}
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function SettingsCard({ meta }: { meta: GameMeta }) {
  const { room, isHost } = useRoomContext();
  const toast = useToast();
  const update = async (def: GameSettingDef, value: number | string) => {
    const res = await request('room:settings', { settings: { ...room.settings, [def.key]: value } });
    if (!res.ok) toast(res.error, 'error');
  };
  if (meta.settings.length === 0) return null;
  return (
    <Card className="animate-slide-up">
      <SectionTitle right={!isHost && <span className="text-xs text-muted">ホストが設定します</span>}>ゲーム設定</SectionTitle>
      <div className="space-y-4">
        {meta.settings.map((def) => (
          <div key={def.key}>
            <p className="mb-2 text-sm font-extrabold">{def.label}</p>
            <div className="flex flex-wrap gap-2">
              {def.options.map((o) => {
                const selected = room.settings[def.key] === o.value;
                return (
                  <button
                    key={String(o.value)}
                    disabled={!isHost}
                    aria-pressed={selected}
                    onClick={() => update(def, o.value)}
                    className={`min-h-11 rounded-xl px-3.5 py-2 text-sm font-extrabold transition ${
                      selected ? 'bg-fg text-bg ring-1 ring-line' : isHost ? 'bg-panel ring-1 ring-line' : 'bg-panel text-muted ring-1 ring-line'
                    } ${!isHost ? 'cursor-default' : ''}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {def.description && <p className="mt-1.5 text-xs text-muted">{def.description}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function DangerZone() {
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <>
      <div className="text-center">
        <button className="inline-flex min-h-11 items-center gap-1 px-3 text-sm font-bold text-danger-ink underline underline-offset-4" onClick={() => setConfirm(true)}>
          <Icon name="trash" /> ルームを削除
        </button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)}>
        <h2 className="font-display text-xl">ルームを削除しますか？</h2>
        <p className="mt-2 text-sm text-muted">参加者全員がルームから退出します。</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => setConfirm(false)}>
            キャンセル
          </Button>
          <Button
            variant="danger"
            size="lg"
            onClick={async () => {
              const res = await request('room:close', {});
              if (!res.ok) toast(res.error, 'error');
            }}
          >
            削除する
          </Button>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 画面下に固定する開始ボタン（スマホでも常に見える）                        */
/* ------------------------------------------------------------------ */
function StartBar({ meta }: { meta: GameMeta }) {
  const { room, isHost } = useRoomContext();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const connected = room.players.filter((p) => p.connected).length;
  const need = meta.minPlayers - connected;
  const host = room.players.find((p) => p.isHost);

  const start = async () => {
    setLoading(true);
    const res = await request('room:start', {});
    setLoading(false);
    if (!res.ok) toast(res.error, 'error');
  };

  return (
    <div className="ui-bar fixed inset-x-0 bottom-0 z-20 border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-edge="bottom">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        {isHost ? (
          <>
            <p className="hidden flex-1 text-sm font-bold text-fg/80 sm:block">
              {need > 0 ? `あと${need}人集まると始められます` : '全員そろったら「ゲーム開始」！'}
            </p>
            <Button size="xl" className="flex-1 sm:flex-none sm:px-12" onClick={start} disabled={need > 0} loading={loading} data-testid="start-game">
              {need > 0 ? (
                `あと${need}人必要です`
              ) : (
                <>
                  ゲーム開始 <Icon name="play" className="h-4 w-4" />
                </>
              )}
            </Button>
          </>
        ) : (
          <p className="flex flex-1 items-center justify-center gap-2 py-3 text-center font-bold text-fg/85">
            <span className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent2 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-hi [animation-delay:240ms]" />
            </span>
            {host ? `${host.name}さん（ホスト）の開始を待っています` : 'ゲーム開始を待っています'}
          </p>
        )}
      </div>
    </div>
  );
}
