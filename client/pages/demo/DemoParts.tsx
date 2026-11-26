/**
 * デモ（/demo/<id>）の部品。懇親会のデモと、通常のゲームを1人で試すデモで共通に使う
 */
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { useToast } from '../../lib/toast';

/** 1台ぶんの画面（本物の画面を iframe で出す） */
export function Frame({
  label,
  title,
  src,
  className = '',
  frameClassName = '',
}: {
  label: string;
  title: string;
  src: string;
  className?: string;
  frameClassName?: string;
}) {
  return (
    <figure className={`min-w-0 ${className}`}>
      <figcaption className="mb-1.5 border-t-4 border-line px-1 pt-1 text-sm font-extrabold">{label}</figcaption>
      <iframe
        src={src}
        title={title}
        className={`block w-full bg-bg ring-1 ring-line ${frameClassName}`}
        data-testid={`demo-frame-${title}`}
      />
    </figure>
  );
}

/** 手元のスマホからもデモのルームに入れるように（入った人は参加者として加わる） */
export function JoinQr({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const url = `${location.origin}/room/${code}`;
  const [qr, setQr] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0f0c24', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('招待URLをコピーしました', 'success');
    } catch {
      toast('コピーできませんでした', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="font-display text-xl">スマホで参加する</h2>
      <p className="mt-1 text-sm text-muted">読み取ると、このデモに参加者として加わります。</p>
      {qr && <img src={qr} alt="デモのルームの招待QRコード" className="mx-auto mt-4 w-56 border border-line bg-[#fff] p-2" />}
      <p className="mt-3 text-center font-display text-2xl tracking-[0.15em]">{code}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={copy}>
          URLをコピー
        </Button>
        <Button onClick={onClose}>閉じる</Button>
      </div>
    </Modal>
  );
}
