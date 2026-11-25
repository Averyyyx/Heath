'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServerDomainServices } = require('../src/server/services/server-domain');

function createService(state) {
  const fallback = () => {};
  const dependencies = new Proxy({
    selectServerById: { get: (id) => state.servers.get(id) || null },
    selectServerMember: { get: (serverId, userId) => state.members.get(serverId + ':' + userId) || null },
    selectConversationById: { get: (id) => state.conversations.get(id) || null },
    selectParticipant: { get: (conversationId, userId) => state.participants.get(conversationId + ':' + userId) || null },
    selectFriendshipBetween: { get: () => state.friendship || null }
  }, {
    get(target, property) { return property in target ? target[property] : fallback; }
  });
  return createServerDomainServices(dependencies);
}

test('the domain service leaves HTTP route registration in the server entry point', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const entry = fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'index.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'services', 'server-domain.js'), 'utf8');
  assert.match(entry, /app\.get\('\/api\/security\/csrf-token'/);
  assert.doesNotMatch(service, /app\.get\(/);
});

test('server-domain membership checks distinguish missing servers and non-members', () => {
  const server = { id: 7, owner_id: 3 };
  const membership = { server_id: 7, user_id: 3 };
  const state = {
    servers: new Map([[7, server]]),
    members: new Map([['7:3', membership]]),
    conversations: new Map(),
    participants: new Map()
  };
  const service = createService(state);
  assert.deepEqual(service.ensureServerMembership(7, 3), { server, membership });
  assert.throws(() => service.ensureServerMembership(99, 3),
    (error) => error.statusCode === 404 && error.message === 'Server not found');
  assert.throws(() => service.ensureServerMembership(7, 4),
    (error) => error.statusCode === 403 && error.message === 'Forbidden');
});

test('conversation access checks membership and exposes stable room names', () => {
  const conversation = { id: 12, type: 'dm' };
  const state = {
    servers: new Map(),
    members: new Map(),
    conversations: new Map([[12, conversation]]),
    participants: new Map([['12:3', { conversation_id: 12, user_id: 3 }]])
  };
  const service = createService(state);
  assert.equal(service.ensureConversationAccess(12, 3), conversation);
  assert.throws(() => service.ensureConversationAccess(13, 3), (error) => error.statusCode === 404);
  assert.throws(() => service.ensureConversationAccess(12, 4), (error) => error.statusCode === 403);
  assert.equal(service.getConversationRoom(12), 'conversation:12');
  assert.equal(service.getUserRoom(3), 'user:3');
  assert.equal(service.getServerRoom(7), 'server:7');
  assert.equal(service.getChannelRoom(8), 'channel:8');
});

test('friend helper only returns true for an accepted friendship', () => {
  const state = { servers: new Map(), members: new Map(), conversations: new Map(), participants: new Map(), friendship: { status: 'accepted' } };
  const service = createService(state);
  assert.equal(service.ensureFriends(3, 4), true);
  state.friendship = { status: 'pending' };
  assert.equal(service.ensureFriends(3, 4), false);
});
