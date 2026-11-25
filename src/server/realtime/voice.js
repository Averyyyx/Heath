'use strict';

function registerVoiceHandlers(socket, context) {
  const { ensureServerMembership, getServerRoom, ensureChannelAccess, hasPermission, PERMISSIONS, db, listVoiceParticipants, selectServerMember, activeCallParticipants, getConversationRoom, io, getUserRoom, getChannelRoom, broadcastVoiceState, deleteVoiceSessionsForUser } = context;
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
}

module.exports = { registerVoiceHandlers };
