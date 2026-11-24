'use strict';

function register(context) {
  const {
    PERMISSIONS, app, broadcastVoiceState, db, deleteVoiceSession,
    ensureAuthenticated, ensureChannelAccess, getChannelRoom, hasPermission, io,
    listVoiceParticipants, session, upsertVoiceSession
  } = context;

app.get('/api/servers/:serverId/channels/:channelId/voice', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  try {
    const { channel, permissions } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (channel.type !== 'voice') {
      return res.status(400).json({ message: 'Channel is not voice.' });
    }
    if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL)) {
      return res.status(403).json({ message: 'Missing permission to view this voice channel.' });
    }
    return res.json({
      participants: listVoiceParticipants(channelId),
      canConnect: hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.CONNECT_VOICE),
      canSpeak: hasPermission(permissions, PERMISSIONS.SPEAK_VOICE),
      canStream: hasPermission(permissions, PERMISSIONS.STREAM)
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/api/servers/:serverId/channels/:channelId/voice/join', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  try {
    const { channel, permissions } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (channel.type !== 'voice') {
      return res.status(400).json({ message: 'Channel is not voice.' });
    }
    if (!hasPermission(permissions, PERMISSIONS.CONNECT_VOICE)) {
      return res.status(403).json({ message: 'Missing permission to connect to this channel.' });
    }
    const currentSession = db.prepare('SELECT channel_id FROM voice_sessions WHERE user_id = ?').get(req.user.id);
    if (currentSession && currentSession.channel_id !== channelId) {
      return res.status(409).json({ message: 'Вы уже подключены к другому голосовому каналу. Сначала выйдите из него.' });
    }
    const participantCount = db.prepare('SELECT COUNT(*) AS count FROM voice_sessions WHERE channel_id = ?').get(channelId).count;
    const userLimit = Math.max(1, Number(channel.user_limit) || 8);
    if (!currentSession && participantCount >= userLimit) {
      return res.status(409).json({ message: 'В голосовом канале нет свободных мест.' });
    }
    const canSpeak = hasPermission(permissions, PERMISSIONS.SPEAK_VOICE);
    const muted = !canSpeak || Boolean(req.body?.muted);
    upsertVoiceSession.run(serverId, channelId, req.user.id, muted ? 1 : 0, req.body?.deafened ? 1 : 0);
    broadcastVoiceState(channelId);
    return res.json({ participants: listVoiceParticipants(channelId), canSpeak });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.patch('/api/servers/:serverId/channels/:channelId/voice/state', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isInteger(serverId) || !Number.isInteger(channelId)) return res.status(400).json({ message: 'Некорректный голосовой канал.' });
  try {
    const { channel, permissions } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (channel.type !== 'voice') return res.status(400).json({ message: 'Канал не является голосовым.' });
    const session = db.prepare('SELECT id FROM voice_sessions WHERE channel_id = ? AND user_id = ?').get(channelId, req.user.id);
    if (!session) return res.status(409).json({ message: 'Вы не подключены к этому голосовому каналу.' });
    const requestedMuted = Boolean(req.body?.muted);
    if (!requestedMuted && !hasPermission(permissions, PERMISSIONS.SPEAK_VOICE)) {
      return res.status(403).json({ message: 'У вас нет права говорить в этом канале.' });
    }
    db.prepare('UPDATE voice_sessions SET muted = ?, deafened = ? WHERE channel_id = ? AND user_id = ?')
      .run(requestedMuted ? 1 : 0, req.body?.deafened ? 1 : 0, channelId, req.user.id);
    broadcastVoiceState(channelId);
    return res.json({ participants: listVoiceParticipants(channelId) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.post('/api/servers/:serverId/channels/:channelId/voice/leave', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const channelId = Number(req.params.channelId);
  if (!Number.isFinite(serverId) || !Number.isFinite(channelId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  try {
    const { channel } = ensureChannelAccess(serverId, channelId, req.user.id);
    if (channel.type !== 'voice') {
      return res.status(400).json({ message: 'Channel is not voice.' });
    }
    deleteVoiceSession.run(channelId, req.user.id);
    io.to(getChannelRoom(channelId)).emit('voice:left', { channelId, userId: req.user.id });
    broadcastVoiceState(channelId);
    return res.json({ participants: listVoiceParticipants(channelId) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});
}

module.exports = { register };
