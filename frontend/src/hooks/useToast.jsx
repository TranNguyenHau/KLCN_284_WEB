import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { BellRing, Check, Info, TriangleAlert, X } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';

const ToastContext = createContext(null);
const NOOP = { toasts: [], push: () => {}, dismiss: () => {} };

const TONES = {
  info: { icon: Info, ring: 'border-line', badge: 'bg-raised text-muted' },
  success: { icon: Check, ring: 'border-up/40', badge: 'bg-up/15 text-up' },
  warn: { icon: BellRing, ring: 'border-warn/45', badge: 'bg-warn/15 text-warn' },
  error: { icon: TriangleAlert, ring: 'border-down/45', badge: 'bg-down/15 text-down' }
};

export function ToastProvider({ children }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const push = useCallback(
    ({ title, description, tone = 'info', duration = 6000, action }) => {
      const id = (nextId.current += 1);
      setToasts((list) => [...list, { id, title, description, tone, action }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-5" role="region" aria-live="polite" aria-label={t('a11y.notifications')}>
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] || TONES.info;
          const Icon = tone.icon;
          return (
            <div key={toast.id} className={`glass fade-in-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 ${tone.ring}`}>
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${tone.badge}`}>
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-xs text-muted">{toast.description}</p>}
                {toast.action}
              </div>
              <button className="btn-icon btn btn-ghost -mr-1 -mt-1 px-1.5 py-1.5" onClick={() => dismiss(toast.id)} aria-label={t('a11y.dismissNotification')}>
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext) || NOOP;
