import { useEffect, useState, useCallback } from 'react';
import { LoginPanel } from './components/LoginPanel';
import { ProfileSetup } from './components/ProfileSetup';
import { MessengerWorkspace } from './components/MessengerWorkspace';
import { FriendsList } from './components/FriendsList';
import { apiFetch } from './lib/api';
import { applyTheme, isThemeChoice, type ThemeChoice } from './lib/theme';
import { t } from './lib/strings';
import type { User } from './types';

type UserSettingsPayload = {
  settings?: { theme?: string };
};

export default function App() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Боковая навигация: друзья / сообщения
  const [activeView, setActiveView] = useState<'friends' | 'messages'>('messages');
  // Диалог, который нужно открыть после выбора друга в списке
  const [openConversationId, setOpenConversationId] = useState<number | null>(null);

  // В десктопной версии (Electron) окно без рамки — показываем свои кнопки управления окном
  const desktopApi = typeof window !== 'undefined' ? window.nexoAPI : undefined;

  // Тема применяется к <html data-theme>; 'system' разрешается в CSS через prefers-color-scheme.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    async function bootstrapSession() {
      try {
        const response = await apiFetch('/api/auth/session');
        if (response.ok) {
          const payload = await response.json();
          setUser(payload.user ?? null);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoadingSession(false);
      }
    }

    bootstrapSession();
  }, []);

  // Подтягиваем сохранённую тему после входа в аккаунт.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch('/api/settings/me')
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as UserSettingsPayload;
        const saved = payload.settings?.theme;
        if (!cancelled && isThemeChoice(saved)) {
          setTheme(saved);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const stage: 'login' | 'profile' | 'social' = user
    ? user.profile_complete
      ? 'social'
      : 'profile'
    : 'login';

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST'
      });
    } finally {
      setUser(null);
    }
  }

  // Выбор друга в списке: открываем (или создаём) личный диалог и показываем сообщения.
  const handleSelectFriend = useCallback(async (friend: { username: string }) => {
    try {
      const response = await apiFetch('/api/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: friend.username })
      });
      if (response.ok) {
        const payload = await response.json();
        const conversationId = payload?.conversation?.id;
        if (typeof conversationId === 'number') {
          setOpenConversationId(conversationId);
        }
      } else {
        console.warn('Не удалось открыть диалог:', response.status);
      }
    } catch (error) {
      console.error('Не удалось открыть диалог', error);
    } finally {
      setActiveView('messages');
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="app-nav flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div className="brand">
          <strong>{t('appName')}</strong>
        </div>
        <div className="nav-actions">
          {stage === 'social' && (
            <button className="ghost subtle" onClick={handleLogout}>
              {t('logout')}
            </button>
          )}
          {desktopApi && (
            <div className="window-controls">
              <button
                type="button"
                className="window-control"
                aria-label={t('windowMinimize')}
                onClick={() => desktopApi.minimizeWindow()}
              >
                &#8211;
              </button>
              <button
                type="button"
                className="window-control"
                aria-label={t('windowMaximize')}
                onClick={() => desktopApi.maximizeWindow()}
              >
                &#9633;
              </button>
              <button
                type="button"
                className="window-control close"
                aria-label={t('windowClose')}
                onClick={() => desktopApi.closeWindow()}
              >
                &#10005;
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-stage flex-1">
        {loadingSession && <p className="muted">{t('loadingSession')}</p>}

        {!loadingSession && stage === 'login' && <LoginPanel onSuccess={setUser} />}

        {!loadingSession && stage === 'profile' && user && (
          <ProfileSetup user={user} onComplete={setUser} />
        )}

        {!loadingSession && stage === 'social' && user && (
          <div className="workspace-shell flex-1 min-h-0">
            {/* Боковая навигация: диалоги / друзья */}
            <nav className="app-view-nav flex flex-col items-center gap-2 py-4 border-r border-[var(--border)] bg-[var(--bg-secondary)]">
              <button
                type="button"
                className={`view-nav-button ${activeView === 'messages' ? 'active' : ''}`}
                aria-label="Сообщения"
                onClick={() => setActiveView('messages')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <button
                type="button"
                className={`view-nav-button ${activeView === 'friends' ? 'active' : ''}`}
                aria-label="Друзья"
                onClick={() => setActiveView('friends')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </button>
            </nav>

            {/* Список друзей (серверы и диалоги показывает сам MessengerWorkspace) */}
            {activeView === 'friends' && (
              <aside className="w-72 shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] overflow-y-auto">
                <FriendsList onSelectFriend={handleSelectFriend} />
              </aside>
            )}

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <MessengerWorkspace user={user} openConversationId={openConversationId} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
