import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp, type TourId } from '../../store';
import { CAST_NAMES, Portrait, type CastMember } from '../../components/Cast';

// First-run tours. Each step is presented by one of the cast and points at
// the part of the screen it talks about (elements marked with `data-tour`).
// "home" runs right after an account is created; "settings" and "page" the
// first time those screens open. Seen tours are remembered in the vault.

interface Step {
  who: CastMember;
  target: string;
  /** Runs before the step shows, e.g. to switch the settings tab. */
  before?: () => void;
}

const TOURS: Record<TourId, Step[]> = {
  home: [
    { who: 'qalam', target: 'new-page' },
    { who: 'waraqa', target: 'all-pages' },
    { who: 'hibr', target: 'search' },
    { who: 'noon', target: 'journal' },
    { who: 'nuqta', target: 'lock' },
  ],
  settings: [
    { who: 'waraqa', target: 'settings-name', before: () => useApp.getState().openSettings('general') },
    { who: 'noon', target: 'settings-language', before: () => useApp.getState().openSettings('general') },
    { who: 'nuqta', target: 'settings-security' },
    { who: 'hibr', target: 'settings-transfer' },
  ],
  page: [
    { who: 'qalam', target: 'page-title' },
    { who: 'hibr', target: 'page-editor' },
    { who: 'noon', target: 'page-props' },
    { who: 'waraqa', target: 'page-dictation' },
    { who: 'nuqta', target: 'page-actions' },
  ],
};

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_W = 400;
const CARD_H = 250;
const GAP = 18;
const PAD = 5;

function placeCard(box: Box | null): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!box) return { top: vh / 2 - CARD_H / 2, left: vw / 2 - CARD_W / 2 };
  const clampTop = (y: number) => Math.min(Math.max(16, y), vh - CARD_H - 16);
  const clampLeft = (x: number) => Math.min(Math.max(16, x), vw - CARD_W - 16);
  // Beside the target when there is room (sidebar items), else below, else above.
  if (document.documentElement.dir === 'rtl' && box.left - GAP - CARD_W > 16) {
    return { top: clampTop(box.top + box.height / 2 - CARD_H / 2), left: box.left - GAP - CARD_W };
  }
  if (box.left + box.width + GAP + CARD_W < vw - 16) {
    return { top: clampTop(box.top + box.height / 2 - CARD_H / 2), left: box.left + box.width + GAP };
  }
  if (box.top + box.height + GAP + CARD_H < vh - 16) {
    return { top: box.top + box.height + GAP, left: clampLeft(box.left + box.width / 2 - CARD_W / 2) };
  }
  return { top: clampTop(box.top - GAP - CARD_H), left: clampLeft(box.left + box.width / 2 - CARD_W / 2) };
}

export function Tour() {
  const { t } = useTranslation();
  const tourId = useApp((s) => s.tour);
  const endTour = useApp((s) => s.endTour);
  const setSidebar = useApp((s) => s.setSidebar);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const active = tourId !== null;
  const STEPS = tourId ? TOURS[tourId] : TOURS.home;
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const last = index >= STEPS.length - 1;

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step.target]);

  useEffect(() => {
    if (!tourId) return;
    setIndex(0);
    if (tourId === 'home') setSidebar(true);
  }, [tourId, setSidebar]);

  useEffect(() => {
    if (active) step.before?.();
  }, [active, step]);

  // Bring the target into view, then follow it on resize and scroll.
  useLayoutEffect(() => {
    if (!active) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    measure();
    const timer = window.setInterval(measure, 120);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [active, step.target, measure]);

  const next = useCallback(() => (last ? endTour() : setIndex((i) => i + 1)), [last, endTour]);
  const back = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, next, endTour]);

  if (!active) return null;
  const card = placeCard(box);
  const name = CAST_NAMES[step.who];

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('tour.label')}>
      {/* The spotlight: everything dims except the target. */}
      <motion.div
        className="tour-spot"
        initial={false}
        animate={box ? { top: box.top, left: box.left, width: box.width, height: box.height, opacity: 1 } : { opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      />
      {!box && <div className="tour-dim" />}

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          className="tour-card"
          style={{ top: card.top, left: card.left, width: CARD_W }}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="tour-head">
            <motion.div
              className="tour-portrait"
              initial={{ y: 40, rotate: -6 }}
              animate={{ y: 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.08 }}
            >
              <Portrait who={step.who} size={76} />
            </motion.div>
            <div className="tour-who">
              <span className="t-label">
                {String(index + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
              </span>
              <strong>
                {name.latin} <span lang="ar">{name.arabic}</span>
              </strong>
              <span className="tour-role">{t(`tour.roles.${step.who}`)}</span>
            </div>
          </div>

          <p className="tour-text">{t(`tour.${tourId}.${step.who}`)}</p>

          <div className="tour-progress" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.who} data-state={i < index ? 'done' : i === index ? 'current' : 'todo'} />
            ))}
          </div>

          <div className="tour-actions">
            <button className="btn-link muted tour-skip" onClick={endTour}>
              {t('tour.skip')}
            </button>
            {index > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={back}>
                {t('common.back')}
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={next} autoFocus>
              {last ? t(tourId === 'home' ? 'tour.done' : 'tour.gotIt') : t('tour.next')}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
