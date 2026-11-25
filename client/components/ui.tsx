import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';

/* ------------------------------------------------------------------ */
/* Button                                                               */
/* ------------------------------------------------------------------ */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'white';
type Size = 'sm' | 'md' | 'lg' | 'xl';

/** 見た目は index.css の .ui-btn-* とテーマのトークンで決まる（ここには色・角丸・影を書かない） */
const VARIANTS: Record<Variant, string> = {
  primary: 'ui-btn-primary',
  secondary: 'ui-btn-secondary',
  ghost: 'ui-btn-ghost',
  danger: 'ui-btn-danger',
  success: 'ui-btn-success',
  white: 'ui-btn-white',
};

/** いちばん小さいものでも、指で押しやすい高さ（44px）にする */
const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-3.5 py-1 text-sm',
  md: 'min-h-11 px-5 py-1 text-base',
  lg: 'min-h-14 px-6 py-1.5 text-lg',
  xl: 'min-h-16 px-8 py-2 text-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`ui-btn ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                 */
/* ------------------------------------------------------------------ */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`ui-card ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">{children}</h3>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Input                                                                */
/* ------------------------------------------------------------------ */
interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  maxLength: number;
  showCount?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, onEnter, maxLength, showCount = true, className = '', ...rest },
  ref,
) {
  return (
    <div className="relative">
      <input
        ref={ref}
        {...rest}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // IME変換確定の Enter では送信しない
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        autoComplete="off"
        className={`ui-input h-14 w-full px-4 pr-14 text-lg font-bold disabled:opacity-70 ${className}`}
      />
      {showCount && (
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs font-bold text-muted">
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Avatar                                                               */
/* ------------------------------------------------------------------ */
export function Avatar({
  name,
  color,
  size = 'md',
  dim,
  ring,
}: {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  dim?: boolean;
  ring?: boolean;
}) {
  const s = { xs: 'h-6 w-6 text-[11px]', sm: 'h-8 w-8 text-sm', md: 'h-10 w-10 text-base', lg: 'h-14 w-14 text-xl' }[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-[#fff] [text-shadow:0_1px_2px_rgb(0_0_0/0.55)] ${s} ${dim ? 'opacity-40 grayscale' : ''} ${ring ? 'ring-3 ring-fg' : 'ring-1 ring-line'}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {Array.from(name)[0] ?? '?'}
    </span>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`ui-badge inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-extrabold ${className}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // body 直下に出す。登場アニメーション（transform）の付いたカードの中で開くと、
  // fixed がそのカード基準になり、画面全体を覆えなくなるため
  return createPortal(
    <div className="ui-overlay fixed inset-0 z-40 flex items-end justify-center p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className="ui-modal animate-slide-up max-h-[88dvh] w-full max-w-lg overflow-y-auto p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Logo / Layout                                                        */
/* ------------------------------------------------------------------ */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2" aria-label="PartyBox トップへ">
      <img src="/favicon.svg" alt="" className={size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'} />
      <span className={`font-display tracking-wide ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>
        Party<span className="text-accent-ink">Box</span>
      </span>
    </Link>
  );
}

export function FullScreenMessage({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Icon name={icon} className="animate-pop-in h-16 w-16" />
      <h1 className="font-display text-2xl">{title}</h1>
      {children}
    </div>
  );
}
