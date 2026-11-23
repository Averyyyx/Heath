'use strict';

function registerConversationRoutes({ app, ensureAuthenticated, listConversationsForUser, serializeConversation, normalizeHandle, selectUserByUsername, ensureFriends, selectConversationBetween, insertConversation, insertParticipant, selectConversationById, broadcastConversationUpdate }) {
  app.get('/api/conversations', ensureAuthenticated, (req, res) => {
    const rows = listConversationsForUser.all(req.user.id);
    const conversations = rows
      .map((conversation) => serializeConversation(conversation, req.user.id))
      .filter(Boolean);
    res.json({ conversations });
  });
  
  app.post('/api/conversations/dm', ensureAuthenticated, (req, res) => {
    const { username } = req.body;
    const normalizedHandle = normalizeHandle(username);
    if (!normalizedHandle) {
      return res.status(400).json({ message: 'Username is required.' });
    }
    const target = selectUserByUsername.get(normalizedHandle);
    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot create DM with yourself.' });
    }
    if (!ensureFriends(req.user.id, target.id)) {
      return res.status(403).json({ message: 'Only friends can start DMs.' });
    }
  
    let conversation = selectConversationBetween.get(req.user.id, target.id);
    if (!conversation) {
      const result = insertConversation.run('dm', null);
      insertParticipant.run(result.lastInsertRowid, req.user.id, 'owner');
      insertParticipant.run(result.lastInsertRowid, target.id, 'member');
      conversation = selectConversationById.get(result.lastInsertRowid);
      broadcastConversationUpdate(conversation.id);
    }
  
    const payload = serializeConversation(conversation, req.user.id);
    res.status(201).json({ conversation: payload });
  });
}

module.exports = { registerConversationRoutes };
