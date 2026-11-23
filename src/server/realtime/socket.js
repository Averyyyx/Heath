'use strict';

function registerSocketHandlers({ io, activeCallParticipants, getUserRoom, sanitizeUser, ensureConversationAccess, getConversationRoom, createMessage, getConversationParticipants, ensureServerMembership, getServerRoom, ensureChannelAccess, hasPermission, PERMISSIONS, db, listVoiceParticipants, selectServerMember, broadcastVoiceState, deleteVoiceSessionsForUser, getChannelRoom }) {
  io.on('connection', (socket) => {
    socket.join(getUserRoom(socket.user.id));
    socket.emit('socket:ready', { user: socket.user });
  
    let lastTypingAt = 0;
    socket.on('typing', ({ conversationId, isTyping }) => {
      try {
        ensureConversationAccess(Number(conversationId), socket.user.id);
        const now = Date.now();
        if (isTyping && now - lastTypingAt < 900) return;
        lastTypingAt = now;
        socket.to(getConversationRoom(Number(conversationId))).emit('typing', {
          conversationId: Number(conversationId),
          user: socket.user,
          isTyping: Boolean(isTyping)
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
  
    socket.on('conversation:join', (conversationId) => {
      try {
        ensureConversationAccess(conversationId, socket.user.id);
        socket.join(getConversationRoom(conversationId));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    socket.on('conversation:leave', (conversationId) => {
      socket.leave(getConversationRoom(conversationId));
    });
  
    socket.on('message:send', ({ conversationId, content }) => {
      try {
        const message = createMessage(conversationId, socket.user.id, content);
        socket.emit('message:ack', { conversationId, message });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    const handleCallRing = ({ conversationId, mediaType = 'audio' }) => {
      try {
        ensureConversationAccess(Number(conversationId), socket.user.id);
        const participants = getConversationParticipants(Number(conversationId));
        if (participants.length > 6) {
          socket.emit('call:error', { conversationId: Number(conversationId), message: 'В mesh-звонке одновременно могут участвовать не более шести человек.' });
          return;
        }
        activeCallParticipants.set(Number(conversationId), {
          callerId: socket.user.id,
          accepted: new Set([socket.user.id]),
          invited: new Set(participants.map((participant) => participant.id)),
          declined: new Set()
        });
        const invitation = {
          conversationId: Number(conversationId), from: socket.user.id, user: sanitizeUser(socket.user),
          mediaType: mediaType === 'video' ? 'video' : 'audio',
          participants
        };
        participants.filter((participant) => participant.id !== socket.user.id).forEach((participant) => {
          io.to(getUserRoom(participant.id)).emit('call:ring', invitation);
          io.to(getUserRoom(participant.id)).emit('call:invite', invitation);
        });
      } catch (error) { socket.emit('error', { message: error.message }); }
    };
    socket.on('call:ring', handleCallRing);
    socket.on('call:invite', handleCallRing);
  
    socket.on('call:accept', ({ conversationId, mediaType = 'audio' }) => {
      try {
        const safeConversationId = Number(conversationId);
        ensureConversationAccess(safeConversationId, socket.user.id);
        const call = activeCallParticipants.get(safeConversationId);
        if (!call) throw new Error('Этот звонок уже завершён.');
        if (!call.invited.has(socket.user.id) || call.declined.has(socket.user.id)) {
          throw new Error('Приглашение больше недоступно.');
        }
        call.accepted.add(socket.user.id);
        const accepted = {
          conversationId: safeConversationId,
          from: socket.user.id,
          mediaType: mediaType === 'video' ? 'video' : 'audio',
          acceptedParticipants: [...call.accepted]
        };
        call.accepted.forEach((participantId) => {
          io.to(getUserRoom(participantId)).emit('call:accept', accepted);
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    const handleCallDecline = ({ conversationId }) => {
      try {
        const safeConversationId = Number(conversationId);
        ensureConversationAccess(safeConversationId, socket.user.id);
        const participants = getConversationParticipants(safeConversationId);
        const call = activeCallParticipants.get(safeConversationId);
        if (call) call.declined.add(socket.user.id);
        participants.filter((participant) => participant.id !== socket.user.id).forEach((participant) => {
          const payload = { conversationId: safeConversationId, from: socket.user.id };
          io.to(getUserRoom(participant.id)).emit('call:decline', payload);
          io.to(getUserRoom(participant.id)).emit('call:reject', payload);
        });
        if (call && call.accepted.size === 1 && call.declined.size >= call.invited.size - 1) {
          activeCallParticipants.delete(safeConversationId);
          io.to(getUserRoom(call.callerId)).emit('call:end', {
            conversationId: safeConversationId, from: socket.user.id
          });
        }
      } catch (error) { socket.emit('error', { message: error.message }); }
    };
    socket.on('call:decline', handleCallDecline);
    socket.on('call:reject', handleCallDecline);
  
    socket.on('call:timeout', ({ conversationId }) => {
      try {
        const safeConversationId = Number(conversationId);
        ensureConversationAccess(safeConversationId, socket.user.id);
        const call = activeCallParticipants.get(safeConversationId);
        if (!call) return;
  
        // The caller timing out ends the call. A single invitee timing out must
        // not destroy an already established group mesh or other pending invites.
        if (call.callerId === socket.user.id) {
          activeCallParticipants.delete(safeConversationId);
          call.invited.forEach((participantId) => {
            if (participantId !== socket.user.id) {
              io.to(getUserRoom(participantId)).emit('call:end', {
                conversationId: safeConversationId, from: socket.user.id
              });
            }
          });
          return;
        }
  
        if (!call.invited.has(socket.user.id) || call.accepted.has(socket.user.id)) return;
        call.declined.add(socket.user.id);
  
        if (call.accepted.size === 1 && call.declined.size >= call.invited.size - 1) {
          activeCallParticipants.delete(safeConversationId);
          call.invited.forEach((participantId) => {
            if (participantId !== socket.user.id) {
              io.to(getUserRoom(participantId)).emit('call:end', {
                conversationId: safeConversationId, from: socket.user.id
              });
            }
          });
          return;
        }
  
        call.accepted.forEach((participantId) => {
          io.to(getUserRoom(participantId)).emit('call:timeout', {
            conversationId: safeConversationId, from: socket.user.id
          });
        });
      } catch (error) { socket.emit('error', { message: error.message }); }
    });
  
    socket.on('call:signal', ({ conversationId, to, payload }) => {
      try {
        const safeConversationId = Number(conversationId);
        ensureConversationAccess(safeConversationId, socket.user.id);
        const targetId = Number(to);
        const call = activeCallParticipants.get(safeConversationId);
        if (Number.isInteger(targetId) && targetId > 0) {
          if (!call || !call.accepted.has(socket.user.id) || !call.accepted.has(targetId)) {
            throw new Error('Оба участника должны принять звонок до обмена WebRTC-сигналами.');
          }
          if (!getConversationParticipants(safeConversationId).some((participant) => participant.id === targetId)) {
            throw new Error('Получатель не состоит в этом диалоге.');
          }
          if (!payload || Buffer.byteLength(JSON.stringify(payload), 'utf8') > 256 * 1024) {
            throw new Error('Некорректный или слишком большой сигнал WebRTC.');
          }
          io.to(getUserRoom(targetId)).emit('call:signal', {
            conversationId: safeConversationId,
            from: socket.user.id,
            payload
          });
        } else {
          socket.to(getConversationRoom(safeConversationId)).emit('call:signal', {
            conversationId: safeConversationId,
            from: socket.user.id,
            payload
          });
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    socket.on('call:end', ({ conversationId }) => {
      try {
        const safeConversationId = Number(conversationId);
        ensureConversationAccess(safeConversationId, socket.user.id);
        const call = activeCallParticipants.get(safeConversationId);
        const participants = getConversationParticipants(safeConversationId);
        if (call && participants.length > 2 && call.callerId !== socket.user.id) {
          call.accepted.delete(socket.user.id);
          call.accepted.forEach((participantId) => io.to(getUserRoom(participantId)).emit('call:participant-left', {
            conversationId: safeConversationId, userId: socket.user.id
          }));
          return;
        }
        activeCallParticipants.delete(safeConversationId);
        participants.filter((participant) => participant.id !== socket.user.id)
          .forEach((participant) => io.to(getUserRoom(participant.id)).emit('call:end', {
            conversationId: safeConversationId, from: socket.user.id
          }));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    socket.on('server:join', (serverId) => {
      try {
        ensureServerMembership(Number(serverId), socket.user.id);
        socket.join(getServerRoom(serverId));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    socket.on('server:leave', (serverId) => {
      socket.leave(getServerRoom(serverId));
    });
  
    socket.on('channel:join', ({ serverId, channelId }) => {
      try {
        const { channel, permissions } = ensureChannelAccess(Number(serverId), Number(channelId), socket.user.id);
        if (channel.type === 'voice' && !hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.CONNECT_VOICE)) {
          throw new Error('Недостаточно прав для подключения к голосовому каналу.');
        }
        socket.join(getChannelRoom(channelId));
        if (channel.type === 'voice') {
          const session = db.prepare('SELECT id FROM voice_sessions WHERE channel_id = ? AND user_id = ?').get(Number(channelId), socket.user.id);
          if (session) socket.emit('voice:peers', {
            channelId: Number(channelId),
            peers: listVoiceParticipants(Number(channelId)).filter((participant) => participant.user.id !== socket.user.id)
          });
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    socket.on('voice:invite', ({ serverId, channelId, to }) => {
      const safeServerId = Number(serverId);
      const safeChannelId = Number(channelId);
      const recipientId = Number(to);
      if (![safeServerId, safeChannelId, recipientId].every(Number.isInteger) || recipientId === socket.user.id) return;
      try {
        const { channel, server, permissions } = ensureChannelAccess(safeServerId, safeChannelId, socket.user.id);
        if (channel.type !== 'voice' || !hasPermission(permissions, PERMISSIONS.CONNECT_VOICE)) {
          return socket.emit('error', { message: 'Недостаточно прав для приглашения в голосовой канал.' });
        }
        const activeSession = db.prepare('SELECT id FROM voice_sessions WHERE channel_id = ? AND user_id = ?').get(safeChannelId, socket.user.id);
        if (!activeSession) return socket.emit('error', { message: 'Сначала подключитесь к голосовому каналу.' });
        const recipient = selectServerMember.get(safeServerId, recipientId);
        if (!recipient) return socket.emit('error', { message: 'Пригласить можно только участника этого пространства.' });
        try {
          const recipientAccess = ensureChannelAccess(safeServerId, safeChannelId, recipientId);
          if (!hasPermission(recipientAccess.permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.CONNECT_VOICE)) {
            return socket.emit('error', { message: 'У участника нет доступа к этому голосовому каналу.' });
          }
        } catch { return socket.emit('error', { message: 'У участника нет доступа к этому каналу.' }); }
        io.to(getUserRoom(recipientId)).emit('voice:invite', {
          serverId: safeServerId, channelId: safeChannelId, serverName: server.name,
          channelName: channel.name, from: socket.user.id, user: sanitizeUser(socket.user)
        });
      } catch (error) { socket.emit('error', { message: error.message }); }
    });
  
    socket.on('voice:invite-response', ({ to, channelId, accepted }) => {
      const recipientId = Number(to);
      const safeChannelId = Number(channelId);
      if (!Number.isInteger(recipientId) || !Number.isInteger(safeChannelId)) return;
      io.to(getUserRoom(recipientId)).emit('voice:invite-response', {
        channelId: safeChannelId, from: socket.user.id, accepted: Boolean(accepted)
      });
    });
  
    socket.on('voice:signal', ({ channelId, to, payload }) => {
      const safeChannelId = Number(channelId);
      const recipientId = Number(to);
      if (!Number.isInteger(safeChannelId) || !Number.isInteger(recipientId) || !payload) return;
      try {
        const serverId = Number(db.prepare('SELECT server_id FROM channels WHERE id = ?').get(safeChannelId)?.server_id);
        const access = ensureChannelAccess(serverId, safeChannelId, socket.user.id);
        if (!hasPermission(access.permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.CONNECT_VOICE)) return socket.emit('error', { message: 'Недостаточно прав для голосового канала.' });
        if (typeof payload.sdp === 'string' && payload.sdp.includes('m=video') && !hasPermission(access.permissions, PERMISSIONS.STREAM)) {
          return socket.emit('error', { message: 'У вас нет права передавать видео или экран в этом канале.' });
        }
        const sender = db.prepare('SELECT id FROM voice_sessions WHERE channel_id = ? AND user_id = ?').get(safeChannelId, socket.user.id);
        const recipient = db.prepare('SELECT id FROM voice_sessions WHERE channel_id = ? AND user_id = ?').get(safeChannelId, recipientId);
        if (!sender || !recipient) return socket.emit('error', { message: 'Участник больше не находится в голосовом канале.' });
        const encodedSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
        if (encodedSize > 256 * 1024) return socket.emit('error', { message: 'Слишком большой сигнал WebRTC.' });
        io.to(getUserRoom(recipientId)).emit('voice:signal', { channelId: safeChannelId, from: socket.user.id, payload });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  
    socket.on('disconnect', () => {
      for (const [conversationId, call] of activeCallParticipants.entries()) {
        if (!call.accepted.has(socket.user.id)) continue;
        const participants = getConversationParticipants(conversationId);
        if (participants.length > 2 && call.callerId !== socket.user.id) {
          call.accepted.delete(socket.user.id);
          call.accepted.forEach((participantId) => io.to(getUserRoom(participantId)).emit('call:participant-left', {
            conversationId, userId: socket.user.id
          }));
          continue;
        }
        activeCallParticipants.delete(conversationId);
        participants.filter((participant) => participant.id !== socket.user.id)
          .forEach((participant) => io.to(getUserRoom(participant.id)).emit('call:end', {
            conversationId, from: socket.user.id
          }));
      }
      const sessions = db.prepare('SELECT channel_id FROM voice_sessions WHERE user_id = ?').all(socket.user.id);
      if (!sessions.length) return;
      deleteVoiceSessionsForUser.run(socket.user.id);
      sessions.forEach(({ channel_id }) => {
        io.to(getChannelRoom(channel_id)).emit('voice:left', { channelId: channel_id, userId: socket.user.id });
        broadcastVoiceState(channel_id);
      });
    });
  
    socket.on('channel:leave', (channelId) => {
      socket.leave(getChannelRoom(channelId));
    });
  });
}

module.exports = { registerSocketHandlers };
