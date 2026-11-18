import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FC, FormEvent } from 'react';
import type { FriendRecord, FriendPayload, User, UserStatus } from '../../types';
import { apiFetch } from '../../lib/api';

interface FriendUser extends Omit<User, 'status'> {
  status: UserStatus;
}

interface ExtendedFriendRecord extends Omit<FriendRecord, 'user'> {
  user: FriendUser;
}

interface FriendsListProps {
  onSelectFriend: (friend: FriendUser) => void;
}

const EMPTY_FRIENDS: FriendPayload = { incoming: [], outgoing: [], friends: [] };

export const FriendsList: FC<FriendsListProps> = ({ onSelectFriend }) => {
  const [friends, setFriends] = useState<FriendPayload>(EMPTY_FRIENDS);
  const [activeTab, setActiveTab] = useState<'online' | 'all' | 'pending'>('online');
  const [searchQuery, setSearchQuery] = useState('');
  const [handleQuery, setHandleQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const response = await apiFetch('/api/friends');
      if (!response.ok) throw new Error('Не удалось загрузить список друзей');
      const data = (await response.json()) as Partial<FriendPayload>;
      setFriends({
        incoming: Array.isArray(data.incoming) ? data.incoming : [],
        outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
        friends: Array.isArray(data.friends) ? data.friends : []
      });
    } catch (error) {
      setMessage((error as Error).message || 'Ошибка загрузки друзей');
    } finally {
      setIsLoading(false);
    }
  };

  const respondToRequest = async (requestId: number, action: 'accept' | 'decline') => {
    setMessage('');
    try {
      const response = await apiFetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Не удалось обработать запрос');
      }
      await loadFriends();
    } catch (error) {
      setMessage((error as Error).message || 'Ошибка обработки запроса');
    }
  };

  const sendFriendRequest = async (event: FormEvent) => {
    event.preventDefault();
    const username = handleQuery.trim();
    if (!username || isSubmitting) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Не удалось отправить запрос');
      setHandleQuery('');
      setMessage('Запрос на добавление отправлен');
      await loadFriends();
    } catch (error) {
      setMessage((error as Error).message || 'Ошибка отправки запроса');
    } finally {
      setIsSubmitting(false);
    }
  };

  const matchesSearch = (record: ExtendedFriendRecord) => {
    const query = searchQuery.trim().toLowerCase();
    return !query ||
      (record.user.username || '').toLowerCase().includes(query) ||
      (record.user.display_name || '').toLowerCase().includes(query);
  };

  const filteredFriends = useMemo(
    () => (friends.friends as ExtendedFriendRecord[]).filter(matchesSearch),
    [friends.friends, searchQuery]
  );
  const onlineFriends = filteredFriends.filter((friend) => friend.user.status === 'online');
  const pendingRequests = [...friends.incoming, ...friends.outgoing] as ExtendedFriendRecord[];
  const filteredRequests = pendingRequests.filter(matchesSearch);
  const displayFriends = activeTab === 'online' ? onlineFriends : filteredFriends;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Загружаем друзей…</div>;
  }

  return (
    <div className="flex flex-col h-full bg-gray-800 text-gray-200">
      <form onSubmit={sendFriendRequest} className="p-4 border-b border-gray-700 space-y-2">
        <label className="block text-sm text-gray-300" htmlFor="friend-handle">Добавить друга по имени пользователя</label>
        <div className="flex gap-2">
          <input
            id="friend-handle"
            value={handleQuery}
            onChange={(event) => setHandleQuery(event.target.value)}
            placeholder="Имя пользователя"
            className="min-w-0 flex-1 bg-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-400"
          />
          <button type="submit" disabled={!handleQuery.trim() || isSubmitting}
            className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50">
            {isSubmitting ? '…' : 'Добавить'}
          </button>
        </div>
        {message && <p role="status" className="text-xs text-gray-300">{message}</p>}
      </form>

      <div className="p-4 border-b border-gray-700">
        <input
          type="search"
          placeholder="Найти друзей"
          aria-label="Найти друзей"
          className="w-full bg-gray-700 rounded-md px-4 py-2 text-sm text-white placeholder-gray-400"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      <div className="flex border-b border-gray-700">
        <button type="button" className={`flex-1 py-3 text-xs font-medium ${activeTab === 'online' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}
          onClick={() => setActiveTab('online')}>В сети ({onlineFriends.length})</button>
        <button type="button" className={`flex-1 py-3 text-xs font-medium ${activeTab === 'all' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}
          onClick={() => setActiveTab('all')}>Все ({friends.friends.length})</button>
        <button type="button" className={`flex-1 py-3 text-xs font-medium ${activeTab === 'pending' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}
          onClick={() => setActiveTab('pending')}>Заявки ({pendingRequests.length})</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'pending' ? (
          filteredRequests.length ? (
            <AnimatePresence initial={false}>
            {filteredRequests.map((request) => (
            <motion.div key={request.id} layout
              className="p-3 border-b border-gray-700 flex items-center justify-between gap-3"
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.16 }}>
              <div className="min-w-0">
                <div className="font-medium text-white truncate">{request.user.display_name || request.user.username}</div>
                <div className="text-xs text-gray-400">{request.direction === 'incoming' ? 'Входящая заявка' : 'Ожидает ответа'}</div>
              </div>
              {request.direction === 'incoming' && (
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => void respondToRequest(request.id, 'accept')}
                    className="px-3 py-1 text-xs text-white bg-green-700 rounded">Принять</button>
                  <button type="button" onClick={() => void respondToRequest(request.id, 'decline')}
                    className="px-3 py-1 text-xs text-white bg-red-700 rounded">Отклонить</button>
                </div>
              )}
            </motion.div>
            ))}
            </AnimatePresence>
          ) : <p className="p-6 text-center text-gray-400">Нет ожидающих заявок</p>
        ) : (
          displayFriends.length ? (
            <AnimatePresence initial={false}>
            {displayFriends.map((friend) => (
            <motion.button type="button" key={friend.id} layout
              onClick={() => onSelectFriend(friend.user)}
              className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-700/60 border-b border-gray-700"
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.16 }}>
              <span className={`w-3 h-3 rounded-full shrink-0 ${friend.user.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="min-w-0">
                <span className="block font-medium text-white truncate">{friend.user.display_name || friend.user.username}</span>
                <span className="block text-xs text-gray-400">{friend.user.status === 'online' ? 'В сети' : 'Не в сети'}</span>
              </span>
            </motion.button>
            ))}
            </AnimatePresence>
          ) : <p className="p-6 text-center text-gray-400">{activeTab === 'online' ? 'Нет друзей в сети' : 'Пока нет друзей'}</p>
        )}
      </div>
    </div>
  );
};

export default FriendsList;
