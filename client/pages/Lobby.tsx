import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { GAMES, type GameMeta, type GameSettingDef, getGameMeta } from '../../shared/games';
import { LIMITS } from '../../shared/protocol';
import { Avatar, Badge, Button, Card, Modal, SectionTitle, TextInput } from '../components/ui';
import { useRoomContext } from '../games/RoomContext';
import { setLastName } from '../lib/session';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';

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
        <div className="order-4 min-w-0">
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
      <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-pop-pink/20 blur-2xl" />
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
          <button onClick={() => setShowQr(true)} className="hidden shrink-0 rounded-2xl bg-white p-1.5 sm:block" title="QRコードを拡大">
            <img src={qr} alt="招待QRコード" className="h-24 w-24" />
          </button>
        )}
      </div>
      <p className="mt-4 text-xs font-extrabold text-muted">招待URL</p>
      <div className="mt-1 flex items-center gap-2 rounded-2xl bg-black/25 p-1.5 pl-4 ring-1 ring-line">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-white/85" data-testid="invite-url">
          {url}
        </span>
        <Button size="sm" variant="white" onClick={() => copy(url, '招待URL')}>
          コピー
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
        {canShare ? (
          <Button variant="secondary" className="whitespace-nowrap" onClick={share}>
            📤 共有
          </Button>
        ) : (
          <Button variant="secondary" className="whitespace-nowrap" onClick={() => copy(url, '招待URL')}>
            🔗 コピー
          </Button>
        )}
        <Button variant="secondary" className="whitespace-nowrap" onClick={() => setShowQr(true)} disabled={!qr}>
          📱 QRコード
        </Button>
      </div>
      <Modal open={showQr} onClose={() => setShowQr(false)}>
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-display text-xl">スマホで読み取って参加</h2>
          {qr && <img src={qr} alt="招待QRコード" className="w-64 rounded-2xl bg-white p-2" />}
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
          <span className="text-sm font-bold text-white/80">
            <span className="font-display text-lg text-pop-mint" data-testid="player-count">
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
              className={`animate-pop-in flex items-center gap-3 rounded-2xl p-2.5 pr-3 ring-1 ${isMe ? 'bg-white/10 ring-white/20' : 'bg-white/4 ring-line'}`}
            >
              <div className="relative">
                <Avatar name={p.name} color={p.color} dim={!p.connected} />
                <span
                  className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-panel ${p.connected ? 'bg-emerald-400' : 'bg-slate-500'}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">
                  {p.isHost && <span title="ホスト">👑 </span>}
                  {p.name}
                </p>
                <p className="text-xs text-muted">
                  {isMe ? 'あなた' : p.connected ? '参加中' : 'オフライン'}
                  {p.isHost && ' ・ ホスト'}
                </p>
              </div>
              {isMe && (
                <button
                  className="text-xs font-bold text-muted hover:text-white"
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
                  onClick={() => kick(p.id)}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-rose-500/20 hover:text-rose-200"
                  title={`${p.name}さんを退出させる`}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
        {Array.from({ length: Math.max(0, meta.minPlayers - room.players.length) }, (_, i) => (
          <li key={`empty-${i}`} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 p-2.5 text-sm text-muted">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">？</span>
            招待を待っています
          </li>
        ))}
      </ul>
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
      <div className="flex items-center gap-4 p-5" style={{ background: `linear-gradient(135deg, ${meta.theme.from}, ${meta.theme.to})` }}>
        <span className="text-5xl drop-shadow-lg">{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <Badge className="bg-black/25">{meta.category}</Badge>
          <h2 className="mt-1 font-display text-2xl" data-testid="lobby-game-title">
            {meta.title}
          </h2>
          <p className="text-sm font-bold text-white/85">
            👥 {meta.minPlayers}〜{meta.maxPlayers}人 ・ ⏱ {meta.estimatedTime}
          </p>
        </div>
        {isHost && (
          <Button variant="white" size="sm" onClick={() => setPicking(true)}>
            変更
          </Button>
        )}
      </div>
      <div className="p-5">
        <SectionTitle>遊び方</SectionTitle>
        <ol className="space-y-2 text-sm text-white/85">
          {meta.howToPlay.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-extrabold text-pop-yellow">{i + 1}.</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
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
                className={`flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition disabled:opacity-40 ${g.id === meta.id ? 'bg-white/12 ring-white/30' : 'bg-white/5 ring-line hover:bg-white/10'}`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl" style={{ background: `linear-gradient(135deg, ${g.theme.from}, ${g.theme.to})` }}>
                  {g.emoji}
                </span>
                <span className="flex-1">
                  <span className="block font-extrabold">{g.title}</span>
                  <span className="text-xs text-muted">
                    {g.category} ・ {g.minPlayers}〜{g.maxPlayers}人 ・ {g.estimatedTime}
                    {tooMany && ' ・ 人数オーバー'}
                  </span>
                </span>
                {g.id === meta.id && <span className="text-xs font-bold text-pop-mint">選択中</span>}
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
                    onClick={() => update(def, o.value)}
                    className={`rounded-xl px-3.5 py-2 text-sm font-extrabold transition ${
                      selected ? 'bg-white text-ink shadow' : isHost ? 'bg-white/6 text-white/80 ring-1 ring-line hover:bg-white/12' : 'bg-white/4 text-white/40'
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
        <button className="text-sm font-bold text-rose-300/80 hover:text-rose-200" onClick={() => setConfirm(true)}>
          🗑 ルームを削除
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
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/85 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        {isHost ? (
          <>
            <p className="hidden flex-1 text-sm font-bold text-white/80 sm:block">
              {need > 0 ? `あと${need}人集まると始められます` : '全員そろったら「ゲーム開始」！'}
            </p>
            <Button size="xl" className="flex-1 sm:flex-none sm:px-12" onClick={start} disabled={need > 0} loading={loading} data-testid="start-game">
              {need > 0 ? `あと${need}人必要です` : '🚀 ゲーム開始'}
            </Button>
          </>
        ) : (
          <p className="flex flex-1 items-center justify-center gap-2 py-3 text-center font-bold text-white/85">
            <span className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-pop-pink" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-pop-orange [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-pop-yellow [animation-delay:240ms]" />
            </span>
            {host ? `${host.name}さん（ホスト）の開始を待っています` : 'ゲーム開始を待っています'}
          </p>
        )}
      </div>
    </div>
  );
}
