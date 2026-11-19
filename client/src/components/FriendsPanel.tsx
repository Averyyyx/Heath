import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, UserPlus, X, MessageCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Avatar } from './Avatar';
import type { FriendPayload, FriendRecord, User } from '../types';

type FriendsPanelProps = {
  user: User;
  onRefresh?: () => void;
  onOpenConversation?: (friend: Pick<User, 'username'>) => void;
};
type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };
const emptyPayload: FriendPayload = { incoming: [], outgoing: [], friends: [] };

export function FriendsPanel({ user, onRefresh, onOpenConversation }: FriendsPanelProps) {
  const [handleQuery, setHandleQuery] = useState('');
  const [friends, setFriends] = useState<FriendPayload>(emptyPayload);
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void refreshFriends();
    const socket = getSocket();
    const onUserUpdate = ({ user: updated }: { user: User }) => {
      setFriends((current) => ({
        incoming: current.incoming.map((item) => item.user.id === updated.id ? { ...item, user: updated } : item),
        outgoing: current.outgoing.map((item) => item.user.id === updated.id ? { ...item, user: updated } : item),
        friends: current.friends.map((item) => item.user.id === updated.id ? { ...item, user: updated } : item)
      }));
    };
    socket.on('user:update', onUserUpdate);
    return () => socket.off('user:update', onUserUpdate);
  }, []);

  async function refreshFriends() {
    setLoading(true);
    try {
      const response = await apiFetch('/api/friends');
      if (!response.ok) throw new Error('Не удалось загрузить список людей.');
      setFriends(await response.json());
      onRefresh?.();
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    } finally { setLoading(false); }
  }

  async function handleAddFriend(event: FormEvent) {
    event.preventDefault();
    if (!handleQuery.trim()) return;
    setStatus({ type: 'loading', message: 'Отправляем запрос…' });
    try {
      const response = await apiFetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: handleQuery.trim().replace(/^@/, '') })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Не удалось отправить запрос.');
      }
      setHandleQuery('');
      setStatus({ type: 'success', message: 'Запрос отправлен.' });
      await refreshFriends();
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    }
  }

  async function handleRespond(requestId: number, action: 'accept' | 'decline') {
    try {
      const response = await apiFetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Не удалось обновить запрос.');
      }
      await refreshFriends();
    } catch (error) {
      setStatus({ type: 'error', message: (error as Error).message });
    }
  }

  return (
    <div className="friends-panel people-page">
      <div className="panel-headline">
        <div><p className="eyebrow">ЛЮДИ И КОНТАКТЫ</p><h1>Ваш круг общения</h1>
          <p className="muted">Находите людей по нику и собирайте свой круг в Nexo.</p></div>
        <div className="self-handle"><span>ВАШ НИК</span><strong>@{user.username}</strong></div>
      </div>

      <form className="friend-form" onSubmit={handleAddFriend}>
        <div><label htmlFor="friend-handle">Добавить человека</label>
          <p className="muted">Введите уникальный ник. Запрос появится у получателя.</p></div>
        <div className="friend-form-fields">
          <input id="friend-handle" value={handleQuery} onChange={(event) => setHandleQuery(event.target.value)}
            placeholder="@orbit-designer" required maxLength={25} />
          <button type="submit" className="primary" disabled={status.type === 'loading'}>
            <UserPlus size={16} />Добавить
          </button>
        </div>
      </form>

      {status.message && <p className={`status ${status.type}`}>{status.message}</p>}

      <div className="people-columns">
        <section className="friend-section">
          <header><h2>Входящие</h2><span>{friends.incoming.length}</span></header>
          <div className="friend-list">
            {friends.incoming.length === 0 && <p className="muted">Новых запросов нет.</p>}
            {friends.incoming.map((request) => (
              <FriendCard key={request.id} record={request} actions={<>
                <button type="button" className="ghost-icon" onClick={() => handleRespond(request.id, 'decline')} aria-label="Отклонить запрос"><X size={16} /></button>
                <button type="button" className="ghost-icon" onClick={() => handleRespond(request.id, 'accept')} aria-label="Принять запрос"><Check size={16} /></button>
              </>} />
            ))}
          </div>
        </section>
        <section className="friend-section">
          <header><h2>Отправленные</h2><span>{friends.outgoing.length}</span></header>
          <div className="friend-list">
            {friends.outgoing.length === 0 && <p className="muted">Ожидающих запросов нет.</p>}
            {friends.outgoing.map((request) => <FriendCard key={request.id} record={request} />)}
          </div>
        </section>
        <section className="friend-section people-friends">
          <header><h2>Ваши люди</h2><span>{friends.friends.length}</span></header>
          <div className="friend-list">
            {loading && <p className="muted">Загружаем…</p>}
            {!loading && friends.friends.length === 0 && <p className="muted">Здесь появятся принятые контакты.</p>}
            {friends.friends.map((friend) => (
              <FriendCard key={friend.id} record={friend} actions={
                <button type="button" className="ghost-icon" title="Открыть диалог" aria-label="Открыть диалог"
                  onClick={() => onOpenConversation?.({ username: friend.user.username })}>
                  <MessageCircle size={16} />
                </button>
              } />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FriendCard({ record, actions }: { record: FriendRecord; actions?: ReactNode }) {
  const name = record.user.display_name || record.user.username;
  return (
    <motion.article className={`friend-card ${record.status}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Avatar user={record.user} size={32} showStatus />
      <div className="friend-identity"><p>{name}</p><small>@{record.user.username}</small></div>
      {actions && <div className="friend-actions">{actions}</div>}
    </motion.article>
  );
}
