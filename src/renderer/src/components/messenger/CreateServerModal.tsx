import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Input, Textarea } from '../ui';

type CreateServerModalStatus = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

export function CreateServerModal({
  status,
  onClose,
  onSubmit
}: {
  status: CreateServerModalStatus;
  onClose: () => void;
  onSubmit: (payload: { name: string; description: string }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (status.type === 'loading') return;
    onSubmit({ name, description });
  }

  return (
    <div className="modal-backdrop">
      <motion.div
        className="modal-panel"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <header>
          <h2>Создать сервер</h2>
          <button className="ghost-icon" onClick={onClose}>
            ✕
          </button>
        </header>
        <p className="muted">Назовите пространство и добавьте короткое описание. Всё можно поменять позже.</p>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            <span>Название</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, Orbit Studio"
              minLength={3}
              maxLength={48}
              required
            />
          </label>
          <label>
            <span>Описание</span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Для команды, сообщества или друзей."
              maxLength={240}
              rows={3}
            />
          </label>
          <button className="primary" type="submit" disabled={status.type === 'loading'}>
            {status.type === 'loading' ? 'Создаём…' : 'Запустить сервер'}
          </button>
          {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
        </form>
      </motion.div>
    </div>
  );
}
