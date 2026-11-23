'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureAuthenticated } = require('./auth');

test('authentication middleware passes authenticated requests through', () => {
  let called = false;
  ensureAuthenticated({ isAuthenticated: () => true }, {}, () => { called = true; });
  assert.equal(called, true);
});

test('authentication middleware returns a JSON 401 for anonymous requests', () => {
  let statusCode;
  let body;
  const response = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  ensureAuthenticated({}, response, () => assert.fail('next must not run'));
  assert.equal(statusCode, 401);
  assert.deepEqual(body, { message: 'Not authenticated.' });
});
