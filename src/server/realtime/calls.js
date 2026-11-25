'use strict';

function registerCallHandlers(socket, context) {
  const { activeCallParticipants, ensureConversationAccess, getConversationParticipants, sanitizeUser, io, getUserRoom, getConversationRoom } = context;
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
}

module.exports = { registerCallHandlers };
