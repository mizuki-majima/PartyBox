import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { Button, Modal } from '../../components/ui';

/**
 * 参加者の画面の「くわしく」。表紙にはゲームに関係するものだけを大きく出し、
 * 得点・一覧などの詳しいことは、このボタンからモーダルで開く（リハーサルで画面が煩雑だったため）。
 * 中身は開いている間も新しい状態で描き直す。children に関数を渡すと、閉じる関数を受け取れる
 */
export function MoreSheet({
  label,
  title,
  testId,
  children,
}: {
  label: string;
  title: string;
  testId: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        className="ui-tile inline-flex min-h-11 items-center gap-1.5 px-4 text-base font-bold"
        onClick={() => setOpen(true)}
        data-testid={`${testId}-open`}
      >
        <Icon name="search" /> {label}
      </button>
      <Modal open={open} onClose={close}>
        <h2 className="mb-3 font-display text-xl">{title}</h2>
        {typeof children === 'function' ? children(close) : children}
        <Button variant="secondary" block className="mt-4" onClick={close} data-testid={`${testId}-close`}>
          閉じる
        </Button>
      </Modal>
    </>
  );
}

/** 表紙の下に並べる「くわしく」のボタンの列 */
export function MoreRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-2 pt-1">{children}</div>;
}
