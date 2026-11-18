import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, Plus, X, Minus, Square, PanelsTopLeft, MessageCircle, Users } from 'lucide-react';
import { LoginPanel } from './components/LoginPanel';
import { ProfileSetup } from './components/ProfileSetup';
import { MessengerWorkspace } from './components/MessengerWorkspace';
import { FriendsList } from './components/FriendsList';
import { SettingsPanel } from './components/SettingsPanel';
import { apiFetch } from './lib/api';
import { applyTheme, isThemeChoice, type ThemeChoice } from './lib/theme';
import { t } from './lib/strings';
import type { User } from './types';

type UserSettingsPayload = { settings?: { theme?: string } };
type WorkspaceTab = { id: string; title: string; kind: 'home' | 'workspace' };

export default function App() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeView, setActiveView] = useState<'friends' | 'messages'>('messages');
  const [openConversationId, setOpenConversationId] = useState<number | null>(null);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([{ id: 'home', title: 'Главная', kind: 'home' }]);
  const [activeTabId, setActiveTabId] = useState('home');
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const desktopApi = typeof window !== 'undefined' ? window.nexoAPI : undefined;

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    async function bootstrapSession() {
      try {
        const response = await apiFetch('/api/auth/session');
        if (response.ok) {
          const payload = await response.json();
          setUser(payload.user ?? null);
        } else setUser(null);
      } catch { setUser(null); }
      finally { setLoadingSession(false); }
    }
    bootstrapSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch('/api/settings/me').then(async (response) => {
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as UserSettingsPayload;
      const saved = payload.settings?.theme;
      if (!cancelled && isThemeChoice(saved)) setTheme(saved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!welcomeName) return;
    const timer = window.setTimeout(() => setWelcomeName(null), 2300);
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
  }

  async function handleLogout() {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); }
    finally {
      setUser(null);
      setTabs([{ id: 'home', title: 'Главная', kind: 'home' }]);
      setActiveTabId('home');
    }
  }

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
        if (typeof conversationId === 'number') setOpenConversationId(conversationId);
      } else console.warn('Не удалось открыть диалог:', response.status);
    } catch (error) { console.error('Не удалось открыть диалог', error); }
    finally { setActiveView('messages'); openWorkspaceTab(); }
  }, [tabs]);

  function openWorkspaceTab() {
    const existing = tabs.find((tab) => tab.kind === 'workspace');
    if (existing) { setActiveTabId(existing.id); return; }
    const id = `workspace-${Date.now()}`;
    setTabs((current) => [...current, { id, title: 'Сообщения', kind: 'workspace' }]);
    setActiveTabId(id);
  }

  function addTab() {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setTabs((current) => [...current, { id, title: 'Главная', kind: 'home' }]);
    setActiveTabId(id);
  }

  function closeTab(id: string) {
    if (id === 'home') return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[Math.max(0, index - 1)]?.id || 'home');
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  return (
    <div className="app-root min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="app-nav">
        <div className="titlebar-brand"><span className="brand-mark">N</span><strong>Nexo</strong><span className="titlebar-version">ALPHA</span></div>
        <div className="titlebar-actions">
          {desktopApi && <div className="window-controls">
            <button type="button" className="window-control" aria-label={t('windowMinimize')} onClick={() => desktopApi.minimizeWindow()}><Minus size={15} strokeWidth={1.7} /></button>
            <button type="button" className="window-control" aria-label={t('windowMaximize')} onClick={() => desktopApi.maximizeWindow()}><Square size={12} strokeWidth={1.7} /></button>
            <button type="button" className="window-control close" aria-label={t('windowClose')} onClick={() => desktopApi.closeWindow()}><X size={16} strokeWidth={1.7} /></button>
          </div>}
        </div>
      </header>

      <main className={`app-stage flex-1 ${stage === 'social' ? 'app-stage-social' : ''}`}>
        {loadingSession && <p className="muted">Подключаем Nexo…</p>}
        {!loadingSession && stage === 'login' && <LoginPanel onSuccess={acceptAuth} />}
        {!loadingSession && stage === 'profile' && user && <ProfileSetup user={user} onComplete={completeProfile} />}
        {!loadingSession && stage === 'social' && user && (
          <div className="signed-in-shell">
            <div className="tab-strip">
              <div className="tab-list" role="tablist" aria-label="Вкладки Nexo">
                {tabs.map((tab) => (
                  <button key={tab.id} role="tab" aria-selected={activeTabId === tab.id} className={`workspace-tab ${activeTabId === tab.id ? 'active' : ''}`} onClick={() => setActiveTabId(tab.id)}>
                    {tab.kind === 'home' ? <Home size={14} /> : <MessageCircle size={14} />}
                    <span>{tab.title}</span>
                    {tab.id !== 'home' && <span className="tab-close" role="button" aria-label="Закрыть вкладку" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></span>}
                  </button>
                ))}
              </div>
              <button className="new-tab-button" onClick={addTab} title="Новая вкладка" aria-label="Новая вкладка"><Plus size={17} /></button>
              <div className="tab-strip-spacer" />
              <span className="workspace-indicator"><PanelsTopLeft size={13} /> WORKSPACE</span>
            </div>
            <div className="tab-content">
              <AnimatePresence mode="wait">
                {activeTab.kind === 'home' ? (
                  <motion.section key={activeTab.id} className="home-dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }}>
                    <div className="dashboard-heading">
                      <div><span className="eyebrow">ВАШЕ ПРОСТРАНСТВО</span><h1>С возвращением, {user.display_name || user.username}</h1><p>Всё важное — в одном месте.</p></div>
                      <div className="dashboard-avatar">{(user.display_name || user.username || 'N').slice(0, 1).toUpperCase()}</div>
                    </div>
                    <div className="dashboard-cards">
                      <button className="dashboard-card" onClick={openWorkspaceTab}><span className="dashboard-card-icon"><MessageCircle size={19} /></span><strong>Сообщения и серверы</strong><span>Продолжить общение и открыть рабочее пространство</span></button>
                      <button className="dashboard-card" onClick={() => { setActiveView('friends'); openWorkspaceTab(); }}><span className="dashboard-card-icon"><Users size={19} /></span><strong>Друзья</strong><span>Управлять контактами и находить новых людей</span></button>
                      <button className="dashboard-card" onClick={() => setShowSettings(true)}><span className="dashboard-card-icon"><PanelsTopLeft size={19} /></span><strong>Настройки</strong><span>Аккаунт, оформление и параметры Nexo</span></button>
                    </div>
                    <div className="activity-panel"><div className="activity-panel-heading"><div><span className="eyebrow">NEXO FEED</span><h2>Последняя активность</h2></div><span className="live-dot">ЛИЧНОЕ ПРОСТРАНСТВО</span></div><div className="activity-empty"><div className="activity-empty-icon"><PanelsTopLeft size={22} /></div><strong>Здесь будет ваша активность</strong><p>Новые сообщения, события серверов и обновления друзей появятся здесь.</p></div></div>
                  </motion.section>
                ) : (
                  <motion.div key={activeTab.id} className="workspace-tab-page" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
                    <div className="workspace-shell flex-1 min-h-0">
                      <nav className="app-view-nav flex flex-col items-center gap-2 py-4 border-r border-[var(--border)] bg-[var(--bg-secondary)]">
                        <button type="button" className={`view-nav-button ${activeView === 'messages' ? 'active' : ''}`} aria-label="Сообщения" onClick={() => setActiveView('messages')}><MessageCircle size={19} /></button>
                        <button type="button" className={`view-nav-button ${activeView === 'friends' ? 'active' : ''}`} aria-label="Друзья" onClick={() => setActiveView('friends')}><Users size={19} /></button>
                      </nav>
                      {activeView === 'friends' && <aside className="friends-sidebar"><FriendsList onSelectFriend={handleSelectFriend} /></aside>}
                      <div className="workspace-content"><MessengerWorkspace user={user} openConversationId={openConversationId} onLogout={handleLogout} onOpenSettings={() => setShowSettings(true)} /></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onLogout={handleLogout} />}

      <AnimatePresence>
        {welcomeName && <motion.div className="welcome-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          <motion.div className="welcome-content" initial={{ opacity: 0, y: 34, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -18, scale: 0.99 }} transition={{ type: 'spring', stiffness: 95, damping: 18 }}>
            <span className="welcome-kicker">NEXO / YOUR SPACE</span><h1>Приветствую,</h1><strong>{welcomeName}</strong><span className="welcome-line" />
          </motion.div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}
