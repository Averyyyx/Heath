'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeUser } = require('./users');

test('sanitized users never expose password hashes or two-factor secrets', () => {
  const user = {
    id: 7,
    username: 'yuna',
    password_hash: 'private-hash',
    twofa_secret: 'private-secret',
    twofa_enabled: 1
  };
  assert.deepEqual(sanitizeUser(user), { id: 7, username: 'yuna', twofa_enabled: 1 });
  assert.equal(sanitizeUser(null), null);
});
