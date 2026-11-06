import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../lib/api';

// Frameless window chrome: a drag strip across the top and the three Windows
// controls on the right. Content underneath stays clickable outside the strip.
export function TitleBar({ drag }: { drag: boolean }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized);
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const win = isTauri ? getCurrentWindow() : null;

  return (
    // Tauri's drag region also maximizes on double-click.
    <div className="titlebar" data-tauri-drag-region={drag || undefined}>
      {win && (
        <div className="window-controls">
          <button className="wc" aria-label={t('window.minimize')} title={t('window.minimize')} onClick={() => void win.minimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M0 5.5h10" stroke="currentColor" />
            </svg>
          </button>
          <button
            className="wc"
            aria-label={maximized ? t('window.restore') : t('window.maximize')}
            title={maximized ? t('window.restore') : t('window.maximize')}
            onClick={() => void win.toggleMaximize()}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                <path d="M2.5 2.5V.5h7v7h-2" />
                <path d="M.5 2.5h7v7h-7z" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                <path d="M.5.5h9v9h-9z" />
              </svg>
            )}
          </button>
          <button className="wc wc-close" aria-label={t('window.close')} title={t('window.close')} onClick={() => void win.close()}>
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor">
              <path d="M.5.5l9 9M9.5.5l-9 9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
