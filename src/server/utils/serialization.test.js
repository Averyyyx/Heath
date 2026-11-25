'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeAttachment, normalizeBadges } = require('./serialization');

test('attachment serialization handles empty, valid and malformed payloads', () => {
  assert.equal(serializeAttachment(null), null);
  assert.deepEqual(serializeAttachment('{"name":"photo.png"}'), { name: 'photo.png' });
  assert.equal(serializeAttachment('{bad json'), null);
});

test('badge normalization only returns parsed arrays', () => {
  assert.deepEqual(normalizeBadges('["dev","premium"]'), ['dev', 'premium']);
  assert.deepEqual(normalizeBadges('{"badge":"dev"}'), []);
  assert.deepEqual(normalizeBadges('broken'), []);
  assert.deepEqual(normalizeBadges(null), []);
});
