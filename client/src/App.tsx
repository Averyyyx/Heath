import { useEffect, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoginPanel } from './components/LoginPanel';
import { MessengerPreview } from './components/MessengerPreview';
import { ProfileSetup } from './components/ProfileSetup';
import { MessengerWorkspace } from './components/MessengerWorkspace';
import { FriendsList } from './components/FriendsList';
import { apiFetch } from './lib/api';
import type { User } from './types';

const themes = ['nebula', 'midnight', 'lilac'] as const;

function pickNextTheme(current: typeof themes[number]) {
  const index = themes.indexOf(current);
  return themes[(index + 1) % themes.length];
}

export default function App() {
  const [theme, setTheme] = useState<(typeof themes)[number]>('nebula');
  const [isPreviewFocused, setIsPreviewFocused] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Боковая навигация: друзья / сообщения
  const [activeView, setActiveView] = useState<'friends' | 'messages'>('messages');
  // Диалог, который нужно открыть после выбора друга в списке
  const [openConversationId, setOpenConversationId] = useState<number | null>(null);

  // В десктопной версии (Electron) окно без рамки — показываем свои кнопки управления окном
  const desktopApi = typeof window !== 'undefined' ? window.nexoAPI : undefined;

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

  const backgroundClass = useMemo<string>(() => {
    switch (theme) {
      case 'midnight':
        return 'app-surface midnight';
      case 'lilac':
        return 'app-surface lilac';
      default:
        return 'app-surface nebula';
    }
  }, [theme]);

  const stage: 'login' | 'profile' | 'social' = useMemo(() => {
    if (!user) return 'login';
    return user.profile_complete ? 'social' : 'profile';
  }, [user]);

  const panelKey = `${stage}-${theme}`;
  const previewActive = stage === 'social' ? true : isPreviewFocused;

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST'
      });
    } finally {
      setUser(null);
    }
  }

  // Handle theme change
  const handleThemeChange = useCallback(() => {
    setTheme(pickNextTheme(theme));
  }, [theme]);

  // Выбор друга в списке: открываем (или создаём) личный диалог и показываем сообщения.
  // Раньше аргумент игнорировался, и клик по другу просто переключал вкладку.
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
    <div className={`min-h-screen flex flex-col ${backgroundClass}`}>
      <motion.header
        className="app-nav"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="brand">
          <span className="pulse-dot" />
          <strong>Nexo</strong>
          <span className="tagline">new era of presence</span>
        </div>
        <div className="nav-actions">
          {stage === 'social' && (
            <button className="ghost subtle" onClick={handleLogout}>
              Выйти
            </button>
          )}
          <button className="ghost" onClick={handleThemeChange}>
            Cycle theme
          </button>
          {stage !== 'social' && <button className="primary">Get early access</button>}
          {desktopApi && (
            <div className="window-controls">
              <button
                type="button"
                className="window-control"
                aria-label="Свернуть"
                onClick={() => desktopApi.minimizeWindow()}
              >
                &#8211;
              </button>
              <button
                type="button"
                className="window-control"
                aria-label="Развернуть"
                onClick={() => desktopApi.maximizeWindow()}
              >
                &#9633;
              </button>
              <button
                type="button"
                className="window-control close"
                aria-label="Закрыть"
                onClick={() => desktopApi.closeWindow()}
              >
                &#10005;
              </button>
            </div>
          )}
        </div>
      </motion.header>

      <main className="app-stage">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={panelKey}
            className={`panel ${stage} ${
              stage === 'login' && isPreviewFocused ? 'dimmed' : ''
            }`}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            onMouseEnter={() => stage === 'login' && setIsPreviewFocused(false)}
            onMouseLeave={() => stage === 'login' && setIsPreviewFocused(true)}
          >
            {loadingSession && (
              <div className="panel-loading">
                <p>Загружаем сессию…</p>
              </div>
            )}

            {!loadingSession && stage === 'login' && (
              <LoginPanel
                theme={theme}
                onSuccess={(nextUser) => {
                  setUser(nextUser);
                }}
              />
            )}

            {!loadingSession && stage === 'profile' && user && (
              <ProfileSetup
                user={user}
                onComplete={(updatedUser) => {
                  setUser(updatedUser);
                }}
              />
            )}

            {!loadingSession && stage === 'social' && user && (
              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-16 bg-gray-900 flex flex-col items-center py-4">
                  <button
                    onClick={() => setActiveView('messages')}
                    className={`p-3 rounded-2xl mb-2 ${activeView === 'messages' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setActiveView('friends')}
                    className={`p-3 rounded-2xl ${activeView === 'friends' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </button>
                </div>

                {/* Main content */}
                <div className="flex-1 flex overflow-hidden">
                  {/* Список друзей (серверы и диалоги показывает сам MessengerWorkspace) */}
                  {activeView === 'friends' && (
                    <div className="w-60 bg-gray-800 flex flex-col border-r border-gray-700">
                      <FriendsList onSelectFriend={handleSelectFriend} />
                    </div>
                  )}

                  {/* Main chat area */}
                  <div className="flex-1 flex flex-col bg-gray-700">
                    <MessengerWorkspace user={user} openConversationId={openConversationId} />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <motion.div
          className="panel preview"
          layout
          transition={{ type: 'spring', stiffness: 80, damping: 16 }}
          onMouseEnter={() => stage === 'login' && setIsPreviewFocused(true)}
        >
          <MessengerPreview theme={theme} isFocused={previewActive} />
        </motion.div>
      </main>
    </div>
  );
}
