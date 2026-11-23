'use strict';

function registerPresenceHandlers(socket, context) {
  const { ensureConversationAccess, getConversationRoom, ensureServerMembership, getServerRoom } = context;
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
}

module.exports = { registerPresenceHandlers };
