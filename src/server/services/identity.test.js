'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createIdentityService } = require('./identity');

function serviceFor(existing = []) {
  const names = new Set(existing);
  return createIdentityService({
    selectUserByUsername: { get: (name) => names.has(name) ? { username: name } : undefined },
    now: () => 12345,
    random: () => 0
  });
}

test('normalizes handles and deterministically selects avatar colors', () => {
  const service = serviceFor();
  assert.equal(service.normalizeHandle('Yuna Example!'), 'yunaexample');
  assert.equal(service.normalizeHandle('a'.repeat(30)).length, 24);
  assert.equal(service.defaultAvatarColor('hearth'), service.defaultAvatarColor('HEARTH'));
});

test('generates unique handles without overwriting existing usernames', () => {
  const service = serviceFor(['yuna', 'yuna1']);
  assert.equal(service.generateUniqueHandle('Yuna'), 'yuna2');
  assert.equal(service.generateUniqueHandle('!!!'), 'user12345');
  assert.equal(service.generateHandleFromEmail('yuna@example.com'), 'yuna2');
});

test('generates four-digit discriminators', () => {
  assert.equal(serviceFor().randomDiscriminator(), '1000');
});
