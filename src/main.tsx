import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Brand type, bundled so the app never touches the network.
import '@fontsource/readex-pro/300.css';
import '@fontsource/readex-pro/400.css';
import '@fontsource/readex-pro/500.css';
import '@fontsource/readex-pro/600.css';
import '@fontsource/markazi-text/400.css';
import '@fontsource/markazi-text/500.css';
import '@fontsource/markazi-text/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/onboarding.css';
import './styles/login.css';
import './styles/shell.css';
import './styles/editor.css';
import './styles/views.css';
import './styles/home.css';

import './i18n';
import { ApiError, isTauri } from './lib/api';
import { flushAll } from './lib/saveQueue';
import { useApp } from './store';
import { toast } from './components/Dialogs';
import { ErrorBoundary } from './components/ErrorBoundary';
import i18n from './i18n';
import { App } from './App';

// A desktop app, not a web page: no browser reloads, print, or page navigation.
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  // Inside the vault Ctrl P opens the search (see Shell); elsewhere it would print.
  const print = key === 'p' && (e.shiftKey || useApp.getState().phase !== 'unlocked');
  if (e.key === 'F5' || (ctrl && (key === 'r' || print))) e.preventDefault();
});
document.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest('a[href]');
  if (link) e.preventDefault();
});
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
});

// Actions fired and forgotten in the interface end up here when they fail: say
// so instead of doing nothing. A locked vault is not news, the lock screen is up.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof ApiError && e.reason.code !== 'locked') toast(i18n.t('common.error'));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Closing must not lose the last edits, which wait a moment before being
// written. Two seconds is plenty; a stuck write must not trap the window.
if (isTauri) {
  void getCurrentWindow().onCloseRequested(async () => {
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
    await Promise.race([flushAll().catch(() => undefined), timeout]);
  });
}

// The window starts hidden so it never flashes white; show it once painted.
if (isTauri) {
  requestAnimationFrame(() => void getCurrentWindow().show());
}
