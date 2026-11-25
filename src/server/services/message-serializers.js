'use strict';

function createMessageSerializers({
  db,
  selectMessagePin,
  listMessageReactions,
  selectMessageDeliverySummary,
  selectChannelMessageReadReceipt,
  selectParticipants,
  selectLastMessageForConversation,
  sanitizeUser,
  serializeAttachment
}) {
  function getMessageReply(scope, replyToMessageId) {
    if (!replyToMessageId) return null;
    const row = scope === 'dm'
      ? db.prepare(`
          SELECT m.id, m.content, m.attachment, u.id AS author_id, u.username, u.display_name
          FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?
        `).get(replyToMessageId)
      : db.prepare(`
          SELECT sm.id, sm.content, sm.attachment, u.id AS author_id, u.username, u.display_name
          FROM server_messages sm JOIN users u ON u.id = sm.author_id WHERE sm.id = ?
        `).get(replyToMessageId);
    if (!row) return null;
    return {
      id: row.id,
      content: row.content || (row.attachment ? (serializeAttachment(row.attachment)?.name || 'Вложение') : ''),
      author: { id: row.author_id, username: row.username, display_name: row.display_name }
    };
  }

  function getMessagePin(scope, messageId) {
    const row = selectMessagePin.get(scope, messageId);
    return row ? { pinned_at: row.pinned_at, pinned_by: row.pinned_by } : null;
  }

  function getMessageReactions(scope, messageId) {
    return listMessageReactions.all(scope, messageId).map((row) => ({
      emoji: row.emoji,
      count: Number(row.count),
      user_ids: row.user_ids ? row.user_ids.split(',').map(Number) : []
    }));
  }

  function getMessageDelivery(row) {
    if (!row?.conversation_id || !row?.id || !row?.author_id) return null;
    const result = selectMessageDeliverySummary.get(row.conversation_id, row.id, row.conversation_id, row.author_id);
    return { delivered_count: Number(result?.delivered_count || 0), recipient_count: Number(result?.recipient_count || 0) };
  }

  function serializeMessage(row) {
    if (!row) return null;
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      author: {
        id: row.author_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        avatar_color: row.avatar_color || '#D97757',
        avatar_preset: Number.isInteger(row.avatar_preset) ? row.avatar_preset : 0
      },
      content: row.content,
      attachment: serializeAttachment(row.attachment),
      created_at: row.created_at,
      edited_at: row.edited_at || null,
      reactions: getMessageReactions('dm', row.id),
      reply_to: getMessageReply('dm', row.reply_to_message_id),
      pin: getMessagePin('dm', row.id),
      delivery: getMessageDelivery(row)
    };
  }

  function getChannelMessageReadReceipt(row) {
    if (!row?.channel_id || !row?.server_id || !row?.id || !row?.author_id) return null;
    const result = selectChannelMessageReadReceipt.get(row.server_id, row.channel_id, row.id, row.author_id, row.server_id, row.author_id);
    return { read_count: Number(result?.read_count || 0), member_count: Number(result?.member_count || 0) };
  }

  function serializeServerMessage(row) {
    if (!row) return null;
    return {
      id: row.id,
      server_id: row.server_id,
      channel_id: row.channel_id,
      author: {
        id: row.author_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        avatar_color: row.avatar_color || '#D97757',
        avatar_preset: Number.isInteger(row.avatar_preset) ? row.avatar_preset : 0
      },
      content: row.content,
      attachment: serializeAttachment(row.attachment),
      created_at: row.created_at,
      edited_at: row.edited_at || null,
      reactions: getMessageReactions('channel', row.id),
      reply_to: getMessageReply('channel', row.reply_to_message_id),
      pin: getMessagePin('channel', row.id),
      read_receipt: getChannelMessageReadReceipt(row)
    };
  }

  function getConversationParticipants(conversationId) {
    return selectParticipants.all(conversationId).map((user) => sanitizeUser(user));
  }

  function serializeConversation(conversation, currentUserId) {
    if (!conversation) return null;
    const participants = getConversationParticipants(conversation.id);
    const counterpart = conversation.type === 'dm'
      ? participants.find((participant) => participant.id !== currentUserId)
      : null;

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title || (counterpart?.display_name || counterpart?.username),
      participants,
      counterpart,
      last_message: serializeMessage(selectLastMessageForConversation.get(conversation.id)),
      updated_at: conversation.updated_at
    };
  }

  return { getMessageReply, getMessagePin, getMessageReactions, getMessageDelivery, getChannelMessageReadReceipt, serializeMessage, serializeServerMessage, serializeConversation, getConversationParticipants };
}

module.exports = { createMessageSerializers };
