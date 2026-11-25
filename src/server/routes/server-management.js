'use strict';

function register(context) {
  const {
    PERMISSIONS, Server, app, assignRoleToMember, broadcastServerUpdate,
    db, ensureAuthenticated, ensurePermission, ensureServerMembership, ensureServerOwnership,
    friendActionLimiter, getChannelRoom, getServerSettings, getUserRoom, insertChannel,
    insertRole, insertServer, insertServerMember, io, listChannelsForServer,
    listServerMembersSerialized, listServersForUser, path, removeFileSafe, removeRoleFromMember,
    selectChannelById, selectRoleById, selectServerById, selectServerMember, serializeChannel,
    serializeServerEntity, server, updateServerProfile, updateServerSettingsRecord, uploadsDir
  } = context;

app.get('/api/servers', ensureAuthenticated, (req, res) => {
  const rows = listServersForUser.all(req.user.id);
  const servers = rows.map((server) => serializeServerEntity(server, req.user.id)).filter(Boolean);
  res.json({ servers });
});

app.post('/api/servers', ensureAuthenticated, (req, res) => {
  const { name, description } = req.body || {};
  const trimmedName = (name || '').trim();
  if (trimmedName.length < 3 || trimmedName.length > 48) {
    return res.status(400).json({ message: 'Server name must be between 3 and 48 characters.' });
  }
  const safeDescription = (description || '').trim().slice(0, 240);
  try {
    const result = insertServer.run(req.user.id, trimmedName, '', safeDescription);
    insertServerMember.run(result.lastInsertRowid, req.user.id, 'owner', '');
    insertRole.run(result.lastInsertRowid, 'Owner', '#f97316', 1000, PERMISSIONS.ADMIN, 0);
    insertRole.run(
      result.lastInsertRowid,
      'Community',
      '#a78bfa',
      0,
      PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES | PERMISSIONS.CONNECT_VOICE | PERMISSIONS.SPEAK_VOICE | PERMISSIONS.STREAM,
      1
    );
    insertChannel.run(result.lastInsertRowid, 'text', 'general', 'Welcome to your server', 0);
    const server = selectServerById.get(result.lastInsertRowid);
    const payload = serializeServerEntity(server, req.user.id);
    broadcastServerUpdate(server.id);
    return res.status(201).json({ server: payload });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create server.', error: error.message });
  }
});

app.put('/api/servers/:serverId/profile', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  const { name, description, icon } = req.body || {};
  if (name && (name.length < 3 || name.length > 48)) {
    return res.status(400).json({ message: 'Server name must be between 3 and 48 characters.' });
  }
  try {
    ensureServerOwnership(serverId, req.user.id);
    const existing = selectServerById.get(serverId);
    updateServerProfile.run(
      name ? name.trim() : existing.name,
      description ? description.trim().slice(0, 240) : existing.description,
      icon ? icon.trim().slice(0, 512) : existing.icon,
      serverId
    );
    broadcastServerUpdate(serverId);
    const server = selectServerById.get(serverId);
    return res.json({ server: serializeServerEntity(server, req.user.id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.get('/api/servers/:serverId/members', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  try {
    ensureServerMembership(serverId, req.user.id);
    const members = listServerMembersSerialized(serverId);
    return res.json({ members });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/api/servers/:serverId/members/:memberId/roles', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const memberId = Number(req.params.memberId);
  if (!Number.isFinite(serverId) || !Number.isFinite(memberId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  const { roleId, action } = req.body || {};
  if (!Number.isFinite(roleId) || !['assign', 'remove'].includes(action)) {
    return res.status(400).json({ message: 'Invalid payload.' });
  }
  const targetRole = selectRoleById.get(roleId);
  if (!targetRole || targetRole.server_id !== serverId) {
    return res.status(404).json({ message: 'Role not found.' });
  }
  const targetMember = selectServerMember.get(serverId, memberId);
  if (!targetMember) {
    return res.status(404).json({ message: 'Member not found.' });
  }
  try {
    ensurePermission(serverId, req.user.id, PERMISSIONS.MANAGE_ROLES);
    if (action === 'assign') {
      assignRoleToMember.run(serverId, roleId, memberId);
    } else {
      removeRoleFromMember.run(serverId, roleId, memberId);
    }
    broadcastServerUpdate(serverId);
    const members = listServerMembersSerialized(serverId);
    return res.json({ members });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.get('/api/servers/:serverId', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  try {
    const { server } = ensureServerMembership(serverId, req.user.id);
    return res.json({ server: serializeServerEntity(server, req.user.id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.get('/api/servers/:serverId/channels', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  try {
    ensureServerMembership(serverId, req.user.id);
    const channels = listChannelsForServer.all(serverId).map(serializeChannel);
    return res.json({ channels });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/api/servers/:serverId/leave', ensureAuthenticated, friendActionLimiter, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isInteger(serverId)) return res.status(400).json({ message: 'Некорректный идентификатор пространства.' });
  const server = selectServerById.get(serverId);
  if (!server || !selectServerMember.get(serverId, req.user.id)) {
    return res.status(404).json({ message: 'Вы не состоите в этом пространстве.' });
  }
  if (server.owner_id === req.user.id) {
    return res.status(400).json({ message: 'Владелец не может покинуть своё пространство. Передайте владение или удалите его в будущем.' });
  }
  try {
    const leaveTransaction = db.transaction(() => {
      db.prepare('DELETE FROM voice_sessions WHERE server_id = ? AND user_id = ?').run(serverId, req.user.id);
      db.prepare('DELETE FROM server_member_roles WHERE server_id = ? AND user_id = ?').run(serverId, req.user.id);
      db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, req.user.id);
    });
    leaveTransaction();
    io.to(getUserRoom(req.user.id)).emit('server:leave', { serverId });
    broadcastServerUpdate(serverId);
    return res.json({ left: true, serverId });
  } catch (error) {
    console.error('Leave server failed:', error);
    return res.status(500).json({ message: 'Не удалось покинуть пространство.' });
  }
});

app.post('/api/servers/:serverId/channels', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  const { name, type = 'text', topic = '' } = req.body || {};
  const normalizedType = ['text', 'voice'].includes(type) ? type : 'text';
  const trimmedName = (name || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  if (trimmedName.length < 3 || trimmedName.length > 32) {
    return res.status(400).json({ message: 'Channel name must be 3-32 characters.' });
  }
  try {
    ensureServerOwnership(serverId, req.user.id);
    const existingCount = listChannelsForServer.all(serverId).length;
    const created = insertChannel.run(serverId, normalizedType, trimmedName, topic.slice(0, 240), existingCount);
    const requestedLimit = Number(req.body?.userLimit);
    const userLimit = Number.isInteger(requestedLimit) ? Math.min(8, Math.max(2, requestedLimit)) : 8;
    if (normalizedType === 'voice') db.prepare('UPDATE channels SET user_limit = ? WHERE id = ?').run(userLimit, created.lastInsertRowid);
    broadcastServerUpdate(serverId);
    const server = selectServerById.get(serverId);
    return res.status(201).json({ server: serializeServerEntity(server, req.user.id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.delete('/api/servers/:serverId/channels/:channelId', ensureAuthenticated, friendActionLimiter, async (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isInteger(serverId) || !Number.isInteger(channelId)) {
    return res.status(400).json({ message: 'Некорректный идентификатор канала.' });
  }
  const channel = selectChannelById.get(channelId);
  if (!channel || channel.server_id !== serverId) return res.status(404).json({ message: 'Канал не найден.' });
  try { ensureServerOwnership(serverId, req.user.id); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
  const attachments = db.prepare('SELECT path FROM server_attachments WHERE channel_id = ?').all(channelId);
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM message_reactions WHERE scope = 'channel' AND message_id IN (SELECT id FROM server_messages WHERE channel_id = ?)").run(channelId);
      db.prepare("DELETE FROM message_pins WHERE scope = 'channel' AND channel_id = ?").run(channelId);
      db.prepare('DELETE FROM server_attachments WHERE channel_id = ?').run(channelId);
      db.prepare('DELETE FROM server_messages WHERE channel_id = ?').run(channelId);
      db.prepare('DELETE FROM channel_read_states WHERE channel_id = ?').run(channelId);
      db.prepare('DELETE FROM voice_sessions WHERE channel_id = ?').run(channelId);
      db.prepare('DELETE FROM channel_permission_overrides WHERE channel_id = ?').run(channelId);
      db.prepare('DELETE FROM channels WHERE id = ? AND server_id = ?').run(channelId, serverId);
    })();
    await Promise.all(attachments.map((attachment) => removeFileSafe(path.join(uploadsDir, attachment.path))));
    io.to(getChannelRoom(channelId)).emit('channel:deleted', { serverId, channelId });
    broadcastServerUpdate(serverId);
    return res.json({ deleted: true, channelId });
  } catch (error) {
    console.error('Channel deletion failed:', error);
    return res.status(500).json({ message: 'Не удалось удалить канал.' });
  }
});

app.put('/api/servers/:serverId/channels/:channelId', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  const channel = selectChannelById.get(channelId);
  if (!channel || channel.server_id !== serverId) {
    return res.status(404).json({ message: 'Channel not found.' });
  }
  try {
    ensureServerOwnership(serverId, req.user.id);
    const payload = req.body || {};
    const slowMode = Math.max(0, Math.min(21600, Number(payload.slow_mode_seconds) || 0));
    const isNsfw = payload.is_nsfw ? 1 : 0;
    const bitrate = channel.type === 'voice' ? Math.max(8000, Math.min(384000, Number(payload.bitrate) || channel.bitrate || 64000)) : channel.bitrate;
    const userLimit =
      channel.type === 'voice' ? Math.max(0, Math.min(99, Number(payload.user_limit) || channel.user_limit || 0)) : channel.user_limit;
    const soundscape = (payload.soundscape || channel.soundscape || '').slice(0, 120);
    const topic = payload.topic !== undefined ? String(payload.topic).slice(0, 256) : channel.topic;
    let name = channel.name;
    if (payload.name !== undefined) {
      name = String(payload.name).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      if (name.length < 3 || name.length > 32) return res.status(400).json({ message: 'Имя канала должно содержать от 3 до 32 символов (латиница, цифры и дефис).' });
    }
    const update = db.prepare(`
      UPDATE channels
      SET name = ?, topic = ?, slow_mode_seconds = ?, is_nsfw = ?, bitrate = ?, user_limit = ?, soundscape = ?
      WHERE id = ?
    `);
    update.run(name, topic, slowMode, isNsfw, bitrate, userLimit, soundscape, channelId);
    broadcastServerUpdate(serverId);
    const updated = selectChannelById.get(channelId);
    return res.json({ channel: serializeChannel(updated) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.get('/api/servers/:serverId/settings', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  try {
    ensureServerMembership(serverId, req.user.id);
    return res.json({ settings: getServerSettings(serverId) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.put('/api/servers/:serverId/settings', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  try {
    ensureServerOwnership(serverId, req.user.id);
    const settings = updateServerSettingsRecord(serverId, req.body || {});
    return res.json({ settings });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});
}

module.exports = { register };
