import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api, onLocked } from '../../lib/api';
import { useApp } from '../../store';
import { toast } from '../../components/Dialogs';
import { Sidebar } from './Sidebar';
import { TrashView } from './TrashView';
import { QuickFind } from './QuickFind';
import { Settings } from './Settings';
import { PageView } from '../editor/PageView';
import { Home } from '../home/Home';
import { AllPages } from '../pages/AllPages';
import { Calendar } from '../calendar/Calendar';
import { Tour } from '../tour/Tour';

const ACTIVITY_PING_MS = 20_000;

export function Shell() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const unreadable = useApp((s) => s.unreadable);

  useEffect(() => {
    if (unreadable > 0) toast(t('login.unreadable', { count: unreadable }));
  }, [unreadable, t]);

  // The Rust core locks after inactivity; keep it informed of real use.
  useEffect(() => {
    let last = 0;
    const ping = () => {
      const now = Date.now();
      if (now - last < ACTIVITY_PING_MS) return;
      last = now;
      void api.activity();
    };
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, ping, { passive: true }));
    let unlisten: (() => void) | undefined;
    void onLocked(() => useApp.getState().markLocked('idle')).then((u) => (unlisten = u));
    return () => {
      events.forEach((e) => window.removeEventListener(e, ping));
      unlisten?.();
    };
  }, []);

  // App-wide shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const s = useApp.getState();
      const key = e.key.toLowerCase();
      if (key === 'n' && !e.shiftKey) {
        e.preventDefault();
        void s.createNote();
      } else if (key === 'k' || key === 'p') {
        e.preventDefault();
        s.setFind(!s.findOpen);
      } else if (key === 'l' && !e.shiftKey) {
        e.preventDefault();
        void s.lock();
      } else if (key === '\\') {
        e.preventDefault();
        s.setSidebar(!s.sidebarOpen);
      } else if (key === ',') {
        e.preventDefault();
        s.openSettings('general');
      } else if (key === 'h' && e.shiftKey) {
        e.preventDefault();
        s.open({ kind: 'home' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell" data-sidebar={sidebarOpen}>
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            className="sidebar-wrap"
            initial={{ width: 0 }}
            animate={{ width: 'var(--sidebar-w)' }}
            exit={{ width: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <Sidebar />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="main">
        {view.kind === 'home' && <Home />}
        {view.kind === 'pages' && <AllPages folder={view.folder} />}
        {view.kind === 'calendar' && <Calendar />}
        {view.kind === 'page' && <PageView id={view.id} />}
        {view.kind === 'trash' && <TrashView />}
      </main>
      <QuickFind />
      <Settings />
      <Tour />
    </div>
  );
}

