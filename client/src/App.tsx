import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, MessageCircle, Users, Layers3, Settings, Sparkles, Compass } from 'lucide-react';
import { LoginPanel } from './components/LoginPanel';
import { ProfileSetup } from './components/ProfileSetup';
import { MessengerWorkspace } from './components/MessengerWorkspace';
import { FriendsPanel } from './components/FriendsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { apiFetch } from './lib/api';
import { applyTheme, isThemeChoice, type ThemeChoice } from './lib/theme';
import type { User } from './types';

type AppArea = 'overview' | 'messages' | 'people' | 'communities';
type UpdateResult = { status: string; version?: string; message: string };

const loadingPhrases = [
  'Здесь разговоры находят своё продолжение.',
  'Хорошие идеи редко рождаются в одиночку.',
  'Настраиваем место для следующей мысли.',
  'Пусть важное не потеряется в потоке.',
  'Каждое пространство начинается с людей.',
  'Собираем ваши разговоры в одном месте.',
  'Тишина перед началом хорошего проекта.',
  'Связь — это больше, чем список контактов.',
  'Ваша команда уже почти на месте.',
  'Идеи любят ясное пространство.',
  'Подключаемся к тому, что действительно важно.',
  'Небольшая пауза — и можно продолжать.',
  'Ни одна хорошая мысль не должна затеряться.',
  'Рабочее место для людей, а не для шума.',
  'Пусть путь от идеи до разговора будет короче.',
  'Скоро здесь появится что-то интересное.',
  'Ваше пространство, ваш ритм, ваши правила.',
  'Собираем детали, чтобы вы могли собирать идеи.',
  'Вместе проще довести начатое до конца.',
  'Каждой команде нужно своё место встречи.',
  'Подготавливаем каналы для новых открытий.',
  'Общение без лишних перегородок.',
  'Пусть нужные люди будут на расстоянии одного клика.',
  'Запускаем инструменты для совместной работы.',
  'Новый день — новый повод что-то создать.',
  'Сначала связь. Затем всё остальное.',
  'Оставим сложность внутри, а снаружи — ясность.',
  'Ваши люди, проекты и мысли скоро встретятся.',
  'Пусть разговор двигает работу вперёд.',
  'Nexo готовит для вас место.'
];

export default function App() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const [activeArea, setActiveArea] = useState<AppArea>('overview');
  const [openConversationId, setOpenConversationId] = useState<number | null>(null);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [appVersion, setAppVersion] = useState('0.0.3-alpha');
  const desktopApi = typeof window !== 'undefined' ? window.nexoAPI : undefined;

  useEffect(() => {
    applyTheme(theme);
    desktopApi?.setWindowTheme?.(theme);
  }, [theme, desktopApi]);

  useEffect(() => {
    if (!loadingSession) return;
    const timer = window.setInterval(() => {
      setLoadingPhraseIndex((current) => (current + 1) % loadingPhrases.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [loadingSession]);

  useEffect(() => {
    let active = true;
    async function bootstrapSession() {
      try {
        const response = await apiFetch('/api/auth/session');
        if (!response.ok) throw new Error('Session unavailable');
        const payload = await response.json();
        if (active) setUser(payload.user ?? null);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoadingSession(false);
      }
    }
    void bootstrapSession();
    desktopApi?.getAppVersion?.()
      .then((version) => { if (active) setAppVersion(version); })
      .catch(() => {});
    return () => { active = false; };
  }, [desktopApi]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch('/api/settings/me')
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!cancelled && isThemeChoice(payload.settings?.theme)) setTheme(payload.settings.theme);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!welcomeName) return;
    const timer = window.setTimeout(() => setWelcomeName(null), 2400);
    return () => window.clearTimeout(timer);
  }, [welcomeName]);

  const stage: 'login' | 'profile' | 'social' = user
    ? user.profile_complete ? 'social' : 'profile'
    : 'login';

  function acceptAuth(nextUser: User) {
    setUser(nextUser);
    if (nextUser.profile_complete) setWelcomeName(nextUser.display_name || nextUser.username);
  }

  function completeProfile(nextUser: User) {
    setUser(nextUser);
    setWelcomeName(nextUser.display_name || nextUser.username);
    setActiveArea('overview');
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setShowSettings(false);
      setActiveArea('overview');
      setOpenConversationId(null);
    }
  }

  const handleOpenFriend = useCallback(async (friend: Pick<User, 'username'>) => {
    try {
      const response = await apiFetch('/api/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: friend.username })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Не удалось открыть диалог.');
      }
      const payload = await response.json();
      if (typeof payload.conversation?.id === 'number') {
        setOpenConversationId(payload.conversation.id);
        setActiveArea('messages');
      }
    } catch (error) {
      console.error('Не удалось открыть диалог:', error);
    }
  }, []);

  async function handleCheckUpdates(): Promise<UpdateResult> {
    if (!desktopApi?.checkForUpdates) {
      return { status: 'unavailable', message: 'Проверка обновлений доступна в настольной версии Nexo.' };
    }
    return desktopApi.checkForUpdates();
  }

  const areaMeta: Record<AppArea, { title: string; subtitle: string; eyebrow: string }> = {
    overview: { title: 'Обзор', subtitle: 'Ваше пространство — без лишних вкладок.', eyebrow: 'NEXO / HOME' },
    messages: { title: 'Диалоги', subtitle: 'Личные разговоры и быстрые звонки.', eyebrow: 'NEXO / MESSAGES' },
    people: { title: 'Люди', subtitle: 'Контакты, запросы и новые знакомства.', eyebrow: 'NEXO / PEOPLE' },
    communities: { title: 'Сообщества', subtitle: 'Ваши пространства и тематические каналы.', eyebrow: 'NEXO / SPACES' }
  };

  return (
    <div className="app-root">
      <header className="app-nav">
        <div className="titlebar-brand">
          <span className="brand-mark">N</span>
          <strong>Nexo</strong>
          <span className="titlebar-version">ALPHA</span>
        </div>
        <div className="titlebar-center">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <div className="titlebar-actions">
          <span className="titlebar-account">{user?.display_name || user?.username || 'Nexo'}</span>
        </div>
      </header>

      <main className={`app-stage ${stage === 'social' ? 'app-stage-social' : ''}`}>
        {loadingSession && (
          <div className="app-loading-screen">
            <motion.div className="loading-emblem" initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <span className="loading-mark">N</span>
            </motion.div>
            <p className="loading-brand">Nexo</p>
            <span className="loading-caption">YOUR SPACE TO CONNECT</span>
            <p className="loading-status">Подготавливаем ваше пространство</p>
            <AnimatePresence mode="wait">
              <motion.p key={loadingPhraseIndex} className="loading-phrase"
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.35 }}>
                {loadingPhrases[loadingPhraseIndex]}
              </motion.p>
            </AnimatePresence>
            <div className="loading-track"><motion.span
              initial={{ scaleX: 0.12 }} animate={{ scaleX: [0.12, 0.78, 0.35, 0.92] }}
              transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
            /></div>
            <span className="loading-footnote">NEXO DESKTOP · ALPHA</span>
          </div>
        )}
        {!loadingSession && stage === 'login' && <LoginPanel onSuccess={acceptAuth} />}
        {!loadingSession && stage === 'profile' && user && <ProfileSetup user={user} onComplete={completeProfile} />}
        {!loadingSession && stage === 'social' && user && (
          <div className="nexo-shell">
            <aside className="nexo-rail">
              <div className="nexo-rail-brand"><span className="brand-mark">N</span></div>
              <nav className="nexo-rail-nav" aria-label="Основная навигация">
                <NavItem active={activeArea === 'overview'} label="Обзор" onClick={() => setActiveArea('overview')}><Home size={19} /></NavItem>
                <NavItem active={activeArea === 'messages'} label="Диалоги" onClick={() => setActiveArea('messages')}><MessageCircle size={19} /></NavItem>
                <NavItem active={activeArea === 'people'} label="Люди" onClick={() => setActiveArea('people')}><Users size={19} /></NavItem>
                <NavItem active={activeArea === 'communities'} label="Сообщества" onClick={() => setActiveArea('communities')}><Layers3 size={19} /></NavItem>
              </nav>
              <div className="nexo-rail-bottom">
                <button type="button" className="nexo-rail-item" onClick={() => setShowSettings(true)} title="Настройки">
                  <Settings size={19} /><span>Настройки</span>
                </button>
                <div className="nexo-user-chip" title={user.display_name || user.username}>
                  <span className="nexo-user-avatar" style={{ backgroundColor: user.avatar_color || '#D97757' }}>
                    {(user.display_name || user.username || 'N').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="nexo-user-label">{user.display_name || user.username}</span>
                </div>
              </div>
            </aside>

            <section className="nexo-content">
              <header className="nexo-section-header">
                <div>
                  <p className="eyebrow">{areaMeta[activeArea].eyebrow}</p>
                  <h1>{areaMeta[activeArea].title}</h1>
                </div>
                <p>{areaMeta[activeArea].subtitle}</p>
              </header>

              <div className="nexo-section-body">
                <AnimatePresence mode="wait">
                  {activeArea === 'overview' && (
                    <motion.section key="overview" className="nexo-page overview-page"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.18 }}>
                      <div className="overview-intro">
                        <div>
                          <p className="eyebrow">РАДЫ ВАС ВИДЕТЬ</p>
                          <h2>{user.display_name || user.username}</h2>
                          <p>Выберите, куда направиться дальше.</p>
                        </div>
                        <div className="overview-mark"><Sparkles size={24} /></div>
                      </div>
                      <div className="overview-launchers">
                        <button type="button" className="overview-launcher" onClick={() => setActiveArea('messages')}>
                          <span className="launcher-icon"><MessageCircle size={20} /></span>
                          <strong>Продолжить разговор</strong>
                          <span>Откройте личные диалоги и звонки</span>
                          <small>ДИАЛОГИ <Compass size={13} /></small>
                        </button>
                        <button type="button" className="overview-launcher" onClick={() => setActiveArea('people')}>
                          <span className="launcher-icon"><Users size={20} /></span>
                          <strong>Найти своих людей</strong>
                          <span>Запросы, контакты и новые знакомства</span>
                          <small>КОНТАКТЫ <Compass size={13} /></small>
                        </button>
                        <button type="button" className="overview-launcher" onClick={() => setActiveArea('communities')}>
                          <span className="launcher-icon"><Layers3 size={20} /></span>
                          <strong>Открыть сообщества</strong>
                          <span>Тематические пространства и каналы</span>
                          <small>ПРОСТРАНСТВА <Compass size={13} /></small>
                        </button>
                      </div>
                      <div className="overview-note">
                        <span className="note-rule" />
                        <p><strong>Nexo</strong> — место, где разговоры и совместная работа живут рядом.</p>
                      </div>
                    </motion.section>
                  )}

                  {activeArea === 'messages' && (
                    <motion.div key="messages" className="nexo-page workspace-page"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}>
                      <MessengerWorkspace key="messages-workspace" user={user} initialMode="friends"
                        hideNavigation showServersRail={false} openConversationId={openConversationId}
                        onFindFriends={() => setActiveArea('people')} onOpenSettings={() => setShowSettings(true)} />
                    </motion.div>
                  )}

                  {activeArea === 'people' && (
                    <motion.div key="people" className="nexo-page people-page-wrap"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}>
                      <FriendsPanel user={user} onOpenConversation={handleOpenFriend} />
                    </motion.div>
                  )}

                  {activeArea === 'communities' && (
                    <motion.div key="communities" className="nexo-page workspace-page"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}>
                      <MessengerWorkspace key="communities-workspace" user={user} initialMode="servers"
                        hideNavigation showServersRail openConversationId={null}
                        onOpenSettings={() => setShowSettings(true)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
          </div>
        )}
      </main>

      {showSettings && (
        <SettingsPanel appVersion={appVersion} onCheckUpdates={handleCheckUpdates}
          onClose={() => setShowSettings(false)} onLogout={handleLogout} />
      )}

      <AnimatePresence>
        {welcomeName && (
          <motion.div className="welcome-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <motion.div className="welcome-content" initial={{ opacity: 0, y: 34, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -18, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 95, damping: 18 }}>
              <div className="welcome-copy">
                <h1>Приветствую,</h1>
                <strong>{welcomeName}</strong>
              </div>
              <motion.span className="welcome-line" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ delay: 0.28, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ active, label, onClick, children }: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`nexo-rail-item ${active ? 'active' : ''}`}
      aria-current={active ? 'page' : undefined} title={label} onClick={onClick}>
      {children}<span>{label}</span>
    </button>
  );
}
