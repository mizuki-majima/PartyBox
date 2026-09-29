import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

type ToastKind = 'error' | 'info' | 'success';
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-slide-up pointer-events-auto max-w-md rounded-2xl px-5 py-3 text-center text-sm font-bold shadow-2xl ${
              t.kind === 'error'
                ? 'bg-rose-500 text-white'
                : t.kind === 'success'
                  ? 'bg-emerald-400 text-emerald-950'
                  : 'bg-white text-ink'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
