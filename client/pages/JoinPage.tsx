import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, Logo } from '../components/ui';
import { request } from '../lib/socket';
import { useToast } from '../lib/toast';

/** ルームコードを入力して参加する（名前はルーム画面で入力） */
export function JoinPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const go = async () => {
    const c = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (c.length < 4) {
      toast('ルームコードを入力してください', 'error');
      return;
    }
    setLoading(true);
    const res = await request('room:check', { code: c });
    setLoading(false);
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    navigate(`/room/${c}`);
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-md px-4 pt-6 pb-16">
        <Card className="animate-pop-in text-center">
          <div className="text-5xl">🔑</div>
          <h1 className="mt-3 font-display text-2xl">ルームに参加</h1>
          <p className="mt-1 text-sm text-muted">友達から教えてもらった6桁のコードを入力</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && go()}
            placeholder="AB12CD"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            aria-label="ルームコード"
            className="mt-6 h-20 w-full rounded-2xl bg-white text-center font-display text-4xl tracking-[0.3em] text-ink uppercase outline-none ring-4 ring-transparent placeholder:text-slate-300 focus:ring-pop-violet/60"
          />
          <Button size="xl" block className="mt-5" onClick={go} loading={loading}>
            参加する →
          </Button>
          <p className="mt-6 text-sm text-muted">
            自分でルームを作る場合は{' '}
            <Link to="/" className="font-bold text-pop-sky underline underline-offset-4">
              ゲームを選ぶ
            </Link>
          </p>
        </Card>
      </main>
    </div>
  );
}
