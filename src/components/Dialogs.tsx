import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';

// Branded replacements for window.confirm / alert, which the webview would
// otherwise render as plain system boxes.

interface ConfirmRequest {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface Toast {
  id: number;
  message: string;
}

interface DialogState {
  confirm: ConfirmRequest | null;
  toasts: Toast[];
}

const useDialogs = create<DialogState>(() => ({ confirm: null, toasts: [] }));

export function confirmDialog(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.setState({ confirm: { message, ...opts, resolve } });
  });
}

let nextToast = 1;
export function toast(message: string) {
  const id = nextToast++;
  useDialogs.setState((s) => ({ toasts: [...s.toasts, { id, message }] }));
  window.setTimeout(() => useDialogs.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200);
}

export function DialogHost() {
  const { t } = useTranslation();
  const confirm = useDialogs((s) => s.confirm);
  const toasts = useDialogs((s) => s.toasts);
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback(
    (ok: boolean) => {
      confirm?.resolve(ok);
      useDialogs.setState({ confirm: null });
    },
    [confirm],
  );

  useEffect(() => {
    if (!confirm) return;
    // Enter on a destructive question must not destroy anything.
    (confirm.danger ? cancelRef : okRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        settle(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirm, settle]);

  return (
    <>
      <AnimatePresence>
        {confirm && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={(e) => e.target === e.currentTarget && settle(false)}
          >
            <motion.div
              className="dialog confirm"
              role="alertdialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <p>{confirm.message}</p>
              <div className="dialog-actions">
                <button ref={cancelRef} className="btn btn-ghost" onClick={() => settle(false)}>
                  {t('common.cancel')}
                </button>
                <button ref={okRef} className={confirm.danger ? 'btn btn-danger-solid' : 'btn btn-primary'} onClick={() => settle(true)}>
                  {confirm.confirmLabel ?? t('common.continue')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((x) => (
            <motion.div
              key={x.id}
              className="toast"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
            >
              {x.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
