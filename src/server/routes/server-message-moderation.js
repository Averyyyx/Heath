'use strict';

function register(context) {
  const {
    app, db, ensureAuthenticated, ensureChannelAccess, getChannelRoom,
    io, messageLimiter, path, removeFileSafe, uploadsDir
  } = context;

app.delete('/api/servers/:serverId/channels/:channelId/messages/:messageId', ensureAuthenticated, messageLimiter, async (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);
  if (![serverId, channelId, messageId].every(Number.isInteger)) {
    return res.status(400).json({ message: 'Некорректный идентификатор сообщения.' });
  }
  try { ensureChannelAccess(serverId, channelId, req.user.id); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
  const message = db.prepare('SELECT id, author_id FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?')
    .get(messageId, serverId, channelId);
  if (!message) return res.status(404).json({ message: 'Сообщение не найдено.' });
  if (message.author_id !== req.user.id) return res.status(403).json({ message: 'Можно удалять только свои сообщения.' });
  const attachments = db.prepare('SELECT path FROM server_attachments WHERE server_message_id = ?').all(messageId);
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM message_reactions WHERE scope = 'channel' AND message_id = ?").run(messageId);
      db.prepare("DELETE FROM message_pins WHERE scope = 'channel' AND message_id = ?").run(messageId);
      db.prepare('DELETE FROM server_attachments WHERE server_message_id = ?').run(messageId);
      db.prepare('DELETE FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?').run(messageId, serverId, channelId);
    })();
    await Promise.all(attachments.map((attachment) => removeFileSafe(path.join(uploadsDir, attachment.path))));
    io.to(getChannelRoom(channelId)).emit('channel:message:delete', { serverId, channelId, messageId });
    return res.json({ deleted: true, messageId });
  } catch (error) {
    console.error('Channel message deletion failed:', error);
    return res.status(500).json({ message: 'Не удалось удалить сообщение.' });
  }
});
}

module.exports = { register };
