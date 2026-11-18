import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, Palette } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { User } from '../types';

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };
type HandleState = 'idle' | 'checking' | 'available' | 'taken';

type ProfileSetupProps = { user: User; onComplete: (user: User) => void };

const normalizeHandle = (value: string) => value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
const avatarColors = ['#D97757', '#B66F83', '#788CB8', '#6F9B86', '#B18A55', '#897CB4'];

export function ProfileSetup({ user, onComplete }: ProfileSetupProps) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [handle, setHandle] = useState(user.profile_complete ? user.username : '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarColor, setAvatarColor] = useState(user.avatar_color || '#D97757');
  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [handleMessage, setHandleMessage] = useState('');
  const [status, setStatus] = useState<Status>({ type: 'idle' });

  const normalizedHandle = useMemo(() => normalizeHandle(handle), [handle]);
  const previewHandle = normalizedHandle || 'ваше_имя';

  async function checkHandle(value: string) {
    const normalized = normalizeHandle(value);
    if (normalized.length < 3) {
      setHandleState('taken');
      setHandleMessage('Минимум 3 символа.');
      return false;
    }
    setHandleState('checking');
    try {
      const response = await apiFetch(`/api/profile/username-availability?username=${encodeURIComponent(normalized)}`);
      if (!response.ok) throw new Error('Не удалось проверить ник.');
      const payload = await response.json();
      setHandleState(payload.available ? 'available' : 'taken');
      setHandleMessage(payload.available ? 'Ник свободен.' : payload.reason || 'Этот ник уже занят.');
      return Boolean(payload.available);
    } catch {
      setHandleState('idle');
      setHandleMessage('Не удалось проверить доступность. Проверим при сохранении.');
      return true;
    }
  }

  useEffect(() => {
    if (!normalizedHandle || normalizedHandle.length < 3) {
      setHandleState('idle');
      setHandleMessage('');
      return;
    }
    const timer = window.setTimeout(() => { void checkHandle(normalizedHandle); }, 350);
    return () => window.clearTimeout(timer);
  }, [normalizedHandle]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Сохраняем профиль…' });
    try {
      const available = await checkHandle(normalizedHandle);
      if (!available) throw new Error('Выберите свободный ник.');
      const response = await apiFetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), username: normalizedHandle, bio: bio.trim(), avatarColor })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Не удалось обновить профиль.');
      }
      const payload = await response.json();
      setStatus({ type: 'success', message: 'Профиль готов!' });
      onComplete(payload.user);
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    }
  }

  function generateFromName() {
    setHandle(normalizeHandle(displayName || user.email.split('@')[0]));
  }

  return (
    <div className="profile-panel">
      <motion.div className="profile-intro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow">ВАШ ПРОФИЛЬ</p>
        <h1>Создайте своё присутствие</h1>
        <p className="muted">Выберите имя и уникальный ник, по которому вас смогут найти.</p>
      </motion.div>

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="profile-preview">
          <span className="profile-avatar" style={{ backgroundColor: avatarColor }}>
            {(displayName || handle || 'N').slice(0, 1).toUpperCase()}
          </span>
          <div><strong>{displayName || 'Новое имя'}</strong><small>@{previewHandle}</small></div>
        </div>

        <label>
          <span>Отображаемое имя</span>
          <input type="text" placeholder="Например, Лена из студии" value={displayName}
            onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={32} required />
        </label>

        <label>
          <span>Основной ник</span>
          <div className="handle-field">
            <input type="text" placeholder="orbit-designer" value={handle}
              onChange={(event) => setHandle(event.target.value)} minLength={3} maxLength={24} required />
            <button type="button" className="ghost" onClick={generateFromName}>Предложить</button>
          </div>
          <small className={`handle-availability ${handleState}`}>
            {handleMessage || 'Латинские буквы, цифры, точки, дефисы и подчёркивания.'}
          </small>
        </label>

        <label>
          <span>О себе <small>(необязательно)</small></span>
          <textarea value={bio} onChange={(event) => setBio(event.target.value)}
            placeholder="Немного о себе и над чем вы работаете…" maxLength={160} rows={3} />
          <small>{bio.length}/160</small>
        </label>

        <div className="avatar-color-picker">
          <div><Palette size={15} /><span>Цвет аватара</span></div>
          <div className="avatar-color-options">
            {avatarColors.map((color) => (
              <button type="button" key={color} aria-label={`Цвет ${color}`}
                aria-pressed={avatarColor === color} className={avatarColor === color ? 'selected' : ''}
                style={{ backgroundColor: color }} onClick={() => setAvatarColor(color)}>
                {avatarColor === color && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>

        <motion.button type="submit" className="primary" disabled={status.type === 'loading' || handleState === 'taken'}
          whileTap={{ scale: 0.98 }}>
          {status.type === 'loading' ? 'Сохраняем…' : 'Продолжить'}
        </motion.button>
      </form>

      <motion.p className={`status ${status.type}`} initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: status.message ? 1 : 0.6, y: 0 }}>
        {status.message || 'Профиль можно изменить позже в настройках аккаунта.'}
      </motion.p>
    </div>
  );
}
