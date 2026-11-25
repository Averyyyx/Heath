'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPasswordPolicy } = require('./password-policy');

test('password policy forwards the account identifier to the strength scorer', () => {
  let receivedInputs;
  const policy = createPasswordPolicy({
    minimumScore: 3,
    scorer: (_password, inputs) => {
      receivedInputs = inputs;
      return { score: 4 };
    }
  });
  policy.validatePasswordStrength('A strong passphrase!', 'user@example.com');
  assert.deepEqual(receivedInputs, ['user@example.com']);
});

test('password policy rejects scores below the configured threshold', () => {
  const policy = createPasswordPolicy({ minimumScore: 3, scorer: () => ({ score: 2 }) });
  assert.throws(() => policy.validatePasswordStrength('weak'), (error) => error.statusCode === 400);
});

test('password policy accepts a score at the configured threshold', () => {
  const policy = createPasswordPolicy({ minimumScore: 3, scorer: () => ({ score: 3 }) });
  assert.doesNotThrow(() => policy.validatePasswordStrength('adequate'));
});
