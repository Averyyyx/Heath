'use strict';

function register(context) {
  const {
    PERMISSIONS, app, computeBasePermissions, createChannelMessage, db,
    deleteMessagePin, deleteMessageReaction, deleteOverride, ensureAuthenticated, ensureChannelAccess,
    fs, getChannelRoom, getMessagePin, getMessageReactions, hasPermission,
    insertMessagePin, insertMessageReaction, io, listChannelMessages, listChannelPins,
    messageLimiter, path, processServerAttachment, removeFileSafe, selectChannelReadState,
    selectRoleById, selectServerAttachmentById, selectServerMember, selectServerMessageWithAuthor, serializeServerMessage,
    server, upload, uploadsDir, upsertChannelReadState, upsertOverride
  } = context;

app.get('/api/servers/:serverId/channels/:channelId/messages', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  try {
    ensureChannelAccess(serverId, channelId, req.user.id);
    const rows = listChannelMessages.all(channelId, limit, offset);
    const messages = rows.map(serializeServerMessage).reverse();
    return res.json({ messages });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/api/servers/:serverId/channels/:channelId/read', ensureAuthenticated, messageLimiter, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.body?.messageId);
  if (![serverId, channelId, messageId].every(Number.isInteger) || messageId < 0) {
    return res.status(400).json({ message: 'Некорректная отметка прочтения.' });
  }
  try {
    const { permissions } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL)) return res.status(403).json({ message: 'Нет доступа к этому каналу.' });
    if (messageId > 0) {
      const message = db.prepare('SELECT id FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?').get(messageId, serverId, channelId);
      if (!message) return res.status(404).json({ message: 'Сообщение не найдено в этом канале.' });
    }
    const previousReadMessageId = Number(selectChannelReadState.get(channelId, req.user.id)?.last_read_message_id || 0);
    const lastReadMessageId = Math.max(previousReadMessageId, messageId);
    if (lastReadMessageId > previousReadMessageId) {
      upsertChannelReadState.run(channelId, req.user.id, lastReadMessageId);
      io.to(getChannelRoom(channelId)).emit('channel:read:update', {
        serverId, channelId, userId: req.user.id, previousReadMessageId, lastReadMessageId
      });
    }
    return res.json({ serverId, channelId, userId: req.user.id, previousReadMessageId, lastReadMessageId });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось отметить сообщения прочитанными.' });
  }
});

app.get('/api/servers/:serverId/channels/:channelId/pins', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (![serverId, channelId].every(Number.isInteger)) return res.status(400).json({ message: 'Некорректный канал.' });
  try {
    const { permissions } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL)) return res.status(403).json({ message: 'Нет доступа к этому каналу.' });
    const pins = listChannelPins.all(channelId)
      .map(({ message_id }) => serializeServerMessage(selectServerMessageWithAuthor.get(message_id)))
      .filter(Boolean);
    return res.json({ pins });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/api/servers/:serverId/channels/:channelId/messages/:messageId/pin', ensureAuthenticated, messageLimiter, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);
  const action = req.body?.action;
  if (![serverId, channelId, messageId].every(Number.isInteger) || !['pin', 'unpin'].includes(action)) {
    return res.status(400).json({ message: 'Некорректное действие закрепления.' });
  }
  try {
    const { permissions } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.MANAGE_MESSAGES)) {
      return res.status(403).json({ message: 'Для закрепления сообщений требуется право «Управление сообщениями».' });
    }
    const message = db.prepare('SELECT id FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?').get(messageId, serverId, channelId);
    if (!message) return res.status(404).json({ message: 'Сообщение не найдено.' });
    if (action === 'pin') insertMessagePin.run('channel', messageId, null, serverId, channelId, req.user.id);
    else deleteMessagePin.run('channel', messageId);
    const pin = getMessagePin('channel', messageId);
    io.to(getChannelRoom(channelId)).emit('channel:pin:update', { channelId, messageId, pin });
    return res.json({ messageId, pin });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось закрепить сообщение.' });
  }
});

app.post('/api/servers/:serverId/channels/:channelId/messages/:messageId/reactions', ensureAuthenticated, messageLimiter, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);
  const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji : '';
  const allowed = new Set(['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']);
  if (![serverId, channelId, messageId].every(Number.isInteger) || !allowed.has(emoji)) {
    return res.status(400).json({ message: 'Некорректная реакция.' });
  }
  try {
    const { permissions } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL)) return res.status(403).json({ message: 'Нет доступа к этому каналу.' });
    const message = db.prepare('SELECT id FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?')
      .get(messageId, serverId, channelId);
    if (!message) return res.status(404).json({ message: 'Сообщение не найдено.' });
    const existing = db.prepare('SELECT id FROM message_reactions WHERE scope = ? AND message_id = ? AND user_id = ? AND emoji = ?')
      .get('channel', messageId, req.user.id, emoji);
    if (existing) deleteMessageReaction.run('channel', messageId, req.user.id, emoji);
    else insertMessageReaction.run('channel', messageId, req.user.id, emoji);
    const reactions = getMessageReactions('channel', messageId);
    io.to(getChannelRoom(channelId)).emit('channel:reactions:update', { channelId, messageId, reactions });
    return res.json({ messageId, reactions });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось добавить реакцию.' });
  }
});

app.patch('/api/servers/:serverId/channels/:channelId/messages/:messageId', ensureAuthenticated, messageLimiter, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!Number.isInteger(serverId) || !Number.isInteger(channelId) || !Number.isInteger(messageId) || !content || content.length > 4000) {
    return res.status(400).json({ message: 'Сообщение должно содержать от 1 до 4000 символов.' });
  }
  try {
    ensureChannelAccess(serverId, channelId, req.user.id);
    const existing = db.prepare('SELECT id, author_id FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?').get(messageId, serverId, channelId);
    if (!existing) return res.status(404).json({ message: 'Сообщение не найдено.' });
    if (existing.author_id !== req.user.id) return res.status(403).json({ message: 'Можно редактировать только свои сообщения.' });
    db.prepare('UPDATE server_messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ? AND server_id = ? AND channel_id = ?').run(content, messageId, serverId, channelId);
    const row = db.prepare(`
      SELECT sm.*, u.username, u.display_name, u.avatar_url, u.avatar_color
      FROM server_messages sm JOIN users u ON u.id = sm.author_id
      WHERE sm.id = ?
    `).get(messageId);
    const message = serializeServerMessage(row);
    io.to(getChannelRoom(channelId)).emit('server:message:update', { serverId, channelId, message });
    return res.json({ message });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось изменить сообщение.' });
  }
});

app.post(
  '/api/servers/:serverId/channels/:channelId/messages',
  ensureAuthenticated,
  messageLimiter,
  upload.single('attachment'),
  async (req, res) => {
    const serverId = Number(req.params.serverId);
    const channelId = Number(req.params.channelId);
    if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
      if (req.file) await removeFileSafe(req.file.path);
      return res.status(400).json({ message: 'Invalid identifiers.' });
    }

    let attachmentPayload = null;
    if (req.file) {
      try {
        attachmentPayload = await processServerAttachment(req.file, serverId, channelId);
      } catch (error) {
        return res.status(error.statusCode || 400).json({ message: error.message });
      }
    }

    try {
      const message = createChannelMessage(
        serverId,
        channelId,
        req.user.id,
        req.body.content,
        attachmentPayload,
        req.body.replyToMessageId
      );
      return res.status(201).json({ message });
    } catch (error) {
      if (attachmentPayload) {
        await removeFileSafe(path.join(uploadsDir, attachmentPayload.storagePath));
      } else if (req.file) {
        await removeFileSafe(req.file.path);
      }
      return res.status(error.statusCode || 500).json({ message: error.message });
    }
  }
);

app.post('/api/servers/:serverId/channels/:channelId/permissions', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  const { targetType, targetId, allow = 0, deny = 0 } = req.body || {};
  if (!['role', 'member'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid target type.' });
  }
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ message: 'Invalid target id.' });
  }
  try {
    const { channel } = ensureChannelAccess(serverId, channelId, req.user.id);
    const permissions = computeBasePermissions(serverId, req.user.id);
    if (!hasPermission(permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      const error = new Error('Missing permission to manage channel.');
      error.statusCode = 403;
      throw error;
    }
    if (targetType === 'role') {
      const role = selectRoleById.get(targetId);
      if (!role || role.server_id !== serverId) {
        return res.status(404).json({ message: 'Role not found.' });
      }
    } else {
      const member = selectServerMember.get(serverId, targetId);
      if (!member) {
        return res.status(404).json({ message: 'Member not found.' });
      }
    }
    upsertOverride.run(channel.id, targetType, targetId, allow, deny);
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.delete('/api/servers/:serverId/channels/:channelId/permissions', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  const { targetType, targetId } = req.body || {};
  if (!['role', 'member'].includes(targetType)) {
    return res.status(400).json({ message: 'Invalid target type.' });
  }
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ message: 'Invalid target id.' });
  }
  try {
    const { channel } = ensureChannelAccess(serverId, channelId, req.user.id);
    const permissions = computeBasePermissions(serverId, req.user.id);
    if (!hasPermission(permissions, PERMISSIONS.MANAGE_CHANNELS)) {
      const error = new Error('Missing permission to manage channel.');
      error.statusCode = 403;
      throw error;
    }
    deleteOverride.run(channel.id, targetType, targetId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.get(
  '/api/servers/:serverId/channels/:channelId/files/:attachmentId',
  ensureAuthenticated,
  (req, res) => {
    const serverId = Number(req.params.serverId);
    const channelId = Number(req.params.channelId);
    const attachmentId = req.params.attachmentId;
    if (!Number.isFinite(serverId) || !Number.isFinite(channelId) || !attachmentId) {
      return res.status(400).json({ message: 'Invalid parameters.' });
    }
    try {
      ensureChannelAccess(serverId, channelId, req.user.id);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ message: error.message });
    }
    const attachment = selectServerAttachmentById.get(attachmentId);
    if (
      !attachment ||
      attachment.server_id !== serverId ||
      attachment.channel_id !== channelId
    ) {
      return res.status(404).json({ message: 'Attachment not found.' });
    }
    const absolutePath = path.join(uploadsDir, attachment.path);
    if (!absolutePath.startsWith(uploadsDir) || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'File missing.' });
    }
    res.setHeader('Content-Type', attachment.mime);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.name.replace(/"/g, '')}"`);
    return res.sendFile(absolutePath);
  }
);
}

module.exports = { register };
