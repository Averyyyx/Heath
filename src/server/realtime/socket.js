'use strict';

const { registerPresenceHandlers } = require('./presence');
const { registerMessageHandlers } = require('./messages');
const { registerCallHandlers } = require('./calls');
const { registerVoiceHandlers } = require('./voice');

function registerSocketHandlers(context) {
  const { io, getUserRoom } = context;
  io.on('connection', (socket) => {
    socket.join(getUserRoom(socket.user.id));
    socket.emit('socket:ready', { user: socket.user });

    registerPresenceHandlers(socket, context);
    registerMessageHandlers(socket, context);
    registerCallHandlers(socket, context);
    registerVoiceHandlers(socket, context);
  });
}

module.exports = { registerSocketHandlers };
