import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from '../components/Icon';
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
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-md px-4 pt-6 pb-16">
        <Card className="animate-pop-in">
          <Icon name="key" className="h-10 w-10" />
          <h1 className="mt-3 font-display text-3xl">ルームに参加</h1>
          <p className="mt-1 text-base text-muted">教えてもらったルームコード（英数字 6〜8 文字）を入れて、「参加する」を押してください。大文字・小文字はどちらでもかまいません。</p>
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
            className="ui-input mt-6 h-20 w-full text-center font-display text-4xl tracking-[0.3em] uppercase"
          />
          <Button size="xl" block className="mt-5" onClick={go} loading={loading}>
            参加する <Icon name="play" className="h-4 w-4" />
          </Button>
          <p className="mt-6 text-sm text-muted">
            自分でルームを作る場合は{' '}
            <Link to="/" className="font-bold text-accent-ink underline underline-offset-4">
              ゲームを選ぶ
            </Link>
          </p>
        </Card>
      </main>
    </div>
  );
}
