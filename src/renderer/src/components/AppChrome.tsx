import { useEffect, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown, ChevronRight, MessageCircle, Command, Search, CornerDownLeft
} from 'lucide-react';
import { Input } from './ui';
import { Avatar } from './Avatar';
import { apiFetch } from '../lib/api';
import type { Conversation, Server, User } from '../types';

export type SidebarPin = { id: string; kind: 'dm' | 'channel'; title: string; targetId: number; serverId?: number; channelId?: number };
export type PaletteEntry = { id: string; title: string; subtitle?: string; group: string; icon: ReactNode; run: () => void };

export function fuzzyMatch(text: string, query: string) {
  const source = text.toLocaleLowerCase('ru-RU');
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  if (!needle) return true;
  if (source.includes(needle)) return true;
  let cursor = 0;
  for (const character of needle) {
    cursor = source.indexOf(character, cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

export function formatCallDuration(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function HashIcon() { return <span className="hash-icon">#</span>; }

export function SidebarSection({ title, count, collapsed, onToggle, action, children }: {
  title: string; count: number; collapsed: boolean; onToggle: () => void; action?: ReactNode; children: ReactNode;
}) {
  return <section className="sidebar-section">
    <header><button type="button" className="sidebar-section-toggle" onClick={onToggle}>
      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span>{title}</span>{count > 0 && <small>{count}</small>}
    </button>{action}</header>
    {!collapsed && <div className="sidebar-section-body">{children}</div>}
  </section>;
}

export function SidebarTarget({ item, onClick, onContextMenu }: { item: SidebarPin; onClick: () => void; onContextMenu: (event: MouseEvent) => void }) {
  return <button type="button" className="sidebar-row" onClick={onClick} onContextMenu={onContextMenu}>
    {item.kind === 'dm' ? <MessageCircle size={15} /> : <HashIcon />}<span className="sidebar-row-text"><strong>{item.title}</strong></span>
  </button>;
}

export function HomeView({ user, conversations, servers, unreadDmCounts, unreadChannelCounts, openFriends, openPalette, openDm, openChannel }: {
  user: User; conversations: Conversation[]; servers: Server[];
  unreadDmCounts: Record<number, number>; unreadChannelCounts: Record<number, number>;
  openFriends: () => void; openPalette: () => void;
  openDm: (conversation: Conversation) => void; openChannel: (server: Server, channelId: number) => void;
}) {
  const recent = conversations.slice(0, 6);
  const channels = servers.flatMap((server) => server.channels
    .filter((channel) => channel.type === 'text')
    .slice(0, 3)
    .map((channel) => ({ server, channel }))).slice(0, 6);
  const [lastItems, setLastItems] = useState<Record<string, { content: string; created_at: string; authorId?: number }>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadChannelPreviews() {
      const entries = await Promise.all(channels.map(async ({ server, channel }) => {
        try {
          const response = await apiFetch(`/api/servers/${server.id}/channels/${channel.id}/messages?limit=1`);
          if (!response.ok) return null;
          const payload = await response.json();
          const message = (payload.messages || []).slice(-1)[0];
          if (!message) return null;
          const content = message.content?.trim() || (message.attachment?.mime?.startsWith('image/') ? 'Фото' : message.attachment ? `Файл: ${message.attachment.name}` : 'Сообщение');
          return [`channel:${channel.id}`, { content, created_at: message.created_at, authorId: message.author?.id }] as const;
        } catch { return null; }
      }));
      if (!cancelled) {
        const next: Record<string, { content: string; created_at: string; authorId?: number }> = {};
        for (const entry of entries) if (entry) next[entry[0]] = entry[1];
        setLastItems(next);
      }
    }
    void loadChannelPreviews();
    return () => { cancelled = true; };
  }, [servers]);

  const formatTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  };
  const dmPreview = (conversation: Conversation) => {
    const message = conversation.last_message;
    if (!message) return 'Личный диалог';
    const content = message.content?.trim() || (message.attachment?.mime?.startsWith('image/') ? 'Фото' : message.attachment ? `Файл: ${message.attachment.name}` : 'Сообщение');
    return message.author.id === user.id ? `Вы: ${content}` : content;
  };
  const hasItems = recent.length > 0 || channels.length > 0;
  return <div className="hr-home-view">
    <div className="home-welcome">
      <div><h1>Рады видеть, {user.display_name || user.username}</h1>
        <p>Продолжайте разговоры и возвращайтесь к своим проектам.</p></div>
      <button type="button" className="primary" onClick={openPalette}><Command size={16} />Быстрый переход <kbd>Ctrl K</kbd></button>
    </div>
    <section className="home-continue">
      <h2>Продолжить</h2>
      {hasItems ? <div className="home-continue-list">
        {recent.map((conversation) => {
          const person = conversation.counterpart || conversation.participants.find((participant) => participant.id !== user.id);
          const name = person?.display_name || person?.username || conversation.title || 'Диалог';
          const message = conversation.last_message;
          const unread = unreadDmCounts[conversation.id] || 0;
          return <button className="home-continue-item" key={`dm-${conversation.id}`} type="button" onClick={() => openDm(conversation)}>
            <Avatar user={person} size={36} showStatus />
            <span><strong>{name}</strong><small>{dmPreview(conversation)}</small></span>
            {message && <time>{formatTime(message.created_at)}</time>}
            {unread > 0 && <span className="home-unread">{unread > 99 ? '99+' : unread}</span>}
            <ChevronRight size={15} />
          </button>;
        })}
        {channels.map(({ server, channel }) => {
          const preview = lastItems[`channel:${channel.id}`];
          const unread = unreadChannelCounts[channel.id] || 0;
          return <button className="home-continue-item" key={`channel-${channel.id}`} type="button" onClick={() => openChannel(server, channel.id)}>
            <span className="home-channel-avatar"><HashIcon /></span>
            <span><strong>{channel.name}</strong><small>{preview ? `${preview.authorId === user.id ? 'Вы: ' : ''}${preview.content}` : server.name}</small></span>
            {preview && <time>{formatTime(preview.created_at)}</time>}
            {unread > 0 && <span className="home-unread">{unread > 99 ? '99+' : unread}</span>}
            <ChevronRight size={15} />
          </button>;
        })}
      </div> : <div className="home-empty">
        <MessageCircle size={22} /><strong>Пока здесь тихо</strong>
        <p>Добавьте друга, чтобы начать общение.</p>
        <button className="primary tiny" onClick={openFriends}>Найти друга</button>
      </div>}
    </section>
  </div>;
}

export function CommandPalette({ entries, query, activeIndex, setQuery, onKeyDown, onClose, onRun }: {
  entries: PaletteEntry[]; query: string; activeIndex: number; setQuery: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void; onClose: () => void; onRun: (entry: PaletteEntry) => void;
}) {
  const filtered = entries.filter((entry) => fuzzyMatch(`${entry.title} ${entry.subtitle || ''}`, query));
  let index = -1;
  return <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div className="command-palette" initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .99 }}>
      <div className="command-search"><Search size={18} /><Input className="command-palette-input" value={query} onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown} placeholder="Куда перейти или что выполнить?" /><kbd>ESC</kbd></div>
      <div className="command-results">
        {['Диалоги', 'Друзья', 'Каналы', 'Действия'].map((group) => {
          const groupItems = filtered.filter((entry) => entry.group === group);
          if (!groupItems.length) return null;
          return <section key={group}><p>{group}</p>{groupItems.map((entry) => {
            index += 1;
            const currentIndex = index;
            return <button key={entry.id} type="button" className={currentIndex === activeIndex ? 'active' : ''}
              onMouseEnter={() => { /* keyboard index remains deterministic */ }} onClick={() => onRun(entry)}>
              <span>{entry.icon}</span><strong>{entry.title}</strong>{entry.subtitle && <small>{entry.subtitle}</small>}
              <CornerDownLeft size={13} />
            </button>;
          })}</section>;
        })}
        {!filtered.length && <div className="command-no-results">Ничего не найдено</div>}
      </div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> Навигация</span><span><kbd>Enter</kbd> Открыть</span><span><kbd>Esc</kbd> Закрыть</span></footer>
    </motion.div>
  </div>;
}

export function ContextMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const close = () => onClose();
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - 210);
  return <div className="hr-context-menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}>{children}</div>;
}

export function MenuAction({ icon, label, onClick }: { icon?: ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className="menu-action" onClick={onClick}>{icon}<span>{label}</span></button>;
}

export function WelcomeOverlay({ kind, name, onClose }: { kind: 'back' | 'new'; name: string; onClose: () => void }) {
  return <motion.div className="welcome-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div className="welcome-content" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 95, damping: 18 }}>
      <div className="welcome-copy">
        <motion.h1 initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: .9 }}>
          {kind === 'back' ? 'Рады видеть снова,' : 'Добро пожаловать,'}
        </motion.h1>
        <motion.strong initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35, duration: .65 }}>{name}</motion.strong>
      </div>
      <motion.span className="welcome-line center" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
        transition={{ delay: .35, duration: .9, ease: [0.22, 1, 0.36, 1] }} />
    </motion.div>
  </motion.div>;
}

