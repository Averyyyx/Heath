'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidEmail } = require('../src/shared/email-validation');

test('email validation accepts normal and plus-addressed emails', () => {
  assert.equal(isValidEmail('real@example.com'), true);
  assert.equal(isValidEmail('a.b+c@sub.mail.ru'), true);
});

test('email validation rejects malformed addresses', () => {
  assert.equal(isValidEmail('abc'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('a b@c.d'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('a'.repeat(250) + '@example.com'), false);
});
