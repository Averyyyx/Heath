import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Github } from 'lucide-react';
import { API_BASE, apiFetch } from '../lib/api';
import { t } from '../lib/strings';
import type { User } from '../types';

type AuthMode = 'login' | 'register';
type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

type LoginPanelProps = { onSuccess?: (user: User) => void };

export function LoginPanel({ onSuccess }: LoginPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [githubAvailable, setGithubAvailable] = useState(false);
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [mode, setMode] = useState<AuthMode>('login');

  useEffect(() => {
    let active = true;
    apiFetch('/api/auth/providers')
      .then((response) => response.ok ? response.json() : { github: false })
      .then((payload) => { if (active) setGithubAvailable(Boolean(payload.github)); })
      .catch(() => { if (active) setGithubAvailable(false); });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'register' && password !== confirmPassword) {
      setStatus({ type: 'error', message: 'Пароли не совпадают.' });
      return;
    }
    setStatus({ type: 'loading', message: mode === 'login' ? 'Входим…' : 'Создаём аккаунт…' });
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, remember: mode === 'login' ? remember : true })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Не удалось выполнить вход.');
      }
      const payload = await response.json();
      setStatus({ type: 'success', message: mode === 'login' ? 'С возвращением!' : 'Аккаунт создан. Настройте профиль.' });
      onSuccess?.(payload.user);
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    }
  }

  function switchMode(next: AuthMode) {
    if (mode === next) return;
    setMode(next);
    setConfirmPassword('');
    setStatus({ type: 'idle' });
  }

  return (
    <div className="panel login">
      <div className="login-panel">
        <div>
          <p className="eyebrow">NEXO ACCOUNT</p>
          <h1>{mode === 'login' ? t('loginTitle') : t('registerTitle')}</h1>
          <p className="muted">{mode === 'login' ? t('loginSubtitle') : t('registerSubtitle')}</p>
        </div>

        <motion.form
          className="auth-form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <label>
            <span>{t('email')}</span>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label>
            <span>{t('password')}</span>
            <input type="password" placeholder="••••••••" value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </label>
          {mode === 'register' && (
            <label>
              <span>Повторите пароль</span>
              <input type="password" placeholder="••••••••" value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password" required />
            </label>
          )}
          {mode === 'login' && (
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>{t('rememberDevice')}</span>
            </label>
          )}
          <motion.button type="submit" className="primary" whileTap={{ scale: 0.98 }}
            disabled={status.type === 'loading'}>
            {status.type === 'loading' ? 'Подождите…' : mode === 'login' ? t('login') : t('register')}
          </motion.button>
        </motion.form>

        <div className="form-switch">
          <span>{mode === 'login' ? t('noAccount') : t('hasAccount')}</span>
          <button type="button" className="link" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? t('create') : t('signIn')}
          </button>
        </div>

        {githubAvailable && (
          <>
            <div className="divider"><span /><small>{t('orDivider')}</small><span /></div>
            <div className="oauth-buttons">
              <motion.a href={`${API_BASE}/api/auth/github`} className="oauth github" whileTap={{ scale: 0.98 }}>
                <Github size={18} />{t('continueWithGithub')}
              </motion.a>
            </div>
          </>
        )}
        <motion.p className={`status ${status.type}`} initial={{ opacity: 0 }}
          animate={{ opacity: status.message ? 1 : 0.6 }} transition={{ duration: 0.15 }}>
          {status.message || (mode === 'login'
            ? 'Ваши диалоги и настройки останутся на месте.'
            : 'После регистрации выберите имя, ник и цвет профиля.')}
        </motion.p>
      </div>
    </div>
  );
}
