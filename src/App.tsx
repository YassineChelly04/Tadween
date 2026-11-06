import { useEffect, useLayoutEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp, type Phase } from './store';
import { layoutDir } from './lib/direction';
import { TitleBar } from './components/TitleBar';
import { DialogHost } from './components/Dialogs';
import { Onboarding } from './features/onboarding/Onboarding';
import { Login } from './features/login/Login';
import { Shell } from './features/shell/Shell';

/**
 * Lives inside each screen, so a screen fading out keeps its layout and the
 * direction changes only when the next one arrives.
 */
function LayoutDirection({ phase }: { phase: Phase }) {
  const language = useApp((s) => s.prefs.language);
  useLayoutEffect(() => {
    document.documentElement.dir = layoutDir(language, phase);
  }, [language, phase]);
  return null;
}

export function App() {
  const phase = useApp((s) => s.phase);

  useEffect(() => {
    void useApp.getState().boot();
  }, []);

  return (
    <>
      <TitleBar drag={phase !== 'unlocked'} />
      <AnimatePresence mode="wait">
        {phase !== 'boot' && (
          <motion.div
            key={phase}
            className="phase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <LayoutDirection phase={phase} />
            {phase === 'onboarding' && <Onboarding />}
            {phase === 'signup' && <Onboarding signup />}
            {phase === 'locked' && <Login />}
            {phase === 'unlocked' && <Shell />}
          </motion.div>
        )}
      </AnimatePresence>
      <DialogHost />
    </>
  );
}
