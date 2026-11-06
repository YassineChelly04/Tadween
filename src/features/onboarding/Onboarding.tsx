import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Circle, Copy, Eye, EyeOff, HardDrive, KeyRound, LockKeyhole } from 'lucide-react';
import { api, ApiError, type Theme } from '../../lib/api';
import { checkPassword } from '../../lib/password';
import { useApp } from '../../store';
import { Mark } from '../../components/Logo';
import { Characters } from '../login/Characters';
import { LanguageList } from '../../components/LanguagePicker';

const ALL_STEPS = ['welcome', 'language', 'appearance', 'privacy', 'password', 'recovery', 'name', 'hello'] as const;
type Step = (typeof ALL_STEPS)[number];
// Adding an account from the login screen skips the first-run introduction.
const SIGNUP_STEPS: readonly Step[] = ['password', 'recovery', 'name', 'hello'];
const GREETINGS = [
  { text: 'Hello', lang: 'en' },
  { text: 'مرحبًا', lang: 'ar' },
  { text: 'Bonjour', lang: 'fr' },
];

const ease = [0.16, 1, 0.3, 1] as const;

export function Onboarding({ signup = false }: { signup?: boolean }) {
  const { t } = useTranslation();
  const cancelSignup = useApp((s) => s.cancelSignup);
  const STEPS = signup ? SIGNUP_STEPS : ALL_STEPS;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const step: Step = STEPS[index];

  const go = (delta: number) => {
    setDirection(delta);
    setIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));
  };

  // The vault exists from the password step on: no way back past it.
  const canGoBack = index > 0 && index < STEPS.indexOf('recovery');
  const canCancel = signup && step === 'password';
  const showChrome = step !== 'welcome' && step !== 'hello';
  const dots = signup ? STEPS.slice(0, -1) : STEPS.slice(1, -1);
  const dotIndex = signup ? index : index - 1;

  return (
    <div className="onboarding">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={step}
          className="ob-step"
          custom={direction}
          initial={{ opacity: 0, x: 28 * direction, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: -28 * direction, filter: 'blur(6px)' }}
          transition={{ duration: 0.42, ease }}
        >
          {step === 'welcome' && <Welcome onNext={() => go(1)} />}
          {step === 'language' && <LanguageStep />}
          {step === 'appearance' && <AppearanceStep />}
          {step === 'privacy' && <PrivacyStep />}
          {step === 'password' && (
            <PasswordStep
              onCreated={(key) => {
                setRecoveryKey(key);
                go(1);
              }}
            />
          )}
          {step === 'recovery' && recoveryKey && <RecoveryStep recoveryKey={recoveryKey} onNext={() => go(1)} />}
          {step === 'name' && <NameStep onNext={() => go(1)} />}
          {step === 'hello' && <HelloStep />}
        </motion.div>
      </AnimatePresence>

      {showChrome && (
        <footer className="ob-footer">
          <div className="ob-footer-side">
            {canGoBack && (
              <button className="btn btn-ghost" onClick={() => go(-1)}>
                {t('common.back')}
              </button>
            )}
            {canCancel && (
              <button className="btn btn-ghost" onClick={cancelSignup}>
                {t('common.cancel')}
              </button>
            )}
          </div>
          <div className="ob-dots" aria-label={t('onboarding.step', { n: dotIndex + 1, total: dots.length })}>
            {dots.map((s, i) => (
              <span key={s} className="ob-dot" data-state={i < dotIndex ? 'done' : i === dotIndex ? 'current' : 'todo'} />
            ))}
          </div>
          <div className="ob-footer-side end">
            {index < STEPS.indexOf('password') && (
              <button className="btn btn-primary" onClick={() => go(1)} autoFocus>
                {t('common.continue')}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function StepHeader({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <header className="ob-header">
      {icon}
      <h1 className="t-display ob-title">{title}</h1>
      {body && <p className="ob-body">{body}</p>}
    </header>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

function Welcome({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setI((x) => (x + 1) % GREETINGS.length), 2200);
    return () => window.clearInterval(id);
  }, []);

  const g = GREETINGS[i];
  return (
    <div className="ob-welcome">
      <Mark size={72} animate />
      <div className="ob-hello" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.span
            key={g.text}
            lang={g.lang}
            dir="auto"
            className="t-display"
            initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, filter: 'blur(8px)' }}
            transition={{ duration: 0.6, ease }}
          >
            {g.text}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.div
        className="ob-welcome-copy"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.6, ease }}
      >
        <p className="ob-body">{t('onboarding.welcome.body')}</p>
        <button className="btn btn-primary btn-lg" onClick={onNext} autoFocus>
          {t('onboarding.welcome.cta')}
        </button>
      </motion.div>
    </div>
  );
}

function LanguageStep() {
  const { t } = useTranslation();
  return (
    <div className="ob-panel">
      <StepHeader title={t('onboarding.language.title')} body={t('onboarding.language.body')} />
      <LanguageList />
    </div>
  );
}

const THEMES: Theme[] = ['day', 'light', 'dark', 'system'];

export function ThemePicker() {
  const { t } = useTranslation();
  const theme = useApp((s) => s.prefs.theme);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <div className="theme-picker" role="radiogroup" aria-label={t('settings.theme')}>
      {THEMES.map((th) => (
        <button key={th} role="radio" aria-checked={theme === th} className="theme-card" onClick={() => void setPrefs({ theme: th })}>
          <span className={`theme-preview theme-preview-${th}`} aria-hidden="true">
            <span className="tp-side" />
            <span className="tp-lines">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className="theme-name">{t(`onboarding.appearance.${th}`)}</span>
        </button>
      ))}
    </div>
  );
}

function AppearanceStep() {
  const { t } = useTranslation();
  return (
    <div className="ob-panel">
      <StepHeader title={t('onboarding.appearance.title')} body={t('onboarding.appearance.body')} />
      <ThemePicker />
    </div>
  );
}

function PrivacyStep() {
  const { t } = useTranslation();
  const items = [
    { icon: HardDrive, title: 'local', body: 'localBody' },
    { icon: LockKeyhole, title: 'encrypted', body: 'encryptedBody' },
    { icon: KeyRound, title: 'key', body: 'keyBody' },
  ];
  return (
    <div className="ob-panel">
      <StepHeader title={t('onboarding.privacy.title')} />
      <ul className="ob-privacy">
        {items.map(({ icon: Icon, title, body }, i) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease }}
          >
            <Icon size={24} strokeWidth={1.5} />
            <div>
              <strong>{t(`onboarding.privacy.${title}`)}</strong>
              <p>{t(`onboarding.privacy.${body}`)}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function PasswordStep({ onCreated }: { onCreated: (recoveryKey: string) => void }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = checkPassword(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const nameOk = username.trim().length >= 2;
  const ready = nameOk && check.ok && confirm === password && !busy;
  const strengthLabels = t('onboarding.password.strength', { returnObjects: true }) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const { recoveryKey } = await api.createVault(username, password);
      useApp.setState({ username: username.trim().replace(/\s+/g, ' '), displayName: '' });
      onCreated(recoveryKey);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.code === 'vault_exists') setError(t('onboarding.password.taken'));
      else if (err instanceof ApiError && err.code === 'weak_password') setError(t('onboarding.password.ruleVariety'));
      else if (err instanceof ApiError && err.code === 'invalid') setError(t('onboarding.password.usernameHint'));
      else setError(t('common.error'));
    }
  };

  const rules = [
    { ok: check.length, label: t('onboarding.password.ruleLength') },
    { ok: check.variety, label: t('onboarding.password.ruleVariety') },
    { ok: check.notRepeated, label: t('onboarding.password.ruleRepeat') },
  ];

  return (
    <form className="ob-panel ob-narrow" onSubmit={submit}>
      <StepHeader title={t('onboarding.password.title')} body={t('onboarding.password.body')} />

      <label className="field">
        <span className="t-label">{t('login.username')}</span>
        <span className="field-input">
          <input
            dir="auto"
            value={username}
            autoFocus
            maxLength={40}
            autoComplete="username"
            spellCheck={false}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
          />
        </span>
        <span className="field-hint">{t('onboarding.password.usernameHint')}</span>
      </label>

      <label className="field">
        <span className="t-label">{t('onboarding.password.label')}</span>
        <span className="field-input">
          <input
            type={visible ? 'text' : 'password'}
            dir="auto"
            value={password}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={visible ? t('common.hide') : t('common.show')}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff size={17} strokeWidth={1.5} /> : <Eye size={17} strokeWidth={1.5} />}
          </button>
        </span>
      </label>

      <div className="strength" data-score={check.score} aria-live="polite">
        <div className="strength-bar">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} data-on={check.score >= n} />
          ))}
        </div>
        <span className="t-label">{password ? strengthLabels[check.score] : ' '}</span>
      </div>

      <ul className="rules">
        {rules.map((r) => (
          <li key={r.label} data-ok={r.ok}>
            {r.ok ? <Check size={14} strokeWidth={2} /> : <Circle size={14} strokeWidth={1.5} />}
            {r.label}
          </li>
        ))}
      </ul>

      <label className="field">
        <span className="t-label">{t('onboarding.password.confirm')}</span>
        <span className="field-input" data-invalid={mismatch}>
          <input
            type={visible ? 'text' : 'password'}
            dir="auto"
            value={confirm}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </span>
        <span className="field-error" role="alert">
          {error ?? (mismatch ? t('onboarding.password.mismatch') : '')}
        </span>
      </label>

      <button className="btn btn-primary btn-lg btn-block" disabled={!ready}>
        {busy ? t('onboarding.password.creating') : t('onboarding.password.cta')}
      </button>
    </form>
  );
}

export function RecoveryKeyDisplay({ value }: { value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(undefined);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the key stays on screen to copy by hand */
    }
  };

  return (
    <div className="recovery-key">
      <div className="recovery-groups" aria-label={value}>
        {value.split('-').map((g, i) => (
          <span key={i}>{g}</span>
        ))}
      </div>
      <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
        {copied ? <Check size={15} /> : <Copy size={15} strokeWidth={1.5} />}
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  );
}

function RecoveryStep({ recoveryKey, onNext }: { recoveryKey: string; onNext: () => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  return (
    <div className="ob-panel ob-narrow">
      <StepHeader
        title={t('onboarding.recovery.title')}
        body={t('onboarding.recovery.body')}
        icon={<KeyRound size={30} strokeWidth={1.5} className="ob-icon" />}
      />
      <RecoveryKeyDisplay value={recoveryKey} />
      <p className="t-muted ob-hint">{t('onboarding.recovery.hint')}</p>
      <label className="checkbox">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span className="checkbox-box" aria-hidden="true">
          {saved && <Check size={13} strokeWidth={2.5} />}
        </span>
        <span>{t('onboarding.recovery.confirm')}</span>
      </label>
      <button className="btn btn-primary btn-lg btn-block" disabled={!saved} onClick={onNext}>
        {t('common.continue')}
      </button>
    </div>
  );
}

function NameStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const username = useApp((s) => s.username);
  const setDisplayName = useApp((s) => s.setDisplayName);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await setDisplayName(name.trim() || username);
      onNext();
    } catch {
      setBusy(false);
    }
  };

  return (
    <form className="ob-panel ob-narrow ob-name" onSubmit={submit}>
      <StepHeader title={t('onboarding.name.title')} body={t('onboarding.name.body')} />
      <input
        className="ob-name-input t-display"
        dir="auto"
        value={name}
        autoFocus
        maxLength={60}
        placeholder={username}
        spellCheck={false}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
        {t('common.continue')}
      </button>
    </form>
  );
}

/** The cast springs up and greets the new writer by name. */
function HelloStep() {
  const { t, i18n } = useTranslation();
  const enterVault = useApp((s) => s.enterVault);
  const displayName = useApp((s) => s.displayName);
  const username = useApp((s) => s.username);
  const name = displayName || username;

  return (
    <div className="ob-hello-stage">
      <div className="ob-hello-copy">
        <motion.h1
          className="t-display ob-hello-title"
          initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 2.2, duration: 0.9, ease }}
        >
          {t('onboarding.hello.title')}
          {name && (
            <>
              {i18n.language === 'ar' ? '، ' : ', '}
              <span dir="auto">{name}</span>
            </>
          )}
          <motion.span
            className="full-stop"
            aria-hidden="true"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 3, type: 'spring', stiffness: 500, damping: 14 }}
          />
        </motion.h1>
        <motion.p
          className="ob-body"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.2, duration: 0.6, ease }}
        >
          {t('onboarding.hello.body')}
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.6, duration: 0.5 }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={async () => {
              await enterVault();
              useApp.getState().startTour('home');
            }}
            autoFocus
          >
            {t('onboarding.done.cta')}
          </button>
        </motion.div>
      </div>
      <div className="ob-hello-cast">
        <Characters mood="idle" entrance />
      </div>
    </div>
  );
}
