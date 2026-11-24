'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modules = [
  ['server-management', require('../src/server/routes/server-management')],
  ['server-messages', require('../src/server/routes/server-messages')],
  ['server-voice', require('../src/server/routes/server-voice')],
  ['premium', require('../src/server/routes/premium')],
  ['server-message-moderation', require('../src/server/routes/server-message-moderation')],
  ['conversation-messages', require('../src/server/routes/conversation-messages')],
  ['auth-session', require('../src/server/routes/auth-session')]
];

const expectedRoutes = [
  [
    "GET",
    "/api/servers"
  ],
  [
    "POST",
    "/api/servers"
  ],
  [
    "PUT",
    "/api/servers/:serverId/profile"
  ],
  [
    "GET",
    "/api/servers/:serverId/members"
  ],
  [
    "POST",
    "/api/servers/:serverId/members/:memberId/roles"
  ],
  [
    "GET",
    "/api/servers/:serverId"
  ],
  [
    "GET",
    "/api/servers/:serverId/channels"
  ],
  [
    "POST",
    "/api/servers/:serverId/leave"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels"
  ],
  [
    "DELETE",
    "/api/servers/:serverId/channels/:channelId"
  ],
  [
    "PUT",
    "/api/servers/:serverId/channels/:channelId"
  ],
  [
    "GET",
    "/api/servers/:serverId/settings"
  ],
  [
    "PUT",
    "/api/servers/:serverId/settings"
  ],
  [
    "GET",
    "/api/servers/:serverId/channels/:channelId/messages"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels/:channelId/read"
  ],
  [
    "GET",
    "/api/servers/:serverId/channels/:channelId/pins"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels/:channelId/messages/:messageId/pin"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels/:channelId/messages/:messageId/reactions"
  ],
  [
    "PATCH",
    "/api/servers/:serverId/channels/:channelId/messages/:messageId"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels/:channelId/messages"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels/:channelId/permissions"
  ],
  [
    "DELETE",
    "/api/servers/:serverId/channels/:channelId/permissions"
  ],
  [
    "GET",
    "/api/servers/:serverId/channels/:channelId/files/:attachmentId"
  ],
  [
    "GET",
    "/api/servers/:serverId/channels/:channelId/voice"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels/:channelId/voice/join"
  ],
  [
    "PATCH",
    "/api/servers/:serverId/channels/:channelId/voice/state"
  ],
  [
    "POST",
    "/api/servers/:serverId/channels/:channelId/voice/leave"
  ],
  [
    "GET",
    "/api/premium/plans"
  ],
  [
    "GET",
    "/api/premium/status"
  ],
  [
    "POST",
    "/api/premium/checkout"
  ],
  [
    "POST",
    "/api/premium/confirm"
  ],
  [
    "GET",
    "/api/admin/premium/balance"
  ],
  [
    "DELETE",
    "/api/servers/:serverId/channels/:channelId/messages/:messageId"
  ],
  [
    "GET",
    "/api/conversations/:id/messages"
  ],
  [
    "POST",
    "/api/conversations/:id/delivered"
  ],
  [
    "PATCH",
    "/api/conversations/:id/messages/:messageId"
  ],
  [
    "GET",
    "/api/conversations/:id/pins"
  ],
  [
    "POST",
    "/api/conversations/:id/messages/:messageId/pin"
  ],
  [
    "POST",
    "/api/conversations/:id/messages/:messageId/reactions"
  ],
  [
    "POST",
    "/api/conversations/:id/read"
  ],
  [
    "DELETE",
    "/api/conversations/:id/messages/:messageId"
  ],
  [
    "GET",
    "/api/files/:conversationId/:attachmentId"
  ],
  [
    "POST",
    "/api/conversations/:id/messages"
  ],
  [
    "POST",
    "/api/auth/logout"
  ],
  [
    "GET",
    "/api/auth/providers"
  ],
  [
    "GET",
    "/api/auth/session"
  ],
  [
    "GET",
    "/api/auth/status"
  ],
  [
    "GET",
    "/api/auth/github"
  ],
  [
    "GET",
    "/api/auth/github/callback"
  ]
];

test('extracted route modules register the original 49 HTTP endpoints in order', () => {
  const registrations = [];
  const app = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options']) {
    app[method] = (route) => registrations.push([method.toUpperCase(), route]);
  }
  const context = new Proxy({ app, upload: { single: () => () => {} } }, {
    get(target, property) {
      if (property in target) return target[property];
      return () => {};
    }
  });

  for (const [name, module] of modules) {
    assert.equal(typeof module.register, 'function', name + ' must export register(context)');
    module.register(context);
  }

  assert.deepEqual(registrations, expectedRoutes);

  const serverEntry = fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'index.js'), 'utf8');
  const registrationPositions = modules.map(([name]) =>
    serverEntry.indexOf(`require('./routes/${name}').register(routeContext);`)
  );
  assert.ok(registrationPositions.every((position) => position >= 0),
    'every extracted route module must be registered by the server entry point');
  assert.deepEqual(registrationPositions, [...registrationPositions].sort((a, b) => a - b),
    'route modules must be registered in their original order');
});
