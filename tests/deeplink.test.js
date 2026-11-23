'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHearthDeepLink } = require('../src/main/lib/deeplink');

test('parses valid personal conversation message links', () => {
  assert.deepEqual(parseHearthDeepLink('hearth://dm/123/message/456'), {
    type: 'dm', conversationId: 123, messageId: 456
  });
});

test('parses valid server channel message links', () => {
  assert.deepEqual(parseHearthDeepLink('hearth://channel/12/34/message/56'), {
    type: 'channel', serverId: 12, channelId: 34, messageId: 56
  });
});

test('parses conversation-only links for incoming calls', () => {
  assert.deepEqual(parseHearthDeepLink('hearth://dm/321'), { type: 'dm', conversationId: 321 });
  assert.deepEqual(parseHearthDeepLink('hearth://channel/12/34'), { type: 'channel', serverId: 12, channelId: 34 });
});

test('rejects malformed and foreign deep links', () => {
  assert.equal(parseHearthDeepLink('https://example.com/dm/1/message/2'), null);
  assert.equal(parseHearthDeepLink('hearth://dm/nope/message/2'), null);
  assert.equal(parseHearthDeepLink('hearth://channel/1/x/message/2'), null);
  assert.equal(parseHearthDeepLink('not a url'), null);
});

