import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Lock, UserPlus } from 'lucide-react';
import { api, ApiError, type UnlockReport } from '../../lib/api';
import { checkPassword } from '../../lib/password';
import { useApp } from '../../store';
import { Mark, Wordmark } from '../../components/Logo';
import { LanguageMenu } from '../../components/LanguagePicker';
import { Backdrop } from './Backdrop';
import { Characters, type Mood } from './Characters';

type Focus = 'none' | 'username' | 'password' | 'key' | 'new';

export function Login() {
  const { t } = useTranslation();
  const enterVault = useApp((s) => s.enterVault);
  const startSignup = useApp((s) => s.startSignup);
  const lockReason = useApp((s) => s.lockReason);
  const lastUsername = useApp((s) => s.prefs.lastUsername);
  const backdrop = useApp((s) => s.prefs.loginBackdrop);
  const setPrefs = useApp((s) => s.setPrefs);

  const [mode, setMode] = useState<'password' | 'recovery'>('password');
  const [username, setUsername] = useState(lastUsername ?? '');
  const [password, setPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [focus, setFocus] = useState<Focus>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<'error' | 'success' | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [capsLock, setCapsLock] = useState(false);
  const [keyTick, setKeyTick] = useState(0);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'recovery') (username ? keyRef : userRef).current?.focus();
    else (username ? passRef : userRef).current?.focus();
  }, [mode]);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= retryAt) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [retryAt]);

  const waitSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const throttled = waitSeconds > 0;

  const mood: Mood = (() => {
    if (flash) return flash;
    if (busy) return 'watch';
    const secret =
      (focus === 'password' && password.length > 0) || (focus === 'new' && (newPassword.length > 0 || confirm.length > 0));
    if (secret) return visible ? 'peek' : 'shy';
    if (focus !== 'none') return 'watch';
    return 'idle';
  })();

  const fail = (e: unknown) => {
    setBusy(false);
    setFlash('error');
    window.setTimeout(() => setFlash(null), 1100);
    if (e instanceof ApiError) {
      if (e.code === 'throttled' && e.retryAfterMs) {
        setRetryAt(Date.now() + e.retryAfterMs);
        setNow(Date.now());
        setError(null);
        return;
      }
      if (e.code === 'wrong_password') return setError(t('login.wrong'));
      if (e.code === 'wrong_recovery_key') return setError(t('login.wrongKey'));
      if (e.code === 'weak_password') return setError(t('onboarding.password.ruleVariety'));
    }
    setError(t('common.error'));
  };

  const succeed = (report: UnlockReport) => {
    setFlash('success');
    window.setTimeout(() => enterVault(report).catch(fail), 900);
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return userRef.current?.focus();
    if (!password || busy || throttled) return;
    setBusy(true);
    setError(null);
    try {
      succeed(await api.unlock(username, password));
    } catch (err) {
      fail(err);
      setPassword('');
      passRef.current?.focus();
    }
  };

  const newCheck = checkPassword(newPassword);
  const canRecover =
    username.trim().length > 1 &&
    recoveryKey.replace(/[^0-9a-z]/gi, '').length === 24 &&
    newCheck.ok &&
    newPassword === confirm;

  const submitRecovery = async (e: FormEvent) => {
    e.preventDefault();
    if (!canRecover || busy || throttled) return;
    setBusy(true);
    setError(null);
    try {
      succeed(await api.recover(username, recoveryKey, newPassword));
    } catch (err) {
      fail(err);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState('CapsLock'));
    if (e.key.length === 1 || e.key === 'Backspace') setKeyTick((k) => k + 1);
  };

  const switchMode = (next: 'password' | 'recovery') => {
    setMode(next);
    setError(null);
    setVisible(false);
  };

  const eye = (
    <button
      type="button"
      className="icon-btn"
      aria-label={visible ? t('common.hide') : t('common.show')}
      title={visible ? t('common.hide') : t('common.show')}
      aria-pressed={visible}
      onClick={() => setVisible((v) => !v)}
    >
      {visible ? <EyeOff size={17} strokeWidth={1.5} /> : <Eye size={17} strokeWidth={1.5} />}
    </button>
  );

  const forgetUsername = () => {
    setUsername('');
    void setPrefs({ lastUsername: null });
    userRef.current?.focus();
  };

  const usernameField = (
    <label className="field">
      <span className="field-head">
        <span className="t-label">{t('login.username')}</span>
        {lastUsername && username === lastUsername && (
          <button type="button" className="btn-link muted field-action" onClick={forgetUsername}>
            {t('login.forgetUsername')}
          </button>
        )}
      </span>
      <span className="field-input">
        <input
          ref={userRef}
          dir="auto"
          value={username}
          autoComplete="username"
          spellCheck={false}
          maxLength={40}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
          onFocus={() => setFocus('username')}
          onBlur={() => setFocus('none')}
          onKeyDown={onKey}
        />
      </span>
    </label>
  );

  const motionProps = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
  };

  return (
    <div className="login">
      <section className="login-art">
        <Backdrop id={backdrop} />
        <div className="login-art-top">
          <Wordmark size={24} />
          <p className="login-art-hint t-label">{t('login.playHint')}</p>
        </div>
        <Characters mood={mood} typed={username.length + password.length} keyTick={keyTick} />
      </section>

      <section className="login-side">
        <div className="login-lang">
          <LanguageMenu />
        </div>

        <div className="login-card">
          <Mark size={40} />
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'password' ? (
              <motion.form key="password" className="login-form" onSubmit={submitPassword} {...motionProps}>
                <header>
                  <h1 className="t-display login-title">{t('login.title')}</h1>
                  <p className="t-muted">{lockReason === 'idle' ? t('login.idle') : t('login.subtitle')}</p>
                </header>

                {usernameField}

                <label className="field">
                  <span className="t-label">{t('login.password')}</span>
                  <span className="field-input" data-invalid={!!error}>
                    <input
                      ref={passRef}
                      type={visible ? 'text' : 'password'}
                      dir="auto"
                      value={password}
                      autoComplete="current-password"
                      spellCheck={false}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      onFocus={() => setFocus('password')}
                      onBlur={() => setFocus('none')}
                      onKeyDown={onKey}
                      onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                    />
                    {eye}
                  </span>
                  <span className="field-error" role="alert">
                    {throttled ? t('login.throttled', { s: waitSeconds }) : error ?? (capsLock ? t('login.capsLock') : '')}
                  </span>
                </label>

                <button className="btn btn-primary btn-lg btn-block" disabled={!username.trim() || !password || busy || throttled}>
                  {busy ? t('login.unlocking') : t('login.unlock')}
                </button>

                <div className="login-links">
                  <button type="button" className="btn-link" onClick={() => switchMode('recovery')}>
                    {t('login.forgot')}
                  </button>
                  <button type="button" className="btn-link" onClick={startSignup}>
                    <UserPlus size={14} className="inline-icon" /> {t('login.newAccount')}
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.form key="recovery" className="login-form" onSubmit={submitRecovery} {...motionProps}>
                <header>
                  <h1 className="t-display login-title">{t('login.recoveryTitle')}</h1>
                  <p className="t-muted">{t('login.recoverySubtitle')}</p>
                </header>

                {usernameField}

                <label className="field">
                  <span className="t-label">{t('login.recoveryKey')}</span>
                  <span className="field-input">
                    <input
                      ref={keyRef}
                      className="mono-input"
                      value={recoveryKey}
                      placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => {
                        setRecoveryKey(e.target.value.toUpperCase());
                        setError(null);
                      }}
                      onFocus={() => setFocus('key')}
                      onBlur={() => setFocus('none')}
                      onKeyDown={onKey}
                    />
                  </span>
                </label>

                <div className="login-pair">
                  <label className="field">
                    <span className="t-label">{t('login.newPassword')}</span>
                    <span className="field-input">
                      <input
                        type={visible ? 'text' : 'password'}
                        dir="auto"
                        value={newPassword}
                        autoComplete="new-password"
                        onChange={(e) => setNewPassword(e.target.value)}
                        onFocus={() => setFocus('new')}
                        onBlur={() => setFocus('none')}
                        onKeyDown={onKey}
                      />
                      {eye}
                    </span>
                  </label>
                  <label className="field">
                    <span className="t-label">{t('login.confirmPassword')}</span>
                    <span className="field-input" data-invalid={confirm.length > 0 && confirm !== newPassword}>
                      <input
                        type={visible ? 'text' : 'password'}
                        dir="auto"
                        value={confirm}
                        autoComplete="new-password"
                        onChange={(e) => setConfirm(e.target.value)}
                        onFocus={() => setFocus('new')}
                        onBlur={() => setFocus('none')}
                        onKeyDown={onKey}
                      />
                    </span>
                  </label>
                </div>
                <span className="field-error" role="alert">
                  {throttled
                    ? t('login.throttled', { s: waitSeconds })
                    : error ??
                      (confirm.length > 0 && confirm !== newPassword
                        ? t('onboarding.password.mismatch')
                        : newPassword && !newCheck.ok
                          ? t('onboarding.password.ruleVariety')
                          : '')}
                </span>

                <button className="btn btn-primary btn-lg btn-block" disabled={!canRecover || busy || throttled}>
                  {busy ? t('login.unlocking') : t('login.recoverySubmit')}
                </button>

                <button type="button" className="btn-link login-forgot" onClick={() => switchMode('password')}>
                  <ArrowLeft size={14} className="inline-icon" /> {t('login.backToPassword')}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <footer className="login-foot t-label">
          <Lock size={12} strokeWidth={1.75} />
          <span>{t('login.local')}</span>
        </footer>
      </section>
    </div>
  );
}
