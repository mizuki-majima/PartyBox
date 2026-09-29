import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef, useEffect } from 'react';
import { Link } from 'react-router';

/* ------------------------------------------------------------------ */
/* Button                                                               */
/* ------------------------------------------------------------------ */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'white';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-pop-pink to-pop-orange text-white shadow-[0_8px_24px_-6px_rgb(255_95_162/0.6)] hover:brightness-110',
  secondary: 'bg-panel-2 text-white ring-1 ring-line hover:bg-panel-3',
  ghost: 'bg-transparent text-muted hover:bg-white/5 hover:text-white',
  danger: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30 hover:bg-rose-500/25',
  success:
    'bg-gradient-to-r from-pop-mint to-pop-sky text-ink shadow-[0_8px_24px_-6px_rgb(62_230_181/0.55)] hover:brightness-110',
  white: 'bg-white text-ink shadow-lg hover:bg-white/90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-xl',
  md: 'h-11 px-5 text-base rounded-2xl',
  lg: 'h-14 px-6 text-lg rounded-2xl',
  xl: 'h-16 px-8 text-xl rounded-3xl',
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
      className={`inline-flex select-none items-center justify-center gap-2 font-extrabold tracking-wide transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
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
    <div className={`rounded-3xl bg-panel/85 p-5 ring-1 ring-line backdrop-blur sm:p-6 ${className}`}>{children}</div>
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
        className={`h-14 w-full rounded-2xl bg-white px-4 pr-14 text-lg font-bold text-ink placeholder:font-medium placeholder:text-slate-400 outline-none ring-4 ring-transparent transition focus:ring-pop-violet/60 disabled:bg-white/70 ${className}`}
      />
      {showCount && (
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs font-bold text-slate-400">
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
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white shadow-inner ${s} ${dim ? 'opacity-40 grayscale' : ''} ${ring ? 'ring-3 ring-white' : ''}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {Array.from(name)[0] ?? '?'}
    </span>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${className}`}>
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
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className="animate-slide-up max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-panel p-5 ring-1 ring-line sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
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
        Party<span className="text-pop-pink">Box</span>
      </span>
    </Link>
  );
}

export function FullScreenMessage({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="animate-pop-in text-6xl">{emoji}</div>
      <h1 className="font-display text-2xl">{title}</h1>
      {children}
    </div>
  );
}
