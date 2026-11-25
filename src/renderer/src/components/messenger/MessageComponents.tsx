import type { ReactNode } from 'react';
import { Hash, Plus, Settings, Volume2, Copy } from 'lucide-react';
import type { ChannelMessage, Message, MessageReaction, MessageReply, Server } from '../../types';
import { Avatar } from '../Avatar';

export function ServersRail({
  servers,
  activeServerId,
  onSelectServer,
  onCreateServer
}: {
  servers: Server[];
  activeServerId: number | null;
  onSelectServer: (serverId: number) => void;
  onCreateServer: () => void;
}) {
  return (
    <aside className="servers-rail" aria-label="Ваши пространства">
      <span className="servers-rail-label">ПРОСТРАНСТВА</span>
      {servers.map((server) => (
        <button key={server.id} type="button"
          className={`server-circle ${activeServerId === server.id ? 'active' : ''}`}
          onClick={() => onSelectServer(server.id)} data-tooltip={server.name} aria-label={server.name}>
          {server.icon ? <img src={server.icon} alt="" /> : (server.name[0] || '?').toUpperCase()}
        </button>
      ))}
      <button type="button" className="server-circle ghost" onClick={onCreateServer} data-tooltip="Создать пространство" aria-label="Создать пространство"><Plus size={18} /></button>
    </aside>
  );
}

export function ServerSidebar({
  server,
  activeChannelId,
  onSelectChannel,
  onOpenSettings
}: {
  server: Server;
  activeChannelId: number | null;
  onSelectChannel: (channelId: number) => void;
  onOpenSettings?: () => void;
}) {
  const textChannels = server.channels.filter((channel) => channel.type === 'text');
  const voiceChannels = server.channels.filter((channel) => channel.type !== 'text');
  return (
    <>
      <div className="channel-header">
        {server.name}
        <button type="button" className="ghost-icon" data-tooltip="Настройки пространства" onClick={onOpenSettings}>
          <Settings size={16} />
        </button>
      </div>
      <div className="channel-group">
        <p className="group-title">текстовые</p>
        {textChannels.map((channel) => (
          <button
            key={channel.id}
            className={`channel ${activeChannelId === channel.id ? 'active' : ''}`}
            onClick={() => onSelectChannel(channel.id)}
          >
            <Hash size={14} />
            {channel.name}
          </button>
        ))}
        {textChannels.length === 0 && <p className="muted">Пока нет текстовых каналов.</p>}
      </div>
      <div className="channel-group">
        <p className="group-title">голосовые</p>
        {voiceChannels.map((channel) => (
          <div key={channel.id} className="channel voice channel-unavailable" data-tooltip="Голосовая связь в сообществах ещё не подключена">
            <Volume2 size={14} />{channel.name}<small>позже</small>
          </div>
        ))}
        {voiceChannels.length === 0 && <p className="muted">Добавьте голосовой канал.</p>}
      </div>
      <footer className="self-card">
        <div>
          <p>{server.role === 'owner' ? 'Вы — владелец' : 'Участник'}</p>
          <small>{server.description || 'Настройте сервер в любой момент'}</small>
        </div>
        <span className="self-status"><span className="status-dot" />В сети</span>
      </footer>
    </>
  );
}

export function getMessageDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function getMessageDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dayStamp = (item: Date) => new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime();
  if (dayStamp(date) === dayStamp(today)) return 'Сегодня';
  if (dayStamp(date) === dayStamp(yesterday)) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

export function InlineContent({ text }: { text: string }) {
  const expression = /`([^`]+)`|(https?:\/\/[^\s<>]+)/g;
  const parts: ReactNode[] = [];
  let last = 0, match: RegExpExecArray | null, key = 0;
  while ((match = expression.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(<code key={key++} className="inline-code">{match[1]}</code>);
    } else if (match[2]) {
      const href = match[2].replace(/[),.!?]+$/, '');
      const suffix = match[2].slice(href.length);
      parts.push(<a key={key++} href={href} target="_blank" rel="noreferrer">{href}</a>, suffix);
    }
    last = expression.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function MessageReactions({ reactions, userId, onToggle }: {
  reactions: MessageReaction[];
  userId: number;
  onToggle: (emoji: string) => void;
}) {
  if (!reactions.length) return null;
  return (
    <div className="message-reactions" aria-label="Реакции на сообщение">
      {reactions.map((reaction) => (
        <button key={reaction.emoji} type="button"
          className={reaction.user_ids.includes(userId) ? 'message-reaction active' : 'message-reaction'} data-tooltip={reaction.user_ids.includes(userId) ? 'Убрать реакцию' : 'Добавить реакцию'}
          onClick={() => onToggle(reaction.emoji)}>
          <span>{reaction.emoji}</span><small>{reaction.count}</small>
        </button>
      ))}
    </div>
  );
}

export function MessageReplyPreview({ replyTo, onClick }: { replyTo: MessageReply; onClick: () => void }) {
  return (
    <button type="button" className="message-reply-preview" onClick={onClick} data-tooltip="Перейти к исходному сообщению">
      <span className="message-reply-author">{replyTo.author.display_name || replyTo.author.username}</span>
      <span className="message-reply-content">{replyTo.content || 'Сообщение без текста'}</span>
    </button>
  );
}

export function MessageContent({ content }: { content: string }) {
  const blocks = content.split(/```([a-zA-Z0-9_+.-]*)\n?([\s\S]*?)```/g);
  if (blocks.length === 1) {
    return <div className="message-content"><p><InlineContent text={content} /></p></div>;
  }
  const result: ReactNode[] = [];
  for (let index = 0; index < blocks.length; index += 3) {
    if (blocks[index]) result.push(<p key={`text-${index}`}><InlineContent text={blocks[index]} /></p>);
    const language = blocks[index + 1];
    const code = blocks[index + 2];
    if (code !== undefined) {
      result.push(<div className="message-code-block" key={`code-${index}`}>
        <header><span>{language || 'CODE'}</span><button type="button" className="code-copy-button" data-tooltip="Копировать код" aria-label="Копировать код"
          onClick={() => void copyText(code.trimEnd())}><Copy size={13} />Копировать</button></header>
        <pre><code>{code.replace(/\n$/, '')}</code></pre>
      </div>);
    }
  }
  return <div className="message-content">{result}</div>;
}

export function AttachmentPreview({ attachment }: { attachment: Message['attachment'] | ChannelMessage['attachment'] }) {
  if (!attachment) return null;
  const isImage = attachment.mime.startsWith('image/');
  return (
    <div className="attachment-preview">
      {isImage ? (
        <img src={attachment.url} alt={attachment.name} />
      ) : (
        <a href={attachment.url} target="_blank" rel="noreferrer">
          {attachment.name}
        </a>
      )}
    </div>
  );
}

