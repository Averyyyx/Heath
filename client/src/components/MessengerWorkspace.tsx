import { type FormEvent, type ReactNode, type MouseEvent as ReactMouseEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import SimplePeer, { type SignalData } from 'simple-peer';
import {
  Hash,
  Image as ImageIcon,
  Code,
  Copy,
  Link as LinkIcon,
  Monitor,
  Paperclip,
  Phone,
  PhoneOff,
  Plus,
  SendHorizontal,
  Settings,
  MessageCircle,
  Users,
  X,
  Volume2
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { startNexoRingtone } from '../lib/sounds';
import type {
  Channel,
  ChannelMessage,
  Conversation,
  Message,
  Server,
  User
} from '../types';
import { apiFetch } from '../lib/api';
import { Avatar } from './Avatar';
import { getSocket } from '../lib/socket';

type WorkspaceMode = 'servers' | 'friends';

type MessengerWorkspaceProps = {
  user: User;
  openConversationId?: number | null;
  openServerId?: number | null;
  openChannelId?: number | null;
  openMessageId?: number | null;
  embedded?: boolean;
  showConversationList?: boolean;
  showChannelSidebar?: boolean;
  micMuted?: boolean;
  deafened?: boolean;
  audioInputId?: string;
  audioOutputId?: string;
  pendingIncomingCall?: IncomingCall | null;
  onIncomingCallHandled?: () => void;
  onOpenSettings?: () => void;
  onEditChannel?: () => void;
  onFindFriends?: () => void;
  initialMode?: WorkspaceMode;
  hideNavigation?: boolean;
  showServersRail?: boolean;
};

type MessageStore = Record<number, Message[]>;
type ChannelMessageStore = Record<number, ChannelMessage[]>;

type CallState = {
  conversationId: number;
  peer: SimplePeer.Instance | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isScreenSharing: boolean;
  initiator: boolean;
  mediaType?: 'audio' | 'video';
  startedAt: number;
};

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };
type IncomingCall = { conversationId: number; from: number; user: User; mediaType: 'audio' | 'video'; groupTitle?: string };
type ServerMember = { id: number; user: User; role: string; nickname?: string; roles: Array<{ id: number; name: string; color: string; position: number }> };


function appendUniqueMessage(store: MessageStore, conversationId: number, message: Message): MessageStore {
  const current = store[conversationId] || [];
  if (current.some((item) => item.id === message.id)) return store;
  return { ...store, [conversationId]: [...current, message] };
}

function appendUniqueChannelMessage(store: ChannelMessageStore, channelId: number, message: ChannelMessage): ChannelMessageStore {
  const current = store[channelId] || [];
  if (current.some((item) => item.id === message.id)) return store;
  return { ...store, [channelId]: [...current, message] };
}

export function MessengerWorkspace({
  user,
  openConversationId = null,
  openServerId = null,
  openChannelId = null,
  openMessageId = null,
  embedded = false,
  showConversationList = true,
  showChannelSidebar = true,
  micMuted = false,
  deafened = false,
  audioInputId = '',
  audioOutputId = '',
  pendingIncomingCall = null,
  onIncomingCallHandled,
  onOpenSettings,
  onEditChannel,
  onFindFriends,
  initialMode = 'servers',
  hideNavigation = false,
  showServersRail = true
}: MessengerWorkspaceProps) {
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messageStore, setMessageStore] = useState<MessageStore>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUser, setTypingUser] = useState<User | null>(null);
  const [animatedMessageIds, setAnimatedMessageIds] = useState<string[]>([]);
  const [callError, setCallError] = useState('');
  const [composerText, setComposerText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [channelMessages, setChannelMessages] = useState<ChannelMessageStore>({});
  const [loadingChannelMessages, setLoadingChannelMessages] = useState(false);
  const [channelComposer, setChannelComposer] = useState('');
  const [channelUpload, setChannelUpload] = useState<File | null>(null);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [serverModalStatus, setServerModalStatus] = useState<Status>({ type: 'idle' });

  const socketRef = useRef<Socket | null>(null);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [ringtoneMuted, setRingtoneMuted] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [messageContext, setMessageContext] = useState<{ x: number; y: number; message: Message | ChannelMessage; kind: 'dm' | 'channel' } | null>(null);
  const [membersError, setMembersError] = useState('');
  const pendingIncomingSignalRef = useRef<SignalData | null>(null);
  const awaitingCallAcceptRef = useRef<number | null>(null);
  const queuedCallSignalsRef = useRef<SignalData[]>([]);
  const callStateRef = useRef<CallState | null>(null);
  const previousChannelRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const channelComposerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const callWasActiveRef = useRef(false);
  useEffect(() => {
    if (callState) {
      callWasActiveRef.current = true;
      window.dispatchEvent(new CustomEvent('nexo-call-state', { detail: {
        active: true, conversationId: callState.conversationId,
        title: 'Личный звонок', startedAt: callState.startedAt
      } }));
    } else if (callWasActiveRef.current) {
      callWasActiveRef.current = false;
      window.dispatchEvent(new CustomEvent('nexo-call-state', { detail: { active: false } }));
    }
  }, [callState]);

  useEffect(() => {
    if (!pendingIncomingCall || pendingIncomingCall.conversationId !== openConversationId) return;
    setIncomingCall(pendingIncomingCall);
    pendingIncomingSignalRef.current = null;
  }, [pendingIncomingCall, openConversationId]);

  useEffect(() => {
    fetchConversations();
    fetchServers();
  }, []);

  // Внешняя команда «открыть диалог»: подгружаем список (диалог мог быть только что создан)
  // и делаем его активным в разделе личных сообщений.
  useEffect(() => {
    if (!openConversationId) return;
    setMode('friends');
    setActiveConversationId(openConversationId);
    fetchConversations();
  }, [openConversationId]);

  useEffect(() => {
    if (!openServerId) return;
    setMode('servers');
    setActiveServerId(openServerId);
  }, [openServerId]);

  useEffect(() => {
    if (!openChannelId) return;
    setMode('servers');
    setActiveChannelId(openChannelId);
  }, [openChannelId]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socketRef.current = socket;
    const onConversationUpsert = ({ conversation }: { conversation: Conversation }) => {
      setConversations((prev) => prev.some((item) => item.id === conversation.id)
        ? prev.map((item) => item.id === conversation.id ? conversation : item)
        : [conversation, ...prev]);
    };
    const onMessageNew = ({ conversationId, message }: { conversationId: number; message: Message }) => {
      setMessageStore((prev) => appendUniqueMessage(prev, conversationId, message));
      if (message.author.id !== user.id) {
        const key = `dm:${message.id}`;
        setAnimatedMessageIds((current) => [...current.filter((item) => item !== key), key]);
        window.setTimeout(() => setAnimatedMessageIds((current) => current.filter((item) => item !== key)), 850);
      }
    };
    const onMessageAck = ({ conversationId, message }: { conversationId: number; message: Message }) =>
      setMessageStore((prev) => appendUniqueMessage(prev, conversationId, message));
    const onMessageDelete = ({ conversationId, messageId }: { conversationId: number; messageId: number }) =>
      setMessageStore((prev) => ({ ...prev, [conversationId]: (prev[conversationId] || []).filter((message) => message.id !== messageId) }));
    const onTyping = ({ conversationId, user: typing, isTyping }: { conversationId: number; user: User; isTyping: boolean }) => {
      if (conversationId !== activeConversationId || typing?.id === user.id) return;
      setTypingUser(isTyping ? typing : null);
    };
    const onCallInvite = (payload: IncomingCall) => {
      if (payload.conversationId !== activeConversationId) return;
      setIncomingCall({ ...payload, mediaType: payload.mediaType === 'video' ? 'video' : 'audio' });
      setRingtoneMuted(false);
      pendingIncomingSignalRef.current = null;
    };
    const onCallSignal = ({ conversationId, payload }: { conversationId: number; payload: SignalData }) => {
      const current = callStateRef.current;
      if (current?.conversationId === conversationId) current.peer?.signal(payload);
    };
    const onCallAccept = ({ conversationId }: { conversationId: number }) => {
      if (awaitingCallAcceptRef.current !== conversationId) return;
      awaitingCallAcceptRef.current = null;
      const queued = queuedCallSignalsRef.current.splice(0);
      queued.forEach((payload) => socket.emit('call:signal', { conversationId, payload }));
    };
    const onCallReject = ({ conversationId }: { conversationId: number }) => {
      if (awaitingCallAcceptRef.current === conversationId) awaitingCallAcceptRef.current = null;
      if (callStateRef.current?.conversationId === conversationId) endCall(false);
    };
    const onCallEnd = ({ conversationId }: { conversationId: number }) => {
      if (callStateRef.current?.conversationId === conversationId) endCall(false);
      if (incomingCall?.conversationId === conversationId) { setIncomingCall(null); onIncomingCallHandled?.(); }
    };
    const onServerUpsert = ({ server }: { server: Server }) => {
      setServers((prev) => prev.some((item) => item.id === server.id)
        ? prev.map((item) => item.id === server.id ? server : item)
        : [...prev, server]);
    };
    const onChannelMessage = ({ channelId, message }: { channelId: number; message: ChannelMessage }) => {
      setChannelMessages((prev) => appendUniqueChannelMessage(prev, channelId, message));
      if (message.author.id !== user.id) {
        const key = `channel:${message.id}`;
        setAnimatedMessageIds((current) => [...current.filter((item) => item !== key), key]);
        window.setTimeout(() => setAnimatedMessageIds((current) => current.filter((item) => item !== key)), 850);
      }
    };
    const onChannelMessageDelete = ({ channelId, messageId }: { channelId: number; messageId: number }) =>
      setChannelMessages((prev) => ({ ...prev, [channelId]: (prev[channelId] || []).filter((message) => message.id !== messageId) }));
    const onChannelDeleted = ({ serverId, channelId }: { serverId: number; channelId: number }) => {
      setServers((prev) => prev.map((server) => server.id === serverId ? { ...server, channels: server.channels.filter((channel) => channel.id !== channelId) } : server));
      if (activeChannelId === channelId) setActiveChannelId(null);
    };
    const onSocketError = (payload: { message?: string }) => console.warn('Socket error', payload);

    socket.on('conversation:upsert', onConversationUpsert);
    socket.on('message:new', onMessageNew);
    socket.on('message:ack', onMessageAck);
    socket.on('message:delete', onMessageDelete);
    socket.on('typing', onTyping);
    socket.on('call:invite', onCallInvite);
    socket.on('call:signal', onCallSignal);
    socket.on('call:accept', onCallAccept);
    socket.on('call:reject', onCallReject);
    socket.on('call:end', onCallEnd);
    socket.on('server:upsert', onServerUpsert);
    socket.on('channel:message:new', onChannelMessage);
    socket.on('channel:message:delete', onChannelMessageDelete);
    socket.on('channel:deleted', onChannelDeleted);
    socket.on('error', onSocketError);
    return () => {
      socket.off('conversation:upsert', onConversationUpsert);
      socket.off('message:new', onMessageNew);
      socket.off('message:ack', onMessageAck);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing', onTyping);
      socket.off('call:invite', onCallInvite);
      socket.off('call:signal', onCallSignal);
      socket.off('call:accept', onCallAccept);
      socket.off('call:reject', onCallReject);
      socket.off('call:end', onCallEnd);
      socket.off('server:upsert', onServerUpsert);
      socket.off('channel:message:new', onChannelMessage);
      socket.off('channel:message:delete', onChannelMessageDelete);
      socket.off('channel:deleted', onChannelDeleted);
      socket.off('error', onSocketError);
      socketRef.current = null;
    };
  }, [user, activeConversationId, incomingCall, onIncomingCallHandled]);

  useEffect(() => {
    if (!incomingCall || ringtoneMuted) return;
    return startNexoRingtone();
  }, [incomingCall, ringtoneMuted]);

  useEffect(() => {
    if (!activeConversationId || !socketRef.current) return;
    socketRef.current.emit('conversation:join', activeConversationId);
    loadMessages(activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeServerId || !socketRef.current) return;
    socketRef.current.emit('server:join', activeServerId);
  }, [activeServerId]);

  useEffect(() => {
    if (!socketRef.current || !activeChannelId || !activeServerId) return;
    const socket = socketRef.current;
    socket.emit('channel:join', { serverId: activeServerId, channelId: activeChannelId });
    loadChannelMessages(activeServerId, activeChannelId);
    const previousChannel = previousChannelRef.current;
    previousChannelRef.current = activeChannelId;
    return () => {
      if (previousChannel) {
        socket.emit('channel:leave', previousChannel);
      }
    };
  }, [activeServerId, activeChannelId]);

  useEffect(() => {
    if (!showMembersPanel || !activeServerId) return;
    let cancelled = false;
    setMembersLoading(true);
    setMembersError('');
    apiFetch(`/api/servers/${activeServerId}/members`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Не удалось загрузить участников.');
        if (!cancelled) setServerMembers(payload.members || []);
      })
      .catch((error) => { if (!cancelled) setMembersError((error as Error).message); })
      .finally(() => { if (!cancelled) setMembersLoading(false); });
    return () => { cancelled = true; };
  }, [showMembersPanel, activeServerId]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const activeMessages = activeConversationId ? messageStore[activeConversationId] || [] : [];

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = Math.min(element.scrollHeight, 192) + 'px';
  }, [composerText]);

  useEffect(() => {
    const element = channelComposerRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = Math.min(element.scrollHeight, 192) + 'px';
  }, [channelComposer]);

  function insertCodeBlock(channel = false) {
    const ref = channel ? channelComposerRef : composerRef;
    const setter = channel ? setChannelComposer : setComposerText;
    const current = channel ? channelComposer : composerText;
    const element = ref.current;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const selected = current.slice(start, end);
    const wrapper = ['```', selected, '```'].join('\n');
    const next = current.slice(0, start) + wrapper + current.slice(end);
    setter(next);
    window.requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      const caret = start + wrapper.length;
      element.setSelectionRange(caret, caret);
    });
  }
  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId]
  );
  const activeChannel = useMemo(
    () => activeServer?.channels.find((channel) => channel.id === activeChannelId) || null,
    [activeServer, activeChannelId]
  );
  const activeChannelMessages = activeChannelId ? channelMessages[activeChannelId] || [] : [];

  useEffect(() => {
    if (!openMessageId) return;
    const exists = activeMessages.some((message) => message.id === openMessageId)
      || activeChannelMessages.some((message) => message.id === openMessageId);
    if (!exists) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`nexo-message-${mode === 'friends' ? 'dm-' + activeConversationId : 'channel-' + activeServerId + '-' + activeChannelId}-${openMessageId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openMessageId, activeMessages.length, activeChannelMessages.length, mode, activeConversationId, activeServerId, activeChannelId]);


  useEffect(() => {
    if (!activeServer) return;
    const channels = activeServer.channels || [];
    const currentExists = channels.some((channel) => channel.id === activeChannelId);
    if (currentExists) return;
    const firstText = channels.find((channel) => channel.type === 'text');
    setActiveChannelId(firstText?.id ?? null);
  }, [activeServer, activeChannelId, openChannelId]);

  async function fetchConversations() {
    try {
      const response = await apiFetch('/api/conversations');
      if (!response.ok) throw new Error('Failed to load conversations');
      const data = await response.json();
      setConversations(data.conversations || []);
      if (openConversationId && data.conversations?.some((item: Conversation) => item.id === openConversationId)) {
        setActiveConversationId(openConversationId);
      } else if (!activeConversationId && data.conversations?.length) {
        setActiveConversationId(data.conversations[0].id);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchServers() {
    try {
      const response = await apiFetch('/api/servers');
      if (!response.ok) throw new Error('Failed to load servers');
      const data = await response.json();
      const next = (data.servers || []) as Server[];
      setServers(next);
      if (openServerId && next.some((server) => server.id === openServerId)) {
        setActiveServerId(openServerId);
      } else if (!activeServerId && next.length > 0) {
        setActiveServerId(next[0].id);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadMessages(conversationId: number) {
    setLoadingMessages(true);
    try {
      const response = await apiFetch(`/api/conversations/${conversationId}/messages`);
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      setMessageStore((prev) => ({ ...prev, [conversationId]: data.messages || [] }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadChannelMessages(serverId: number, channelId: number) {
    setLoadingChannelMessages(true);
    try {
      const response = await apiFetch(`/api/servers/${serverId}/channels/${channelId}/messages`);
      if (!response.ok) throw new Error('Failed to load channel messages');
      const data = await response.json();
      setChannelMessages((prev) => ({ ...prev, [channelId]: data.messages || [] }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingChannelMessages(false);
    }
  }

  async function deleteMessage(message: Message | ChannelMessage, kind: 'dm' | 'channel') {
    if (message.author.id !== user.id) return;
    const confirmText = 'Удалить это сообщение?';
    if (!window.confirm(confirmText)) return;
    try {
      const path = kind === 'dm' && 'conversation_id' in message
        ? `/api/conversations/${message.conversation_id}/messages/${message.id}`
        : `/api/servers/${(message as ChannelMessage).server_id}/channels/${(message as ChannelMessage).channel_id}/messages/${message.id}`;
      const response = await apiFetch(path, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Не удалось удалить сообщение.');
      setMessageContext(null);
      if (kind === 'dm' && 'conversation_id' in message) {
        setMessageStore((prev) => ({ ...prev, [message.conversation_id]: (prev[message.conversation_id] || []).filter((item) => item.id !== message.id) }));
      } else {
        const channelId = (message as ChannelMessage).channel_id;
        setChannelMessages((prev) => ({ ...prev, [channelId]: (prev[channelId] || []).filter((item) => item.id !== message.id) }));
      }
    } catch (error) { window.alert((error as Error).message); }
  }

  function openMessageMenu(event: ReactMouseEvent, message: Message | ChannelMessage, kind: 'dm' | 'channel') {
    event.preventDefault();
    setMessageContext({ x: event.clientX, y: event.clientY, message, kind });
  }

  function sendTyping(isTyping: boolean) {
    if (!activeConversationId || !socketRef.current) return;
    if (isTyping) {
      const now = Date.now();
      if (now - lastTypingSentRef.current >= 1000) {
        socketRef.current.emit('typing', { conversationId: activeConversationId, isTyping: true });
        lastTypingSentRef.current = now;
      }
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => {
        socketRef.current?.emit('typing', { conversationId: activeConversationId, isTyping: false });
        typingTimerRef.current = null;
      }, 2200);
    } else {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
      socketRef.current.emit('typing', { conversationId: activeConversationId, isTyping: false });
    }
  }

  async function handleSendMessage() {
    sendTyping(false);
    if (!activeConversationId) return;
    if (!composerText.trim() && !uploadFile) return;

    const formData = new FormData();
    formData.append('content', composerText);
    if (uploadFile) {
      formData.append('attachment', uploadFile);
    }

    try {
      const response = await apiFetch(`/api/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to send message');
      }
      const data = await response.json();
      setMessageStore((prev) => appendUniqueMessage(prev, activeConversationId, data.message));
      setComposerText('');
      setUploadFile(null);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleSendChannelMessage() {
    if (!activeServerId || !activeChannelId) return;
    if (!channelComposer.trim() && !channelUpload) return;

    const formData = new FormData();
    formData.append('content', channelComposer);
    if (channelUpload) {
      formData.append('attachment', channelUpload);
    }

    try {
      const response = await apiFetch(
        `/api/servers/${activeServerId}/channels/${activeChannelId}/messages`,
        {
          method: 'POST',
          body: formData
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to send message');
      }
      const data = await response.json();
      setChannelMessages((prev) => appendUniqueChannelMessage(prev, activeChannelId, data.message));
      setChannelComposer('');
      setChannelUpload(null);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleCreateServer(payload: { name: string; description: string }) {
    setServerModalStatus({ type: 'loading', message: 'Создаём сервер…' });
    try {
      const response = await apiFetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Не удалось создать сервер');
      }
      const data = await response.json();
      setServerModalStatus({ type: 'success', message: 'Сервер готов' });
      setShowCreateServer(false);
      setServers((prev) => {
        const next = [...prev, data.server as Server];
        return next.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
      setActiveServerId(data.server.id);
    } catch (error) {
      setServerModalStatus({ type: 'error', message: (error as Error).message });
    }
  }

  async function startCall(conversationId: number, options?: { initiator?: boolean; initialSignal?: SignalData }, mediaType: 'audio' | 'video' = 'audio'): Promise<boolean> {
    if (!socketRef.current) return false;
    setCallError('');
    try {
      const audioConstraint: MediaTrackConstraints | boolean = audioInputId ? { deviceId: { exact: audioInputId } } : true;
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: mediaType === 'video' });
      mediaStream.getAudioTracks().forEach((track) => { track.enabled = !micMuted; });
      const peer = new SimplePeer({
        initiator: options?.initiator ?? true,
        trickle: false,
        stream: mediaStream
      });

      if (options?.initiator !== false) {
        awaitingCallAcceptRef.current = conversationId;
        queuedCallSignalsRef.current = [];
      }
      const state: CallState = {
        conversationId,
        peer,
        localStream: mediaStream,
        remoteStream: null,
        isScreenSharing: false,
        initiator: options?.initiator ?? true,
        mediaType,
        startedAt: Date.now()
      };
      callStateRef.current = state;
      setCallState(state);
      if (options?.initiator !== false) socketRef.current.emit('call:invite', { conversationId, mediaType });

      peer.on('signal', (payload) => {
        if (awaitingCallAcceptRef.current === conversationId) {
          queuedCallSignalsRef.current.push(payload);
          return;
        }
        socketRef.current?.emit('call:signal', { conversationId, payload });
      });

      peer.on('stream', (remoteStream) => {
        callStateRef.current = callStateRef.current
          ? { ...callStateRef.current, remoteStream }
          : null;
        setCallState((prev) => (prev ? { ...prev, remoteStream } : prev));
      });

      peer.on('close', () => endCall());
      peer.on('error', (error) => {
        console.error(error);
        endCall();
      });

      if (options?.initialSignal) peer.signal(options.initialSignal);
      return true;
    } catch (error) {
      const mediaError = error as DOMException;
      const message = mediaError?.name === 'NotAllowedError'
        ? 'Разрешите Nexo доступ к микрофону и камере в настройках Windows.'
        : mediaError?.name === 'NotFoundError'
          ? 'Не найдено подходящее аудиоустройство. Проверьте подключение микрофона.'
          : mediaError?.name === 'NotReadableError'
            ? 'Устройство уже используется другим приложением.'
            : (mediaError?.message || 'Не удалось начать звонок.');
      setCallError(message);
      console.error('Failed to start call', error);
      return false;
    }
  }

  async function handleIncomingSignal(conversationId: number, payload: SignalData) {
    const current = callStateRef.current;
    if (!current || current.conversationId !== conversationId) {
      pendingIncomingSignalRef.current = payload;
      return;
    }
    current.peer?.signal(payload);
  }

  async function acceptIncomingCall() {
    if (!incomingCall) return;
    const call = incomingCall;
    pendingIncomingSignalRef.current = null;
    setIncomingCall(null);
    const started = await startCall(call.conversationId, { initiator: false }, call.mediaType);
    if (!started) {
      socketRef.current?.emit('call:reject', { conversationId: call.conversationId });
      onIncomingCallHandled?.();
      return;
    }
    socketRef.current?.emit('call:accept', { conversationId: call.conversationId });
    onIncomingCallHandled?.();
  }

  function rejectIncomingCall() {
    if (!incomingCall) return;
    socketRef.current?.emit('call:reject', { conversationId: incomingCall.conversationId });
    pendingIncomingSignalRef.current = null;
    setIncomingCall(null);
    onIncomingCallHandled?.();
  }

  useEffect(() => {
    callState?.localStream?.getAudioTracks().forEach((track) => { track.enabled = !micMuted; });
  }, [callState, micMuted]);

  useEffect(() => {
    const onGlobalEndCall = () => { if (callStateRef.current) endCall(true); };
    window.addEventListener('nexo-end-call', onGlobalEndCall);
    return () => window.removeEventListener('nexo-end-call', onGlobalEndCall);
  }, []);

  function endCall(notifyRemote = true) {
    const current = callStateRef.current;
    if (!current) return;
    if (awaitingCallAcceptRef.current === current.conversationId) awaitingCallAcceptRef.current = null;
    queuedCallSignalsRef.current = [];
    callStateRef.current = null;
    setCallState(null);
    if (notifyRemote) socketRef.current?.emit('call:end', { conversationId: current.conversationId });
    current.peer?.destroy();
    current.localStream?.getTracks().forEach((track) => track.stop());
    current.remoteStream?.getTracks().forEach((track) => track.stop());
  }

  async function shareScreen() {
    if (!callStateRef.current?.peer) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const localStream = callStateRef.current.localStream;
      const currentVideo = localStream?.getVideoTracks()[0];

      if (localStream && currentVideo) {
        localStream.removeTrack(currentVideo);
        localStream.addTrack(screenTrack);
        const peerWithReplace = callStateRef.current.peer as SimplePeer.Instance & {
          replaceTrack?: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream) => void;
        };
        peerWithReplace?.replaceTrack?.(currentVideo, screenTrack, localStream);
        setCallState((prev) => (prev ? { ...prev, isScreenSharing: true } : prev));
        screenTrack.onended = () => {
          localStream.removeTrack(screenTrack);
          localStream.addTrack(currentVideo);
          peerWithReplace?.replaceTrack?.(screenTrack, currentVideo, localStream);
          setCallState((prev) => (prev ? { ...prev, isScreenSharing: false } : prev));
        };
      }
    } catch (error) {
      console.error('Share screen failed', error);
    }
  }

  function renderDirectMessages() {
    return (
      <div className={'workspace-grid ' + (showConversationList ? '' : 'embedded-dm')}>
        <aside className="conversation-list">
          <header>
            <h3><MessageCircle size={16} />Диалоги</h3>
            {onFindFriends && <button type="button" className="ghost subtle" onClick={onFindFriends}>Найти людей</button>}
          </header>
          <div className="conversation-items">
            {conversations.length === 0 && <p className="muted">Нет диалогов — добавьте друзей.</p>}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-item ${conversation.id === activeConversationId ? 'active' : ''}`}
                onClick={() => setActiveConversationId(conversation.id)}
              >
                <Avatar user={conversation.counterpart} size={36} showStatus />
                <div>
                  <p>{conversation.title}</p>
                  <small>
                    {new Date(conversation.updated_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </aside>
        <section className="chat-window">
          {!activeConversation && <p className="muted">Выберите диалог, чтобы начать общение.</p>}
          {activeConversation && (
            <>
              <header className="chat-header">
                <div className="title">
                  <MessageCircle size={15} />
                  {activeConversation.title}
                </div>
                <div className="chat-actions">
                  <button type="button" className="ghost" onClick={() => startCall(activeConversation.id, { initiator: true }, 'audio')}>
                    <Phone size={16} />Голос
                  </button>
                  <button type="button" className="ghost" onClick={() => startCall(activeConversation.id, { initiator: true }, 'video')}>
                    <Monitor size={16} />Видео
                  </button>
                </div>
              </header>
              <div className="message-stream">
                {loadingMessages && <p className="muted">Загружаем…</p>}
                {!loadingMessages &&
                  activeMessages.map((message, index) => {
                    const previous = activeMessages[index - 1];
                    const grouped = Boolean(previous && previous.author.id === message.author.id &&
                      new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60 * 1000);
                    const authorName = message.author.display_name || message.author.username;
                    const dayChanged = !previous || getMessageDayKey(previous.created_at) !== getMessageDayKey(message.created_at);
                    return (
                      <Fragment key={message.id}>
                        {dayChanged && <div className="message-day-divider"><span>{getMessageDayLabel(message.created_at)}</span></div>}
                        <article id={`nexo-message-${message.id}`} className={`message-row ${grouped ? 'grouped' : ''} ${animatedMessageIds.includes(`dm:${message.id}`) ? 'message-arrived' : ''}`} title={new Date(message.created_at).toLocaleString('ru-RU')}
                          onContextMenu={(event) => openMessageMenu(event, message, 'dm')}>
                          {grouped ? <span className="message-avatar-spacer" /> : <Avatar user={message.author} size={34} />}
                          <div className="message-body">
                            {!grouped && <header><strong>{authorName}</strong><time title={new Date(message.created_at).toLocaleString('ru-RU')}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>}
                            {message.content && <MessageContent content={message.content} />}
                            {message.attachment && <AttachmentPreview attachment={message.attachment} />}
                          </div>
                        </article>
                      </Fragment>
                    );
                  })}
              </div>
              {typingUser && <div className="typing-indicator">{typingUser.display_name || typingUser.username} печатает…</div>}
              {callError && <p className="status error call-error">{callError}</p>}
              <div className="composer">
                <label className="file-pill">
                  <Paperclip size={16} />
                  <input
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) setUploadFile(file);
                    }}
                  />
                </label>
                <button type="button" className="composer-code-button" title="Вставить блок кода" aria-label="Вставить блок кода" onClick={() => insertCodeBlock(false)}><Code size={16} /></button>
                <textarea
                  ref={composerRef}
                  placeholder="Напишите сообщение..."
                  value={composerText}
                  onChange={(event) => { setComposerText(event.target.value); sendTyping(Boolean(event.target.value.trim())); }}
                  onBlur={() => sendTyping(false)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSendMessage(); } }}
                  onPaste={(event) => { const file = Array.from(event.clipboardData.files)[0]; if (file) { event.preventDefault(); setUploadFile(file); } }}
                  rows={1}
                />
                <button className="primary tiny" onClick={handleSendMessage}>
                  <SendHorizontal size={16} />
                </button>
              </div>
              {uploadFile && (
                <div className="upload-preview">
                  <ImageIcon size={16} />
                  <span>{uploadFile.name}</span>
                  <button className="link" onClick={() => setUploadFile(null)}>
                    Удалить
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    );
  }

  function renderServerView() {
    if (servers.length === 0) {
      return (
        <div className="empty-state">
          <h2>Добро пожаловать в Nexo</h2>
          <p>Создайте первое пространство для команды, проекта или сообщества.</p>
          <button className="primary" onClick={() => setShowCreateServer(true)}>
            <Plus size={16} />
            Создать сервер
          </button>
        </div>
      );
    }

    return (
      <div className={'workspace-grid servers ' + (showChannelSidebar ? '' : 'embedded-channel')}>
        <section className="channel-column">
          {activeServer ? (
            <ServerSidebar
              server={activeServer}
              activeChannelId={activeChannelId}
              onSelectChannel={setActiveChannelId}
              onOpenSettings={onOpenSettings}
            />
          ) : (
            <div className="muted">Выберите сервер из списка слева.</div>
          )}
        </section>
        <section className="chat-window">
          {!activeChannel && <p className="muted">Выберите канал, чтобы начать общение.</p>}
          {activeChannel && (
            <>
              <header className="chat-header">
                <div className="title">
                  <Hash size={14} />
                  {activeChannel.name}
                  <small>{activeChannel.topic}</small>
                </div>
                <div className="chat-actions">
                  <button type="button" className={showMembersPanel ? 'ghost active' : 'ghost'} onClick={() => setShowMembersPanel((value) => !value)} title="Показать участников" aria-label="Показать участников">
                    <Users size={16} />Участники
                  </button>
                  {onEditChannel && <button type="button" className="ghost" onClick={onEditChannel} title="Настройки канала" aria-label="Настройки канала"><Settings size={16} />Канал</button>}
                </div>
              </header>
              <div className="message-stream">
                {loadingChannelMessages && <p className="muted">Загружаем…</p>}
                {!loadingChannelMessages &&
                  activeChannelMessages.map((message, index) => {
                    const previous = activeChannelMessages[index - 1];
                    const grouped = Boolean(previous && previous.author.id === message.author.id &&
                      new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60 * 1000);
                    const authorName = message.author.display_name || message.author.username;
                    const dayChanged = !previous || getMessageDayKey(previous.created_at) !== getMessageDayKey(message.created_at);
                    return (
                      <Fragment key={message.id}>
                        {dayChanged && <div className="message-day-divider"><span>{getMessageDayLabel(message.created_at)}</span></div>}
                        <article className={`message-row ${grouped ? 'grouped' : ''} ${animatedMessageIds.includes(`channel:${message.id}`) ? 'message-arrived' : ''}`} title={new Date(message.created_at).toLocaleString('ru-RU')}
                          onContextMenu={(event) => openMessageMenu(event, message, 'channel')}>
                          {grouped ? <span className="message-avatar-spacer" /> : <Avatar user={message.author} size={34} />}
                          <div className="message-body">
                            {!grouped && <header><strong>{authorName}</strong><time title={new Date(message.created_at).toLocaleString('ru-RU')}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>}
                            {message.content && <MessageContent content={message.content} />}
                            {message.attachment && <AttachmentPreview attachment={message.attachment} />}
                          </div>
                        </article>
                      </Fragment>
                    );
                  })}
              </div>
              <div className="composer">
                <label className="file-pill">
                  <Paperclip size={16} />
                  <input
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) setChannelUpload(file);
                    }}
                  />
                </label>
                <button type="button" className="composer-code-button" title="Вставить блок кода" aria-label="Вставить блок кода" onClick={() => insertCodeBlock(true)}><Code size={16} /></button>
                <textarea
                  ref={channelComposerRef}
                  placeholder={`Сообщение #${activeChannel.name}`}
                  value={channelComposer}
                  onChange={(event) => setChannelComposer(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSendChannelMessage(); } }}
                  onPaste={(event) => { const file = Array.from(event.clipboardData.files)[0]; if (file) { event.preventDefault(); setChannelUpload(file); } }}
                  rows={1}
                />
                <button className="primary tiny" onClick={handleSendChannelMessage}>
                  <SendHorizontal size={16} />
                </button>
              </div>
              {channelUpload && (
                <div className="upload-preview">
                  <ImageIcon size={16} />
                  <span>{channelUpload.name}</span>
                  <button className="link" onClick={() => setChannelUpload(null)}>
                    Удалить
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        {showMembersPanel && (
          <aside className="channel-members-panel">
            <header><strong>Участники</strong><button type="button" className="ghost-icon" aria-label="Закрыть участников" title="Закрыть" onClick={() => setShowMembersPanel(false)}><X size={15} /></button></header>
            {membersLoading && <p className="muted">Загружаем участников…</p>}
            {membersError && <p className="status error">{membersError}</p>}
            {!membersLoading && !membersError && <div className="channel-member-list">
              {serverMembers.map((member) => (
                <article key={member.id} className="channel-member-row">
                  <Avatar user={member.user} size={30} />
                  <div><strong>{member.nickname || member.user.display_name || member.user.username}</strong>
                    <small>@{member.user.username}</small>
                    <div className="channel-member-roles">
                      {member.role === 'owner' && <span className="owner-role">Владелец</span>}
                      {member.roles.map((role) => <span key={role.id} style={{ color: role.color }}>{role.name}</span>)}
                    </div>
                  </div>
                </article>
              ))}
              {serverMembers.length === 0 && <p className="muted">Список участников пуст.</p>}
            </div>}
          </aside>
        )}
      </div>
    );
  }

  return (
    <div className={'workspace-shell ' + (embedded ? 'workspace-shell-embedded' : '')}>
      {mode === 'servers' && showServersRail && !embedded && <ServersRail
        servers={servers}
        activeServerId={activeServerId}
        onSelectServer={(serverId) => { setMode('servers'); setActiveServerId(serverId); }}
        onCreateServer={() => setShowCreateServer(true)}
      />}
      <div className="workspace-main">
        {!hideNavigation && !embedded && <div className="workspace-nav">
          <button
            className={mode === 'servers' ? 'active' : ''}
            onClick={() => setMode('servers')}
          >
            Серверы
          </button>
          <button
            className={mode === 'friends' ? 'active' : ''}
            onClick={() => setMode('friends')}
          >
            Друзья
          </button>
        </div>}
        {mode === 'friends' ? renderDirectMessages() : renderServerView()}
      </div>

      {messageContext && (
        <div className="message-context-backdrop" onPointerDown={() => setMessageContext(null)}>
          <div className="nexo-context-menu" style={{
            left: Math.min(messageContext.x, window.innerWidth - 220),
            top: Math.min(messageContext.y, window.innerHeight - 110)
          }} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => {
              const value = messageContext.message.content || messageContext.message.attachment?.name || '';
              void copyText(value);
              setMessageContext(null);
            }}><Copy size={14} /><span>Копировать текст</span></button>
            <button type="button" onClick={() => {
              const message = messageContext.message;
              const link = messageContext.kind === 'dm' && 'conversation_id' in message
                ? `nexo://dm/${message.conversation_id}/message/${message.id}`
                : `nexo://channel/${(message as ChannelMessage).server_id}/${(message as ChannelMessage).channel_id}/message/${message.id}`;
              void copyText(link);
              setMessageContext(null);
            }}><LinkIcon /><span>Копировать ссылку</span></button>
            {messageContext.message.author.id === user.id && (
              <button type="button" className="danger" onClick={() => void deleteMessage(messageContext.message, messageContext.kind)}>
                <X size={14} /><span>Удалить сообщение</span>
              </button>
            )}
          </div>
        </div>
      )}
      {incomingCall && (
        <motion.div className="incoming-call-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section className="incoming-call-card" role="dialog" aria-modal="true" aria-label="Входящий звонок"
            initial={{ opacity: 0, y: 18, scale: .92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: .96 }} transition={{ type: 'spring', stiffness: 360, damping: 28 }}>
            <div className="incoming-call-avatar">
              <span className="incoming-call-pulse" />
              <Avatar user={incomingCall.user} size={64} showStatus />
            </div>
            <div className="incoming-call-copy">
              <strong>{incomingCall.user.display_name || incomingCall.user.username}</strong>
              <p>{incomingCall.groupTitle ? `Групповой звонок · ${incomingCall.groupTitle}` : incomingCall.mediaType === 'video' ? 'Входящий видеозвонок' : 'Входящий голосовой звонок'}</p>
            </div>
            <button type="button" className="ringtone-toggle" onClick={() => setRingtoneMuted((value) => !value)}>
              {ringtoneMuted ? 'Включить звук звонка' : 'Отключить звук звонка'}
            </button>
            <div className="incoming-call-actions">
              <button type="button" className="call-reject" onClick={rejectIncomingCall} aria-label="Отклонить звонок" title="Отклонить"><PhoneOff size={20} /></button>
              <button type="button" className="call-accept" onClick={() => void acceptIncomingCall()} aria-label="Принять звонок" title="Принять"><Phone size={20} /></button>
            </div>
          </motion.section>
        </motion.div>
      )}
      {callState && <CallOverlay state={callState} onHangUp={endCall} onShareScreen={shareScreen} audioOutputId={audioOutputId} deafened={deafened} />}

      {showCreateServer && (
        <CreateServerModal
          status={serverModalStatus}
          onClose={() => {
            setShowCreateServer(false);
            setServerModalStatus({ type: 'idle' });
          }}
          onSubmit={handleCreateServer}
        />
      )}
    </div>
  );
}

function ServersRail({
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
          onClick={() => onSelectServer(server.id)} title={server.name} aria-label={server.name}>
          {server.icon ? <img src={server.icon} alt="" /> : (server.name[0] || '?').toUpperCase()}
        </button>
      ))}
      <button type="button" className="server-circle ghost" onClick={onCreateServer}
        title="Создать пространство" aria-label="Создать пространство"><Plus size={18} /></button>
    </aside>
  );
}

function ServerSidebar({
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
        <button type="button" className="ghost-icon" title="Настройки пространства" onClick={onOpenSettings}>
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
          <div key={channel.id} className="channel voice channel-unavailable" title="Голосовая связь в сообществах ещё не подключена">
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

function getMessageDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getMessageDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dayStamp = (item: Date) => new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime();
  if (dayStamp(date) === dayStamp(today)) return 'Сегодня';
  if (dayStamp(date) === dayStamp(yesterday)) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function copyText(value: string) {
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

function InlineContent({ text }: { text: string }) {
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

function MessageContent({ content }: { content: string }) {
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
        <header><span>{language || 'CODE'}</span><button type="button" title="Копировать код" aria-label="Копировать код"
          onClick={() => void copyText(code.trimEnd())}><Copy size={13} />Копировать</button></header>
        <pre><code>{code.replace(/\n$/, '')}</code></pre>
      </div>);
    }
  }
  return <div className="message-content">{result}</div>;
}

function AttachmentPreview({ attachment }: { attachment: Message['attachment'] | ChannelMessage['attachment'] }) {
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

function CallOverlay({
  state,
  onHangUp,
  onShareScreen,
  audioOutputId,
  deafened
}: {
  state: CallState;
  onHangUp: () => void;
  onShareScreen: () => void;
  audioOutputId: string;
  deafened: boolean;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && state.localStream) {
      localVideoRef.current.srcObject = state.localStream;
    }
  }, [state.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && state.remoteStream) {
      remoteVideoRef.current.srcObject = state.remoteStream;
    }
  }, [state.remoteStream]);

  useEffect(() => {
    const video = remoteVideoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (video?.setSinkId && audioOutputId) void video.setSinkId(audioOutputId).catch((error) => console.warn('Audio output selection failed:', error));
  }, [audioOutputId, state.remoteStream]);

  return (
    <motion.div
      className="call-overlay"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
    >
      <div className="call-video remote">
        {state.remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline muted={deafened} />
        ) : (
          <p>Ожидание подключения...</p>
        )}
      </div>
      <div className="call-video local">
        {state.localStream && <video ref={localVideoRef} autoPlay playsInline muted />}
      </div>
      <div className="call-controls">
        <button className="ghost" onClick={onShareScreen}>
          <Monitor size={18} />
          Трансляция
        </button>
        <button className="primary" onClick={onHangUp}>
          <Phone size={18} />
          Завершить
        </button>
      </div>
    </motion.div>
  );
}

function CreateServerModal({
  status,
  onClose,
  onSubmit
}: {
  status: Status;
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
            <input
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
            <textarea
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

