import { DialogBar } from './DialogBar';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, action });
    timer.current = window.setTimeout(() => setMsg(null), action ? 6000 : 3000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {msg && (
          // Dialog-bar skin (D-022). No speaker: toasts can carry plain text (Undo, deleted, errors).
          <DialogBar
            key={msg.id}
            className="toast"
            action={
              msg.action && {
                label: msg.action.label,
                onClick: () => {
                  msg.action?.run();
                  setMsg(null);
                },
              }
            }
          >
            {msg.text}
          </DialogBar>
        )}
      </div>
    </ToastCtx.Provider>
  );
}
