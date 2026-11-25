'use strict';

function registerMessageHandlers(socket, context) {
  const { createMessage } = context;
      socket.on('message:send', ({ conversationId, content }) => {
        try {
          const message = createMessage(conversationId, socket.user.id, content);
          socket.emit('message:ack', { conversationId, message });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });
}

module.exports = { registerMessageHandlers };
