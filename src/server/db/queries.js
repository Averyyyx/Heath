'use strict';

function createQueries(db) {
  const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const selectUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const insertUser = db.prepare('INSERT INTO users (email, username, password_hash, avatar_url, email_verified, twofa_enabled, twofa_secret) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const selectUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const updateTwoFactor = db.prepare('UPDATE users SET twofa_secret = ?, twofa_enabled = ? WHERE id = ?');
  const updatePasswordHash = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const markProfile = db.prepare(`
    UPDATE users
    SET display_name = ?, username = ?, discriminator = ?, bio = ?, avatar_color = ?,
        avatar_url = CASE WHEN avatar_preset != ? THEN '' ELSE avatar_url END,
        avatar_preset = ?, profile_complete = 1,
        display_name_changed_at = CASE WHEN display_name != ? THEN CURRENT_TIMESTAMP ELSE display_name_changed_at END,
        username_changed_at = CASE WHEN username != ? THEN CURRENT_TIMESTAMP ELSE username_changed_at END
    WHERE id = ?
  `);
  const selectOAuthAccount = db.prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?');
  const insertOAuthAccount = db.prepare(`
    INSERT INTO oauth_accounts (user_id, provider, provider_user_id, access_token, refresh_token)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertConversation = db.prepare('INSERT INTO conversations (type, title) VALUES (?, ?)');
  const updateConversationTimestamp = db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const selectConversationById = db.prepare('SELECT * FROM conversations WHERE id = ?');
  const selectConversationBetween = db.prepare(`
    SELECT c.*
    FROM conversations c
    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
    WHERE c.type = 'dm'
  `);
  const insertParticipant = db.prepare('INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES (?, ?, ?)');
  const selectParticipants = db.prepare(`
    SELECT u.*, cp.last_read_message_id
    FROM conversation_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = ?
  `);
  const selectParticipant = db.prepare('SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?');
  const updateConversationRead = db.prepare(`
    UPDATE conversation_participants
    SET last_read_message_id = MAX(COALESCE(last_read_message_id, 0), ?)
    WHERE conversation_id = ? AND user_id = ?
  `);
  const listConversationsForUser = db.prepare(`
    SELECT c.*, MAX(m.created_at) AS last_activity
    FROM conversations c
    JOIN conversation_participants cp ON cp.conversation_id = c.id
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE cp.user_id = ?
    GROUP BY c.id
    ORDER BY datetime(COALESCE(last_activity, c.updated_at)) DESC
  `);
  const insertMessageDelivery = db.prepare('INSERT OR IGNORE INTO message_deliveries (conversation_id, message_id, user_id) VALUES (?, ?, ?)');
  const selectMessageDeliverySummary = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM message_deliveries WHERE conversation_id = ? AND message_id = ?) AS delivered_count,
      (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = ? AND user_id != ?) AS recipient_count
  `);
  const insertMessage = db.prepare('INSERT INTO messages (conversation_id, author_id, content, attachment, reply_to_message_id) VALUES (?, ?, ?, ?, ?)');
  const selectMessageById = db.prepare('SELECT * FROM messages WHERE id = ?');
  const selectMessageWithAuthor = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_url, u.avatar_color, u.avatar_preset
    FROM messages m
    JOIN users u ON u.id = m.author_id
    WHERE m.id = ?
  `);
  const selectMessagePin = db.prepare('SELECT pinned_at, pinned_by FROM message_pins WHERE scope = ? AND message_id = ?');
  const insertMessagePin = db.prepare('INSERT OR IGNORE INTO message_pins (scope, message_id, conversation_id, server_id, channel_id, pinned_by) VALUES (?, ?, ?, ?, ?, ?)');
  const deleteMessagePin = db.prepare('DELETE FROM message_pins WHERE scope = ? AND message_id = ?');
  const listDmPins = db.prepare("SELECT message_id FROM message_pins WHERE scope = 'dm' AND conversation_id = ? ORDER BY datetime(pinned_at) DESC");
  const listChannelPins = db.prepare("SELECT message_id FROM message_pins WHERE scope = 'channel' AND channel_id = ? ORDER BY datetime(pinned_at) DESC");
  
  const listMessageReactions = db.prepare(`
    SELECT emoji, COUNT(*) AS count, GROUP_CONCAT(user_id) AS user_ids
    FROM message_reactions WHERE scope = ? AND message_id = ?
    GROUP BY emoji ORDER BY MIN(id) ASC
  `);
  const insertMessageReaction = db.prepare('INSERT OR IGNORE INTO message_reactions (scope, message_id, user_id, emoji) VALUES (?, ?, ?, ?)');
  const deleteMessageReaction = db.prepare('DELETE FROM message_reactions WHERE scope = ? AND message_id = ? AND user_id = ? AND emoji = ?');
  
  const listMessages = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_url, u.avatar_color, u.avatar_preset
    FROM messages m
    JOIN users u ON u.id = m.author_id
    WHERE m.conversation_id = ?
    ORDER BY m.id DESC
    LIMIT ?
    OFFSET ?
  `);
  const selectLastMessageForConversation = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_url, u.avatar_color, u.avatar_preset
    FROM messages m JOIN users u ON u.id = m.author_id
    WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1
  `);
  const listFriendships = db.prepare('SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ?');
  const insertAttachmentRecord = db.prepare(`
    INSERT INTO attachments (id, message_id, conversation_id, name, mime, size, path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const selectAttachmentById = db.prepare('SELECT * FROM attachments WHERE id = ?');
  const selectFriendshipBetween = db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `);
  const selectFriendshipById = db.prepare('SELECT * FROM friendships WHERE id = ?');
  const insertFriendRequest = db.prepare('INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)');
  const updateFriendStatus = db.prepare('UPDATE friendships SET status = ? WHERE id = ?');
  const deleteFriendship = db.prepare('DELETE FROM friendships WHERE id = ?');
  const insertServer = db.prepare('INSERT INTO servers (owner_id, name, icon, description) VALUES (?, ?, ?, ?)');
  const selectServerById = db.prepare('SELECT * FROM servers WHERE id = ?');
  const listServersForUser = db.prepare(`
    SELECT s.*, sm.role
    FROM servers s
    JOIN server_members sm ON sm.server_id = s.id
    WHERE sm.user_id = ?
    ORDER BY datetime(s.created_at) DESC
  `);
  const insertServerMember = db.prepare('INSERT INTO server_members (server_id, user_id, role, nickname) VALUES (?, ?, ?, ?)');
  const selectServerMember = db.prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?');
  const listServerMembers = db.prepare('SELECT * FROM server_members WHERE server_id = ?');
  const selectChannelReadState = db.prepare('SELECT last_read_message_id FROM channel_read_states WHERE channel_id = ? AND user_id = ?');
  const upsertChannelReadState = db.prepare(`
    INSERT INTO channel_read_states (channel_id, user_id, last_read_message_id) VALUES (?, ?, ?)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET
      last_read_message_id = MAX(channel_read_states.last_read_message_id, excluded.last_read_message_id),
      updated_at = CURRENT_TIMESTAMP
  `);
  const selectChannelMessageReadReceipt = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM channel_read_states cr JOIN server_members sm ON sm.user_id = cr.user_id AND sm.server_id = ?
        WHERE cr.channel_id = ? AND cr.last_read_message_id >= ? AND cr.user_id != ?) AS read_count,
      (SELECT COUNT(*) FROM server_members WHERE server_id = ? AND user_id != ?) AS member_count
  `);
  const listServerMembersDetailed = db.prepare(`
    SELECT sm.*, u.username, u.display_name, u.avatar_url, u.avatar_color, u.avatar_preset
    FROM server_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.server_id = ?
    ORDER BY sm.joined_at ASC
  `);
  const insertChannel = db.prepare('INSERT INTO channels (server_id, type, name, topic, position) VALUES (?, ?, ?, ?, ?)');
  const selectChannelById = db.prepare('SELECT * FROM channels WHERE id = ?');
  const listChannelsForServer = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC, id ASC');
  const insertServerMessage = db.prepare('INSERT INTO server_messages (server_id, channel_id, author_id, content, attachment, reply_to_message_id) VALUES (?, ?, ?, ?, ?, ?)');
  const selectServerMessageById = db.prepare('SELECT * FROM server_messages WHERE id = ?');
  const selectServerMessageWithAuthor = db.prepare(`
    SELECT sm.*, u.username, u.display_name, u.avatar_url, u.avatar_color, u.avatar_preset
    FROM server_messages sm
    JOIN users u ON u.id = sm.author_id
    WHERE sm.id = ?
  `);
  const listChannelMessages = db.prepare(`
    SELECT sm.*, u.username, u.display_name, u.avatar_url, u.avatar_color
    FROM server_messages sm
    JOIN users u ON u.id = sm.author_id
    WHERE sm.channel_id = ?
    ORDER BY sm.id DESC
    LIMIT ?
    OFFSET ?
  `);
  const insertServerAttachmentRecord = db.prepare(`
    INSERT INTO server_attachments (id, server_message_id, server_id, channel_id, name, mime, size, path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectServerAttachmentById = db.prepare('SELECT * FROM server_attachments WHERE id = ?');
  const updateServerProfile = db.prepare('UPDATE servers SET name = ?, description = ?, icon = ? WHERE id = ?');
  const selectUserSettings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
  const insertUserSettings = db.prepare(`
    INSERT INTO user_settings (user_id, theme, accent, background_url, reduce_motion, badges)
    VALUES (?, 'nebula', 'violet', '', 0, '[]')
  `);
  const updateUserSettings = db.prepare(`
    UPDATE user_settings
    SET theme = ?, accent = ?, background_url = ?, reduce_motion = ?, badges = ?
    WHERE user_id = ?
  `);
  const selectServerSettings = db.prepare('SELECT * FROM server_settings WHERE server_id = ?');
  const insertServerSettings = db.prepare(`
    INSERT INTO server_settings (server_id, default_notifications, verification_level, system_channel_id, banner_url, premium_theme)
    VALUES (?, 'all', 'low', NULL, '', '')
  `);
  const updateServerSettings = db.prepare(`
    UPDATE server_settings
    SET default_notifications = ?, verification_level = ?, system_channel_id = ?, banner_url = ?, premium_theme = ?
    WHERE server_id = ?
  `);
  const selectPremiumPlans = db.prepare('SELECT * FROM premium_plans ORDER BY price_cents ASC');
  const selectPremiumPlanById = db.prepare('SELECT * FROM premium_plans WHERE id = ?');
  const selectPremiumPlanBySlug = db.prepare('SELECT * FROM premium_plans WHERE slug = ?');
  const insertPremiumPlan = db.prepare(`
    INSERT INTO premium_plans (slug, name, description, price_cents, currency, perks)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertPremiumTransaction = db.prepare(`
    INSERT INTO premium_transactions (user_id, plan_id, amount_cents, currency, status, payment_intent, client_secret)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const selectPremiumTransactionById = db.prepare('SELECT * FROM premium_transactions WHERE id = ?');
  const updatePremiumTransactionStatus = db.prepare(`
    UPDATE premium_transactions
    SET status = ?, payment_intent = ?
    WHERE id = ?
  `);
  const insertPremiumSubscription = db.prepare(`
    INSERT INTO premium_subscriptions (user_id, plan_id, status, started_at, renews_at, metadata)
    VALUES (?, ?, 'active', CURRENT_TIMESTAMP, DATETIME('now', '+30 days'), ?)
  `);
  const selectPremiumBalance = db.prepare(`
    SELECT SUM(CASE WHEN status = 'succeeded' THEN amount_cents ELSE 0 END) AS available_cents,
           SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) AS pending_cents
    FROM premium_transactions
  `);
  const selectRolesForServer = db.prepare('SELECT * FROM server_roles WHERE server_id = ? ORDER BY position DESC, id DESC');
  const selectRoleById = db.prepare('SELECT * FROM server_roles WHERE id = ?');
  const insertRole = db.prepare('INSERT INTO server_roles (server_id, name, color, position, permissions, is_default) VALUES (?, ?, ?, ?, ?, ?)');
  const updateRole = db.prepare('UPDATE server_roles SET name = ?, color = ?, position = ?, permissions = ?, is_default = ? WHERE id = ?');
  const deleteRole = db.prepare('DELETE FROM server_roles WHERE id = ? AND server_id = ?');
  const assignRoleToMember = db.prepare('INSERT OR IGNORE INTO server_member_roles (server_id, role_id, user_id) VALUES (?, ?, ?)');
  const removeRoleFromMember = db.prepare('DELETE FROM server_member_roles WHERE server_id = ? AND role_id = ? AND user_id = ?');
  const selectMemberRoles = db.prepare(`
    SELECT sr.*
    FROM server_member_roles smr
    JOIN server_roles sr ON sr.id = smr.role_id
    WHERE smr.server_id = ? AND smr.user_id = ?
    ORDER BY sr.position DESC
  `);
  const selectDefaultRole = db.prepare('SELECT * FROM server_roles WHERE server_id = ? AND is_default = 1');
  const selectOverride = db.prepare(`
    SELECT * FROM channel_permission_overrides
    WHERE channel_id = ? AND target_type = ? AND target_id = ?
  `);
  const upsertOverride = db.prepare(`
    INSERT INTO channel_permission_overrides (channel_id, target_type, target_id, allow, deny)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(channel_id, target_type, target_id) DO UPDATE SET allow = excluded.allow, deny = excluded.deny
  `);
  const deleteOverride = db.prepare(`
    DELETE FROM channel_permission_overrides WHERE channel_id = ? AND target_type = ? AND target_id = ?
  `);
  const selectOverridesForChannel = db.prepare(`
    SELECT * FROM channel_permission_overrides WHERE channel_id = ?
  `);
  const selectVoiceSessionsByChannel = db.prepare(`
    SELECT vs.*, u.username, u.display_name, u.avatar_url, u.avatar_color
    FROM voice_sessions vs
    JOIN users u ON u.id = vs.user_id
    WHERE vs.channel_id = ?
    ORDER BY vs.joined_at ASC
  `);
  const upsertVoiceSession = db.prepare(`
    INSERT INTO voice_sessions (server_id, channel_id, user_id, muted, deafened)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET muted = excluded.muted, deafened = excluded.deafened
  `);
  const deleteVoiceSession = db.prepare('DELETE FROM voice_sessions WHERE channel_id = ? AND user_id = ?');
  const deleteVoiceSessionsForUser = db.prepare('DELETE FROM voice_sessions WHERE user_id = ?');
  
  const PERMISSIONS = {
    ADMIN: 1 << 0,
    MANAGE_SERVER: 1 << 1,
    MANAGE_ROLES: 1 << 2,
    MANAGE_CHANNELS: 1 << 3,
    VIEW_CHANNEL: 1 << 4,
    SEND_MESSAGES: 1 << 5,
    MANAGE_MESSAGES: 1 << 6,
    CONNECT_VOICE: 1 << 7,
    SPEAK_VOICE: 1 << 8,
    STREAM: 1 << 9,
    PRIORITY_SPEAKER: 1 << 10
  };
  
  // Existing default community roles receive the baseline permissions needed for voice rooms.
  db.prepare('UPDATE server_roles SET permissions = permissions | ? WHERE is_default = 1')
    .run((1 << 7) | (1 << 8) | (1 << 9));
  
  
  return {
    selectUserByEmail,
    selectUserById,
    insertUser,
    selectUserByUsername,
    updateTwoFactor,
    updatePasswordHash,
    markProfile,
    selectOAuthAccount,
    insertOAuthAccount,
    insertConversation,
    updateConversationTimestamp,
    selectConversationById,
    selectConversationBetween,
    insertParticipant,
    selectParticipants,
    selectParticipant,
    updateConversationRead,
    listConversationsForUser,
    insertMessageDelivery,
    selectMessageDeliverySummary,
    insertMessage,
    selectMessageById,
    selectMessageWithAuthor,
    selectMessagePin,
    insertMessagePin,
    deleteMessagePin,
    listDmPins,
    listChannelPins,
    listMessageReactions,
    insertMessageReaction,
    deleteMessageReaction,
    listMessages,
    selectLastMessageForConversation,
    listFriendships,
    insertAttachmentRecord,
    selectAttachmentById,
    selectFriendshipBetween,
    selectFriendshipById,
    insertFriendRequest,
    updateFriendStatus,
    deleteFriendship,
    insertServer,
    selectServerById,
    listServersForUser,
    insertServerMember,
    selectServerMember,
    listServerMembers,
    selectChannelReadState,
    upsertChannelReadState,
    selectChannelMessageReadReceipt,
    listServerMembersDetailed,
    insertChannel,
    selectChannelById,
    listChannelsForServer,
    insertServerMessage,
    selectServerMessageById,
    selectServerMessageWithAuthor,
    listChannelMessages,
    insertServerAttachmentRecord,
    selectServerAttachmentById,
    updateServerProfile,
    selectUserSettings,
    insertUserSettings,
    updateUserSettings,
    selectServerSettings,
    insertServerSettings,
    updateServerSettings,
    selectPremiumPlans,
    selectPremiumPlanById,
    selectPremiumPlanBySlug,
    insertPremiumPlan,
    insertPremiumTransaction,
    selectPremiumTransactionById,
    updatePremiumTransactionStatus,
    insertPremiumSubscription,
    selectPremiumBalance,
    selectRolesForServer,
    selectRoleById,
    insertRole,
    updateRole,
    deleteRole,
    assignRoleToMember,
    removeRoleFromMember,
    selectMemberRoles,
    selectDefaultRole,
    selectOverride,
    upsertOverride,
    deleteOverride,
    selectOverridesForChannel,
    selectVoiceSessionsByChannel,
    upsertVoiceSession,
    deleteVoiceSession,
    deleteVoiceSessionsForUser,
    PERMISSIONS
  };
}

module.exports = { createQueries };
