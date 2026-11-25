'use strict';

function register(context) {
  const {
    app, broadcastConversationUpdate, createMessage, db, deleteMessagePin,
    deleteMessageReaction, ensureAuthenticated, ensureConversationAccess, fs, getConversationRoom,
    getMessageDelivery, getMessagePin, getMessageReactions, getUserRoom, insertMessageDelivery,
    insertMessagePin, insertMessageReaction, io, listDmPins, listMessages,
    messageLimiter, path, processDmAttachment, removeFileSafe, selectAttachmentById,
    selectMessageWithAuthor, serializeMessage, updateConversationRead, upload, uploadsDir
  } = context;

app.get('/api/conversations/:id/messages', ensureAuthenticated, (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isFinite(conversationId)) {
    return res.status(400).json({ message: 'Invalid conversation id.' });
  }
  try {
    ensureConversationAccess(conversationId, req.user.id);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }

  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const offset = Number(req.query.offset) || 0;
  const rows = listMessages.all(conversationId, limit, offset);
  const messages = rows.map(serializeMessage).reverse();
  res.json({ messages });
});

app.post('/api/conversations/:id/delivered', ensureAuthenticated, messageLimiter, (req, res) => {
  const conversationId = Number(req.params.id);
  const messageIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds : [];
  if (!Number.isInteger(conversationId) || messageIds.length < 1 || messageIds.length > 100 ||
      messageIds.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0)) {
    return res.status(400).json({ message: 'Некорректный список доставленных сообщений.' });
  }
  try {
    ensureConversationAccess(conversationId, req.user.id);
    const ids = [...new Set(messageIds.map(Number))];
    const delivered = [];
    const deliver = db.transaction(() => {
      ids.forEach((messageId) => {
        const message = db.prepare('SELECT id, author_id FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId);
        if (!message || message.author_id === req.user.id) return;
        const result = insertMessageDelivery.run(conversationId, messageId, req.user.id);
        if (result.changes > 0) {
          delivered.push(messageId);
          const delivery = getMessageDelivery({ conversation_id: conversationId, id: messageId, author_id: message.author_id });
          io.to(getUserRoom(message.author_id)).emit('message:delivery:update', { conversationId, messageId, delivery });
        }
      });
    });
    deliver();
    return res.json({ conversationId, deliveredMessageIds: delivered });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось подтвердить доставку.' });
  }
});

app.patch('/api/conversations/:id/messages/:messageId', ensureAuthenticated, messageLimiter, (req, res) => {
  const conversationId = Number(req.params.id);
  const messageId = Number(req.params.messageId);
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!Number.isInteger(conversationId) || !Number.isInteger(messageId) || !content || content.length > 4000) {
    return res.status(400).json({ message: 'Сообщение должно содержать от 1 до 4000 символов.' });
  }
  try {
    ensureConversationAccess(conversationId, req.user.id);
    const existing = db.prepare('SELECT id, author_id, attachment FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId);
    if (!existing) return res.status(404).json({ message: 'Сообщение не найдено.' });
    if (existing.author_id !== req.user.id) return res.status(403).json({ message: 'Можно редактировать только свои сообщения.' });
    db.prepare('UPDATE messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ? AND conversation_id = ?').run(content, messageId, conversationId);
    const message = serializeMessage(selectMessageWithAuthor.get(messageId));
    io.to(getConversationRoom(conversationId)).emit('message:update', { conversationId, message });
    broadcastConversationUpdate(conversationId);
    return res.json({ message });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось изменить сообщение.' });
  }
});

app.get('/api/conversations/:id/pins', ensureAuthenticated, (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isInteger(conversationId)) return res.status(400).json({ message: 'Некорректный диалог.' });
  try {
    ensureConversationAccess(conversationId, req.user.id);
    const pins = listDmPins.all(conversationId)
      .map(({ message_id }) => serializeMessage(selectMessageWithAuthor.get(message_id)))
      .filter(Boolean);
    return res.json({ pins });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/api/conversations/:id/messages/:messageId/pin', ensureAuthenticated, messageLimiter, (req, res) => {
  const conversationId = Number(req.params.id);
  const messageId = Number(req.params.messageId);
  const action = req.body?.action;
  if (!Number.isInteger(conversationId) || !Number.isInteger(messageId) || !['pin', 'unpin'].includes(action)) {
    return res.status(400).json({ message: 'Некорректное действие закрепления.' });
  }
  try {
    ensureConversationAccess(conversationId, req.user.id);
    const message = db.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId);
    if (!message) return res.status(404).json({ message: 'Сообщение не найдено.' });
    if (action === 'pin') insertMessagePin.run('dm', messageId, conversationId, null, null, req.user.id);
    else deleteMessagePin.run('dm', messageId);
    const pin = getMessagePin('dm', messageId);
    io.to(getConversationRoom(conversationId)).emit('message:pin:update', { conversationId, messageId, pin });
    return res.json({ messageId, pin });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось закрепить сообщение.' });
  }
});

app.post('/api/conversations/:id/messages/:messageId/reactions', ensureAuthenticated, messageLimiter, (req, res) => {
  const conversationId = Number(req.params.id);
  const messageId = Number(req.params.messageId);
  const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji : '';
  const allowed = new Set(['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']);
  if (!Number.isInteger(conversationId) || !Number.isInteger(messageId) || !allowed.has(emoji)) {
    return res.status(400).json({ message: 'Некорректная реакция.' });
  }
  try {
    ensureConversationAccess(conversationId, req.user.id);
    const message = db.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId);
    if (!message) return res.status(404).json({ message: 'Сообщение не найдено.' });
    const existing = db.prepare('SELECT id FROM message_reactions WHERE scope = ? AND message_id = ? AND user_id = ? AND emoji = ?')
      .get('dm', messageId, req.user.id, emoji);
    if (existing) deleteMessageReaction.run('dm', messageId, req.user.id, emoji);
    else insertMessageReaction.run('dm', messageId, req.user.id, emoji);
    const reactions = getMessageReactions('dm', messageId);
    io.to(getConversationRoom(conversationId)).emit('message:reactions:update', { conversationId, messageId, reactions });
    return res.json({ messageId, reactions });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось добавить реакцию.' });
  }
});

app.post('/api/conversations/:id/read', ensureAuthenticated, (req, res) => {
  const conversationId = Number(req.params.id);
  const requestedMessageId = Number(req.body?.messageId);
  if (!Number.isInteger(conversationId) || !Number.isInteger(requestedMessageId) || requestedMessageId < 0) {
    return res.status(400).json({ message: 'Некорректная отметка прочтения.' });
  }
  try {
    ensureConversationAccess(conversationId, req.user.id);
    const readMessage = requestedMessageId === 0
      ? { id: 0 }
      : db.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ?').get(requestedMessageId, conversationId);
    if (!readMessage) return res.status(404).json({ message: 'Сообщение не найдено в этом диалоге.' });
    const lastReadMessageId = readMessage.id;
    updateConversationRead.run(lastReadMessageId, conversationId, req.user.id);
    broadcastConversationUpdate(conversationId);
    return res.json({ conversationId, userId: req.user.id, lastReadMessageId });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Не удалось отметить сообщения прочитанными.' });
  }
});

app.delete('/api/conversations/:id/messages/:messageId', ensureAuthenticated, messageLimiter, async (req, res) => {
  const conversationId = Number(req.params.id);
  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(conversationId) || !Number.isInteger(messageId)) {
    return res.status(400).json({ message: 'Некорректный идентификатор сообщения.' });
  }
  try { ensureConversationAccess(conversationId, req.user.id); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
  const message = db.prepare('SELECT id, author_id FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId);
  if (!message) return res.status(404).json({ message: 'Сообщение не найдено.' });
  if (message.author_id !== req.user.id) return res.status(403).json({ message: 'Можно удалять только свои сообщения.' });
  const attachments = db.prepare('SELECT path FROM attachments WHERE message_id = ?').all(messageId);
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM message_reactions WHERE scope = 'dm' AND message_id = ?").run(messageId);
      db.prepare("DELETE FROM message_pins WHERE scope = 'dm' AND message_id = ?").run(messageId);
      db.prepare('DELETE FROM message_deliveries WHERE conversation_id = ? AND message_id = ?').run(conversationId, messageId);
      db.prepare('DELETE FROM attachments WHERE message_id = ?').run(messageId);
      db.prepare('DELETE FROM messages WHERE id = ? AND conversation_id = ?').run(messageId, conversationId);
      db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId);
    })();
    await Promise.all(attachments.map((attachment) => removeFileSafe(path.join(uploadsDir, attachment.path))));
    io.to(getConversationRoom(conversationId)).emit('message:delete', { conversationId, messageId });
    broadcastConversationUpdate(conversationId);
    return res.json({ deleted: true, messageId });
  } catch (error) {
    console.error('DM message deletion failed:', error);
    return res.status(500).json({ message: 'Не удалось удалить сообщение.' });
  }
});

app.get('/api/files/:conversationId/:attachmentId', ensureAuthenticated, (req, res) => {
  const conversationId = Number(req.params.conversationId);
  const attachmentId = req.params.attachmentId;
  if (!Number.isFinite(conversationId) || !attachmentId) {
    return res.status(400).json({ message: 'Invalid parameters.' });
  }

  try {
    ensureConversationAccess(conversationId, req.user.id);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }

  const attachment = selectAttachmentById.get(attachmentId);
  if (!attachment || attachment.conversation_id !== conversationId) {
    return res.status(404).json({ message: 'Attachment not found.' });
  }

  const absolutePath = path.join(uploadsDir, attachment.path);
  if (!absolutePath.startsWith(uploadsDir) || !fs.existsSync(absolutePath)) {
    return res.status(404).json({ message: 'File missing.' });
  }

  res.setHeader('Content-Type', attachment.mime);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${attachment.name.replace(/"/g, '')}"`
  );
  res.sendFile(absolutePath);
});

app.post(
  '/api/conversations/:id/messages',
  ensureAuthenticated,
  messageLimiter,
  upload.single('attachment'),
  async (req, res) => {
    const conversationId = Number(req.params.id);
    if (!Number.isFinite(conversationId)) {
      if (req.file) await removeFileSafe(req.file.path);
      return res.status(400).json({ message: 'Invalid conversation id.' });
    }

    let attachmentPayload = null;
    if (req.file) {
      try {
        attachmentPayload = await processDmAttachment(req.file, conversationId);
      } catch (error) {
        return res.status(error.statusCode || 400).json({ message: error.message });
      }
    }

    try {
      const message = createMessage(conversationId, req.user.id, req.body.content, attachmentPayload, req.body.replyToMessageId);
      res.status(201).json({ message });
    } catch (error) {
      if (attachmentPayload) {
        await removeFileSafe(path.join(uploadsDir, attachmentPayload.storagePath));
      } else if (req.file) {
        await removeFileSafe(req.file.path);
      }
      res.status(error.statusCode || 500).json({ message: error.message });
    }
  }
);
}

module.exports = { register };
