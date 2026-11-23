'use strict';

function registerFriendRoutes({ app, ensureAuthenticated, friendActionLimiter, listFriendships, hydrateFriendship, normalizeHandle, selectUserByUsername, selectFriendshipBetween, insertFriendRequest, selectFriendshipById, updateFriendStatus, deleteFriendship }) {
  app.get('/api/friends', ensureAuthenticated, (req, res) => {
    const rows = listFriendships.all(req.user.id, req.user.id);
    const hydrated = rows.map((row) => hydrateFriendship(row, req.user.id)).filter(Boolean);
  
    const response = {
      incoming: hydrated.filter((item) => item.status === 'pending' && item.direction === 'incoming'),
      outgoing: hydrated.filter((item) => item.status === 'pending' && item.direction === 'outgoing'),
      friends: hydrated.filter((item) => item.status === 'accepted')
    };
  
    res.json(response);
  });
  
  app.post('/api/friends/request', ensureAuthenticated, friendActionLimiter, (req, res) => {
    const { username } = req.body;
    const targetHandle = normalizeHandle(username);
  
    if (!targetHandle) {
      return res.status(400).json({ message: 'Username is required.' });
    }
  
    const target = selectUserByUsername.get(targetHandle);
    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }
  
    if (target.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot add yourself.' });
    }
  
    const existing = selectFriendshipBetween.get(req.user.id, target.id, target.id, req.user.id);
    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(409).json({ message: 'You are already friends.' });
      }
      return res.status(409).json({ message: 'Friend request already exists.' });
    }
  
    try {
      const result = insertFriendRequest.run(req.user.id, target.id, 'pending');
      const created = hydrateFriendship(selectFriendshipById.get(result.lastInsertRowid), req.user.id);
      return res.status(201).json({ request: created });
    } catch (error) {
      return res.status(500).json({ message: 'Failed to send friend request.', error: error.message });
    }
  });
  
  app.post('/api/friends/respond', ensureAuthenticated, friendActionLimiter, (req, res) => {
    const { requestId, action } = req.body;
    const request = selectFriendshipById.get(requestId);
  
    if (!request || request.addressee_id !== req.user.id) {
      return res.status(404).json({ message: 'Friend request not found.' });
    }
  
    if (action === 'accept') {
      updateFriendStatus.run('accepted', requestId);
      const updated = hydrateFriendship(selectFriendshipById.get(requestId), req.user.id);
      return res.json({ friend: updated });
    }
  
    if (action === 'decline') {
      deleteFriendship.run(requestId);
      return res.json({ declined: true });
    }
  
    return res.status(400).json({ message: 'Unsupported action.' });
  });
}

module.exports = { registerFriendRoutes };
