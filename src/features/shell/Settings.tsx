import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Download, FolderOpen, Info, Sheet, ShieldCheck, SlidersHorizontal, Upload, X } from 'lucide-react';
import { api, ApiError, type ImportMode } from '../../lib/api';
import { checkPassword } from '../../lib/password';
import { useApp } from '../../store';
import { LanguageList } from '../../components/LanguagePicker';
import { ThemePicker, RecoveryKeyDisplay } from '../onboarding/Onboarding';
import { BackdropPicker } from '../login/Backdrop';
import { Mark } from '../../components/Logo';
import { YcMark } from '../../components/YcMark';
import { confirmDialog, toast } from '../../components/Dialogs';
import { exportEverything, importFrom } from '../../lib/transfer';
import type { SettingsTab as Tab } from '../../store';
const AUTO_LOCK = [1, 5, 10, 15, 30, 60, 0];

export function Settings() {
  const { t } = useTranslation();
  const tab = useApp((s) => s.settingsTab);
  const openSettings = useApp((s) => s.openSettings);
  const open = tab !== null;
  const close = () => openSettings(null);

  // First visit: a short tour of the settings.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => useApp.getState().startTour('settings'), 450);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !useApp.getState().tour && openSettings(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openSettings]);

  const tabs: { id: Tab; icon: typeof Info }[] = [
    { id: 'general', icon: SlidersHorizontal },
    { id: 'security', icon: ShieldCheck },
    { id: 'transfer', icon: ArrowLeftRight },
    { id: 'about', icon: Info },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            className="dialog settings"
            role="dialog"
            aria-modal="true"
            aria-label={t('settings.title')}
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.985 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <nav className="settings-nav">
              <div className="t-label settings-nav-title">{t('settings.title')}</div>
              {tabs.map(({ id, icon: Icon }) => (
                <button key={id} className="side-row" data-active={tab === id} data-tour={`settings-${id}`} onClick={() => openSettings(id)}>
                  <Icon size={15} strokeWidth={1.5} className="side-icon" />
                  <span className="side-label">{t(`settings.${id}`)}</span>
                </button>
              ))}
            </nav>
            <div className="settings-body">
              <button className="icon-btn settings-close" aria-label={t('window.close')} onClick={close}>
                <X size={17} strokeWidth={1.5} />
              </button>
              {tab === 'general' && <General />}
              {tab === 'security' && <Security />}
              {tab === 'transfer' && <Transfer />}
              {tab === 'about' && <About />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function YourName() {
  const { t } = useTranslation();
  const displayName = useApp((s) => s.displayName);
  const username = useApp((s) => s.username);
  const setDisplayName = useApp((s) => s.setDisplayName);
  const [name, setName] = useState(displayName);
  const dirty = name.trim() !== displayName;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    try {
      await setDisplayName(name.trim());
      toast(t('settings.nameSaved'));
    } catch {
      toast(t('common.error'));
    }
  };

  return (
    <form className="settings-section" onSubmit={save} data-tour="settings-name">
      <h3 className="t-label">{t('settings.yourName')}</h3>
      <p className="settings-hint">{t('settings.yourNameHint', { username })}</p>
      <div className="name-row">
        <span className="field-input">
          <input dir="auto" value={name} maxLength={60} placeholder={username} onChange={(e) => setName(e.target.value)} />
        </span>
        <button className="btn btn-primary" disabled={!dirty}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

function General() {
  const { t } = useTranslation();
  return (
    <>
      <h2 className="t-display settings-title">{t('settings.general')}</h2>
      <YourName />
      <section className="settings-section" data-tour="settings-language">
        <h3 className="t-label">{t('settings.language')}</h3>
        <LanguageList compact />
        <p className="settings-hint">{t('settings.languageHint')}</p>
      </section>
      <section className="settings-section">
        <h3 className="t-label">{t('settings.theme')}</h3>
        <ThemePicker />
      </section>
      <section className="settings-section">
        <h3 className="t-label">{t('settings.backdrop')}</h3>
        <BackdropPicker />
        <p className="settings-hint">{t('settings.backdropHint')}</p>
      </section>
    </>
  );
}

function Security() {
  const { t } = useTranslation();
  const [autoLock, setAutoLock] = useState<number | null>(null);

  useEffect(() => {
    void api.getSettings().then((s) => setAutoLock(s.autoLockMinutes));
  }, []);

  return (
    <>
      <h2 className="t-display settings-title">{t('settings.security')}</h2>
      <section className="settings-section">
        <h3 className="t-label">{t('settings.autoLock')}</h3>
        <div className="segmented" role="radiogroup">
          {AUTO_LOCK.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={autoLock === m}
              onClick={() => {
                setAutoLock(m);
                void api.setSettings({ autoLockMinutes: m });
              }}
            >
              {m === 0 ? t('settings.never') : t('settings.minutes', { count: m })}
            </button>
          ))}
        </div>
      </section>
      <ChangePassword />
      <NewRecoveryKey />
      <DeleteAccount />
    </>
  );
}

function errorText(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (e instanceof ApiError) {
    if (e.code === 'wrong_password') return t('login.wrong');
    if (e.code === 'throttled' && e.retryAfterMs) return t('login.throttled', { s: Math.ceil(e.retryAfterMs / 1000) });
    if (e.code === 'weak_password') return t('onboarding.password.ruleVariety');
  }
  return t('common.error');
}

function ChangePassword() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = checkPassword(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current && check.ok && next === confirm && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast(t('settings.passwordChanged'));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-section" onSubmit={submit}>
      <h3 className="t-label">{t('settings.changePassword')}</h3>
      <div className="settings-fields">
        {[
          { label: t('settings.currentPassword'), value: current, set: setCurrent, auto: 'current-password' },
          { label: t('settings.newPassword'), value: next, set: setNext, auto: 'new-password' },
          { label: t('settings.confirmPassword'), value: confirm, set: setConfirm, auto: 'new-password' },
        ].map((f, i) => (
          <label key={f.label} className="field">
            <span className="t-label">{f.label}</span>
            <span className="field-input" data-invalid={i === 2 && mismatch}>
              <input type="password" dir="auto" value={f.value} autoComplete={f.auto} onChange={(e) => f.set(e.target.value)} />
            </span>
          </label>
        ))}
      </div>
      <span className="field-error" role="alert">
        {error ?? (mismatch ? t('onboarding.password.mismatch') : next && !check.ok ? t('onboarding.password.ruleVariety') : '')}
      </span>
      <div>
        <button className="btn btn-primary" disabled={!ready}>
          {t('settings.changePassword')}
        </button>
      </div>
    </form>
  );
}

function NewRecoveryKey() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.newRecoveryKey(password);
      setKey(r.recoveryKey);
      setPassword('');
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-section" onSubmit={submit}>
      <h3 className="t-label">{t('settings.recoveryKey')}</h3>
      <p className="settings-hint">{t('settings.recoveryHint')}</p>
      {key ? (
        <>
          <RecoveryKeyDisplay value={key} />
          <p className="settings-hint">{t('onboarding.recovery.hint')}</p>
        </>
      ) : (
        <>
          <label className="field">
            <span className="t-label">{t('settings.currentPassword')}</span>
            <span className="field-input">
              <input type="password" dir="auto" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
            </span>
            <span className="field-error" role="alert">
              {error ?? ''}
            </span>
          </label>
          <div>
            <button className="btn btn-ghost" disabled={!password || busy}>
              {t('settings.newRecoveryKey')}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function DeleteAccount() {
  const { t } = useTranslation();
  const username = useApp((s) => s.username);
  const deleteAccount = useApp((s) => s.deleteAccount);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    const confirmed = await confirmDialog(t('settings.deleteAccountConfirm', { username }), {
      confirmLabel: t('settings.deleteAccountButton'),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      toast(t('settings.accountDeleted'));
    } catch (err) {
      setError(errorText(err, t));
      setBusy(false);
    }
  };

  return (
    <form className="settings-section settings-danger" onSubmit={submit}>
      <h3 className="t-label">{t('settings.deleteAccount')}</h3>
      <p className="settings-hint">{t('settings.deleteAccountHint')}</p>
      <label className="field">
        <span className="t-label">{t('settings.currentPassword')}</span>
        <span className="field-input" data-invalid={!!error}>
          <input type="password" dir="auto" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        </span>
        <span className="field-error" role="alert">
          {error ?? ''}
        </span>
      </label>
      <div>
        <button className="btn btn-danger-solid" disabled={!password || busy}>
          {t('settings.deleteAccountButton')}
        </button>
      </div>
    </form>
  );
}

function Transfer() {
  const { t } = useTranslation();
  const refresh = useApp((s) => s.refresh);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const run = async (key: string, task: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(key);
    setLast(null);
    try {
      const message = await task();
      if (message) {
        setLast(message);
        toast(message);
      }
    } catch {
      toast(t('transfer.failed'));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const doImport = (key: string, mode: ImportMode) =>
    run(key, async () => {
      const result = await importFrom(mode, (done, total) => setProgress({ done, total }));
      if (!result) return null;
      await refresh();
      return t('transfer.imported', { count: result.count });
    });

  const sources = [
    { key: 'obsidian', mode: 'folder' as const, icon: FolderOpen },
    { key: 'notion', mode: 'zip' as const, icon: Upload },
    { key: 'markdown', mode: 'folder' as const, icon: FolderOpen },
    { key: 'spreadsheet', mode: 'files' as const, icon: Sheet },
    { key: 'backup', mode: 'zip' as const, icon: Upload },
  ];

  return (
    <>
      <h2 className="t-display settings-title">{t('settings.transfer')}</h2>

      <section className="settings-section">
        <h3 className="t-label">{t('transfer.exportTitle')}</h3>
        <p className="settings-hint">{t('transfer.exportBody')}</p>
        <div>
          <button
            className="btn btn-primary"
            disabled={!!busy}
            onClick={() =>
              run('export', async () => {
                const r = await exportEverything();
                if (!r) return null;
                const done = t('transfer.exported', { count: r.count });
                return r.missing ? `${done} ${t('transfer.exportedMissing', { count: r.missing })}` : done;
              })
            }
          >
            <Download size={16} strokeWidth={1.5} />
            {busy === 'export' ? t('transfer.working') : t('transfer.exportButton')}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="t-label">{t('transfer.importTitle')}</h3>
        <p className="settings-hint">{t('transfer.importBody')}</p>
        <div className="import-grid">
          {sources.map(({ key, mode, icon: Icon }) => (
            <button key={key} className="import-card" disabled={!!busy} onClick={() => void doImport(key, mode)}>
              <Icon size={20} strokeWidth={1.5} />
              <strong>{t(`transfer.${key}`)}</strong>
              <small>{t(`transfer.${key}Hint`)}</small>
              {busy === key && (
                <span className="t-label import-progress">
                  {progress ? `${progress.done} / ${progress.total}` : t('transfer.working')}
                </span>
              )}
            </button>
          ))}
        </div>
        {last && <p className="settings-hint">{last}</p>}
      </section>
    </>
  );
}

function About() {
  const { t } = useTranslation();
  const shortcuts: [string, string][] = [
    ['Ctrl N', 'shortcuts.newPage'],
    ['Ctrl K', 'shortcuts.find'],
    ['Ctrl L', 'shortcuts.lock'],
    ['Ctrl \\', 'shortcuts.sidebar'],
    ['/', 'shortcuts.slash'],
    ['Ctrl B', 'shortcuts.bold'],
    ['Ctrl I', 'shortcuts.italic'],
    ['Ctrl Shift D', 'shortcuts.dictate'],
  ];
  return (
    <>
      <div className="about-head">
        <Mark size={44} />
        <div>
          <h2 className="t-display settings-title">{t('app.name')}</h2>
          <p className="t-label">{t('settings.version', { v: __APP_VERSION__ })}</p>
        </div>
      </div>
      <p className="settings-hint">{t('app.tagline')}</p>
      <p className="settings-hint">{t('settings.storage')}</p>
      <p className="settings-hint">{t('dictation.credits')}</p>

      <section className="settings-section">
        <h3 className="t-label">{t('settings.developedBy')}</h3>
        <div className="credit">
          <YcMark size={48} />
          <div className="credit-text">
            <strong className="credit-name">Yassine Chelly</strong>
            <span className="credit-name-ar" lang="ar">
              ياسين الشلي
            </span>
            <span className="credit-line t-muted">From signal to decision.</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="t-label">{t('settings.shortcuts')}</h3>
        <dl className="shortcut-list">
          {shortcuts.map(([keys, label]) => (
            <div key={keys}>
              <dt>{t(label)}</dt>
              <dd>
                <kbd>{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
