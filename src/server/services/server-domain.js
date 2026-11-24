'use strict';

function createServerDomainServices(dependencies) {
  const {
    PERMISSIONS, Server, computeBasePermissions,
    db, hasPermission, insertAttachmentRecord, insertMessage,
    insertServerAttachmentRecord, insertServerMessage, insertServerSettings, insertUserSettings, io,
    listChannelsForServer, listFriendships, listMessageReactions, listServerMembers, listServerMembersDetailed,
    normalizeBadges, sanitizeUser, selectChannelById, selectChannelMessageReadReceipt, selectConversationById,
    selectFriendshipBetween, selectLastMessageForConversation, selectMemberRoles, selectMessageDeliverySummary, selectMessagePin,
    selectMessageWithAuthor, selectOverridesForChannel, selectParticipant, selectParticipants, selectRolesForServer,
    selectServerById, selectServerMember, selectServerMessageWithAuthor, selectServerSettings, selectUserById,
    selectUserSettings, selectVoiceSessionsByChannel, serializeAttachment, server, session,
    updateConversationTimestamp, updateServerSettings, updateUserSettings
  } = dependencies;

  const { createMessageSerializers } = require('./message-serializers');

function broadcastUserUpdate(updatedUser) {
  if (!updatedUser || !io) return;
  const links = listFriendships.all(updatedUser.id, updatedUser.id)
    .filter((friendship) => friendship.status === 'accepted');
  const recipients = new Set();
  for (const link of links) {
    recipients.add(link.requester_id === updatedUser.id ? link.addressee_id : link.requester_id);
  }
  for (const recipientId of recipients) {
    io.to(getUserRoom(recipientId)).emit('user:update', { user: updatedUser });
  }
  io.to(getUserRoom(updatedUser.id)).emit('user:update', { user: updatedUser });
}

function hydrateFriendship(record, currentUserId) {
  if (!record) return null;
  const direction = record.requester_id === currentUserId ? 'outgoing' : 'incoming';
  const counterpartId = direction === 'outgoing' ? record.addressee_id : record.requester_id;
  const counterpart = sanitizeUser(selectUserById.get(counterpartId));

  return {
    id: record.id,
    status: record.status,
    direction,
    created_at: record.created_at,
    user: counterpart
  };
}

const {
  getMessagePin,
  getMessageReactions,
  getMessageDelivery,
  serializeMessage,
  serializeServerMessage,
  serializeConversation,
  getConversationParticipants
} = createMessageSerializers({
  db,
  selectMessagePin,
  listMessageReactions,
  selectMessageDeliverySummary,
  selectChannelMessageReadReceipt,
  selectParticipants,
  selectLastMessageForConversation,
  sanitizeUser,
  serializeAttachment
});

function ensureServerMembership(serverId, userId) {
  const server = selectServerById.get(serverId);
  if (!server) {
    const error = new Error('Server not found');
    error.statusCode = 404;
    throw error;
  }
  const membership = selectServerMember.get(serverId, userId);
  if (!membership) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
  return { server, membership };
}

function ensureServerOwnership(serverId, userId) {
  const { server } = ensureServerMembership(serverId, userId);
  if (server.owner_id !== userId) {
    const permissions = computeBasePermissions(serverId, userId);
    if (!hasPermission(permissions, PERMISSIONS.ADMIN | PERMISSIONS.MANAGE_SERVER)) {
      const error = new Error('Insufficient permissions.');
      error.statusCode = 403;
      throw error;
    }
  }
  return server;
}

function ensurePermission(serverId, userId, required) {
  const permissions = computeBasePermissions(serverId, userId);
  if (!hasPermission(permissions, required)) {
    const error = new Error('Insufficient permissions.');
    error.statusCode = 403;
    throw error;
  }
  return permissions;
}

function ensureChannelAccess(serverId, channelId, userId) {
  const channel = selectChannelById.get(channelId);
  if (!channel || channel.server_id !== serverId) {
    const error = new Error('Channel not found');
    error.statusCode = 404;
    throw error;
  }
  const { server, membership } = ensureServerMembership(serverId, userId);
  const memberRoles = selectMemberRoles.all(server.id, userId);
  const basePermissions = computeBasePermissions(server.id, userId, memberRoles);
  const overrides = selectOverridesForChannel.all(channel.id);
  let permissions = basePermissions;

  overrides.forEach((override) => {
    if (override.target_type === 'role') {
      const hasRole = memberRoles.some((role) => role.id === override.target_id);
      if (hasRole) {
        permissions &= ~override.deny;
        permissions |= override.allow;
      }
    } else if (override.target_type === 'member' && override.target_id === userId) {
      permissions &= ~override.deny;
      permissions |= override.allow;
    }
  });

  return { server, membership, channel, permissions };
}

function serializeChannel(channel, currentUserId = null) {
  if (!channel) return null;
  const overrides = selectOverridesForChannel.all(channel.id).map((override) => ({
    target_type: override.target_type,
    target_id: override.target_id,
    allow: override.allow,
    deny: override.deny
  }));
  return {
    id: channel.id,
    server_id: channel.server_id,
    type: channel.type,
    name: channel.name,
    topic: channel.topic,
    position: channel.position,
    slow_mode_seconds: channel.slow_mode_seconds || 0,
    is_nsfw: Boolean(channel.is_nsfw),
    bitrate: channel.bitrate || 64000,
    user_limit: channel.user_limit || 0,
    soundscape: channel.soundscape || '',
    ...(channel.type === 'voice' && Number.isInteger(currentUserId) ? (() => {
      try {
        const access = ensureChannelAccess(channel.server_id, channel.id, currentUserId);
        return {
          canConnect: hasPermission(access.permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.CONNECT_VOICE),
          canSpeak: hasPermission(access.permissions, PERMISSIONS.SPEAK_VOICE),
          canStream: hasPermission(access.permissions, PERMISSIONS.STREAM)
        };
      } catch { return { canConnect: false, canSpeak: false, canStream: false }; }
    })() : {}),
    overrides,
    created_at: channel.created_at
  };
}

function serializeServerEntity(server, currentUserId) {
  if (!server) return null;
  const channels = listChannelsForServer.all(server.id).map((channel) => serializeChannel(channel, currentUserId));
  const roles = selectRolesForServer.all(server.id).map((role) => ({
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    permissions: role.permissions,
    is_default: Boolean(role.is_default)
  }));
  const membership = selectServerMember.get(server.id, currentUserId);
  return {
    id: server.id,
    name: server.name,
    icon: server.icon,
    description: server.description,
    owner_id: server.owner_id,
    role: membership?.role || 'member',
    roles,
    channels,
    created_at: server.created_at
  };
}

function listServerMembersSerialized(serverId) {
  return listServerMembersDetailed.all(serverId).map((member) => ({
    id: member.id,
    user: {
      id: member.user_id,
      username: member.username,
      display_name: member.display_name,
      avatar_url: member.avatar_url,
      avatar_color: member.avatar_color || '#D97757'
    },
    role: member.role,
    nickname: member.nickname,
    joined_at: member.joined_at,
    roles: selectMemberRoles.all(serverId, member.user_id).map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position
    }))
  }));
}

function getUserSettings(userId) {
  let settings = selectUserSettings.get(userId);
  if (!settings) {
    insertUserSettings.run(userId);
    settings = selectUserSettings.get(userId);
  }
  return {
    theme: settings.theme,
    accent: settings.accent,
    background_url: settings.background_url,
    reduce_motion: Boolean(settings.reduce_motion),
    badges: normalizeBadges(settings.badges)
  };
}

function updateUserSettingsRecord(userId, payload) {
  const allowedThemes = ['light', 'dark', 'system'];
  const allowedAccents = ['terracotta'];
  const theme = allowedThemes.includes(payload.theme) ? payload.theme : 'system';
  const accent = allowedAccents.includes(payload.accent) ? payload.accent : 'terracotta';
  const background = (payload.background_url || '').trim().slice(0, 512);
  const reduceMotion = payload.reduce_motion ? 1 : 0;
  const badges = JSON.stringify(payload.badges || []);
  updateUserSettings.run(theme, accent, background, reduceMotion, badges, userId);
  return getUserSettings(userId);
}

function getServerSettings(serverId) {
  let settings = selectServerSettings.get(serverId);
  if (!settings) {
    insertServerSettings.run(serverId);
    settings = selectServerSettings.get(serverId);
  }
  return {
    default_notifications: settings.default_notifications,
    verification_level: settings.verification_level,
    system_channel_id: settings.system_channel_id,
    banner_url: settings.banner_url,
    premium_theme: settings.premium_theme
  };
}

function updateServerSettingsRecord(serverId, payload) {
  const notifications = ['all', 'mentions'].includes(payload.default_notifications)
    ? payload.default_notifications
    : 'all';
  const verificationLevels = ['none', 'low', 'medium', 'high'];
  const verification = verificationLevels.includes(payload.verification_level)
    ? payload.verification_level
    : 'low';
  let systemChannelId = null;
  if (Number.isFinite(payload.system_channel_id)) {
    const channel = selectChannelById.get(payload.system_channel_id);
    if (channel && channel.server_id === serverId) {
      systemChannelId = channel.id;
    }
  }
  const banner = (payload.banner_url || '').trim().slice(0, 512);
  const premiumTheme = (payload.premium_theme || '').trim().slice(0, 120);
  updateServerSettings.run(
    notifications,
    verification,
    systemChannelId,
    banner,
    premiumTheme,
    serverId
  );
  return getServerSettings(serverId);
}

function listVoiceParticipants(channelId) {
  return selectVoiceSessionsByChannel.all(channelId).map((session) => {
    let canSpeak = false;
    let canStream = false;
    try {
      const access = ensureChannelAccess(session.server_id, channelId, session.user_id);
      canSpeak = hasPermission(access.permissions, PERMISSIONS.SPEAK_VOICE);
      canStream = hasPermission(access.permissions, PERMISSIONS.STREAM);
    } catch {}
    return {
      user: {
        id: session.user_id,
        username: session.username,
        display_name: session.display_name,
        avatar_url: session.avatar_url,
        avatar_color: session.avatar_color || '#D97757'
      },
      muted: Boolean(session.muted),
      deafened: Boolean(session.deafened),
      canSpeak,
      canStream,
      joined_at: session.joined_at
    };
  });
}

function broadcastVoiceState(channelId) {
  const participants = listVoiceParticipants(channelId);
  io.to(getChannelRoom(channelId)).emit('voice:state', {
    channelId,
    participants
  });
}



function ensureConversationAccess(conversationId, userId) {
  const conversation = selectConversationById.get(conversationId);
  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }
  const participant = selectParticipant.get(conversationId, userId);
  if (!participant) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
  return conversation;
}

function getConversationRoom(conversationId) {
  return `conversation:${conversationId}`;
}

function getUserRoom(userId) {
  return `user:${userId}`;
}

function broadcastConversationUpdate(conversationId) {
  const conversation = selectConversationById.get(conversationId);
  if (!conversation) return;
  const participants = selectParticipants.all(conversationId);
  participants.forEach((participant) => {
    const sanitized = sanitizeUser(participant);
    io.to(getUserRoom(sanitized.id)).emit('conversation:upsert', {
      conversation: serializeConversation(conversation, sanitized.id)
    });
  });
}

function getServerRoom(serverId) {
  return `server:${serverId}`;
}

function getChannelRoom(channelId) {
  return `channel:${channelId}`;
}

function broadcastServerUpdate(serverId) {
  const server = selectServerById.get(serverId);
  if (!server) return;
  const members = listServerMembers.all(serverId);
  members.forEach((member) => {
    io.to(getUserRoom(member.user_id)).emit('server:upsert', {
      server: serializeServerEntity(server, member.user_id)
    });
  });
}

function emitChannelMessage(message) {
  if (!message) return;
  io.to(getChannelRoom(message.channel_id)).emit('channel:message:new', {
    serverId: message.server_id,
    channelId: message.channel_id,
    message
  });
  listServerMembers.all(message.server_id).forEach((member) => {
    io.to(getUserRoom(member.user_id)).emit('channel:message:notify', {
      serverId: message.server_id,
      channelId: message.channel_id,
      message
    });
  });
}

function createMessage(conversationId, authorId, content, attachmentPayload = null, replyToMessageId = null) {
  const conversation = ensureConversationAccess(conversationId, authorId);
  const replyId = replyToMessageId ? Number(replyToMessageId) : null;
  if (replyId !== null && (!Number.isInteger(replyId) || !db.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ?').get(replyId, conversationId))) {
    const error = new Error('Сообщение для ответа не найдено в этом диалоге.');
    error.statusCode = 400;
    throw error;
  }
  const trimmed = (content || '').trim();
  if (!trimmed && !attachmentPayload) {
    const error = new Error('Message must include text or attachment.');
    error.statusCode = 400;
    throw error;
  }

  const attachmentForClient = attachmentPayload ? attachmentPayload.public : null;
  const result = insertMessage.run(
    conversation.id,
    authorId,
    trimmed || null,
    attachmentForClient ? JSON.stringify(attachmentForClient) : null,
    replyId
  );
  const messageId = result.lastInsertRowid;
  if (attachmentPayload) {
    insertAttachmentRecord.run(
      attachmentForClient.id,
      messageId,
      conversation.id,
      attachmentForClient.name,
      attachmentForClient.mime,
      attachmentForClient.size,
      attachmentPayload.storagePath
    );
  }
  updateConversationTimestamp.run(conversation.id);
  const row = selectMessageWithAuthor.get(messageId);
  const message = serializeMessage(row);
  broadcastConversationUpdate(conversation.id);
  io.to(getConversationRoom(conversation.id)).emit('message:new', {
    conversationId: conversation.id,
    message
  });
  getConversationParticipants(conversation.id).forEach((participant) => {
    io.to(getUserRoom(participant.id)).emit('message:notify', {
      conversationId: conversation.id,
      message
    });
  });
  return message;
}

function createChannelMessage(serverId, channelId, authorId, content, attachmentPayload = null, replyToMessageId = null) {
  const { channel, permissions } = ensureChannelAccess(serverId, channelId, authorId);
  if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES)) {
    const error = new Error('Missing permission to send messages in this channel.');
    error.statusCode = 403;
    throw error;
  }
  if (channel.type !== 'text') {
    const error = new Error('Messages can only be sent to text channels.');
    error.statusCode = 400;
    throw error;
  }

  const replyId = replyToMessageId ? Number(replyToMessageId) : null;
  if (replyId !== null && (!Number.isInteger(replyId) || !db.prepare('SELECT id FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?').get(replyId, serverId, channelId))) {
    const error = new Error('Сообщение для ответа не найдено в этом канале.');
    error.statusCode = 400;
    throw error;
  }
  const trimmed = (content || '').trim();
  if (!trimmed && !attachmentPayload) {
    const error = new Error('Message must include text or attachment.');
    error.statusCode = 400;
    throw error;
  }
  const attachmentForClient = attachmentPayload ? attachmentPayload.public : null;
  const result = insertServerMessage.run(
    channel.server_id,
    channel.id,
    authorId,
    trimmed || null,
    attachmentForClient ? JSON.stringify(attachmentForClient) : null,
    replyId
  );
  const messageId = result.lastInsertRowid;
  if (attachmentPayload) {
    insertServerAttachmentRecord.run(
      attachmentForClient.id,
      messageId,
      channel.server_id,
      channel.id,
      attachmentForClient.name,
      attachmentForClient.mime,
      attachmentForClient.size,
      attachmentPayload.storagePath
    );
  }
  const row = selectServerMessageWithAuthor.get(messageId);
  const message = serializeServerMessage(row);
  emitChannelMessage(message);
  return message;
}

function ensureFriends(userA, userB) {
  const existing = selectFriendshipBetween.get(userA, userB, userB, userA);
  return existing && existing.status === 'accepted';
}

  return {
    broadcastUserUpdate, hydrateFriendship, ensureServerMembership, ensureServerOwnership,
    ensurePermission, ensureChannelAccess, serializeChannel, serializeServerEntity,
    listServerMembersSerialized, getUserSettings, updateUserSettingsRecord, getServerSettings,
    updateServerSettingsRecord, listVoiceParticipants, broadcastVoiceState, ensureConversationAccess,
    getConversationRoom, getUserRoom, broadcastConversationUpdate, getServerRoom,
    getChannelRoom, broadcastServerUpdate, emitChannelMessage, createMessage,
    createChannelMessage, ensureFriends, getMessagePin, getMessageReactions,
    getMessageDelivery, serializeMessage, serializeServerMessage, serializeConversation,
    getConversationParticipants
  };
}

module.exports = { createServerDomainServices };
