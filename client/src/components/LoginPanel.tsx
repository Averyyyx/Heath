import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Github } from 'lucide-react';
import { API_BASE, apiFetch } from '../lib/api';
import { t } from '../lib/strings';
import type { User } from '../types';

type AuthMode = 'login' | 'register';

type LoginPanelProps = {
  onSuccess?: (user: User) => void;
};

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

export function LoginPanel({ onSuccess }: LoginPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [mode, setMode] = useState<AuthMode>('login');
  const apiBase = API_BASE;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus({
      type: 'loading',
      message: mode === 'login' ? 'Входим…' : 'Создаём аккаунт…'
    });

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Unknown error');
      }

      const payload = await response.json();
      setStatus({
        type: 'success',
        message: mode === 'login' ? 'С возвращением!' : 'Аккаунт создан, настройте профиль.'
      });
      onSuccess?.(payload.user);
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    }
  }

  function handleModeSwitch(next: AuthMode) {
    if (mode === next) return;
    setMode(next);
    setStatus({ type: 'idle' });
  }

  return (
    <div className="panel login">
      <div className="login-panel">
        <div>
          <h1>{mode === 'login' ? t('loginTitle') : t('registerTitle')}</h1>
          <p className="muted">
            {mode === 'login' ? t('loginSubtitle') : t('registerSubtitle')}
          </p>
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
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>{t('password')}</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {mode === 'login' && (
            <div className="form-meta">
              <div className="remember">
                <input type="checkbox" id="remember-me" defaultChecked />
                <label htmlFor="remember-me">{t('rememberDevice')}</label>
              </div>
              <button type="button" className="link">
                {t('forgotPassword')}
              </button>
            </div>
          )}

          <motion.button
            type="submit"
            className="primary"
            whileTap={{ scale: 0.98 }}
            disabled={status.type === 'loading'}
          >
            {status.type === 'loading'
              ? mode === 'login'
                ? '…'
                : '…'
              : mode === 'login'
                ? t('login')
                : t('register')}
          </motion.button>
        </motion.form>

        <div className="form-switch">
          <span>{mode === 'login' ? t('noAccount') : t('hasAccount')}</span>
          <button
            type="button"
            className="link"
            onClick={() => handleModeSwitch(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? t('create') : t('signIn')}
          </button>
        </div>

        <div className="divider">
          <span />
          <small>{t('orDivider')}</small>
          <span />
        </div>

        <div className="oauth-buttons">
          <motion.a
            href={`${apiBase}/api/auth/github`}
            className="oauth github"
            whileTap={{ scale: 0.98 }}
          >
            <Github size={18} />
            {t('continueWithGithub')}
          </motion.a>
        </div>

        <AnimateStatus status={status} mode={mode} />
      </div>
    </div>
  );
}

function AnimateStatus({ status, mode }: { status: Status; mode: AuthMode }) {
  return (
    <motion.p
      className={`status ${status.type}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: status.message ? 1 : 0.6 }}
      transition={{ duration: 0.15 }}
    >
      {status.message ||
        (mode === 'login'
          ? 'Защитите аккаунт: после входа доступны настройки приватности.'
          : 'После регистрации мы попросим придумать отображаемое имя и основной ник.')}
    </motion.p>
  );
}
