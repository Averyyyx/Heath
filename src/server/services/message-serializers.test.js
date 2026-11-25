'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageSerializers } = require('./message-serializers');

function createSerializers() {
  const users = [
    { id: 1, username: 'one', display_name: 'One', password_hash: 'secret' },
    { id: 2, username: 'two', display_name: 'Two', twofa_secret: 'secret' }
  ];
  const serializers = createMessageSerializers({
    db: { prepare: (sql) => ({ get: (id) => ({ id, content: 'reply', author_id: 2, username: 'two', display_name: 'Two' }) }) },
    selectMessagePin: { get: () => null },
    listMessageReactions: { all: () => [{ emoji: '👍', count: '2', user_ids: '1,2' }] },
    selectMessageDeliverySummary: { get: () => ({ delivered_count: '1', recipient_count: '2' }) },
    selectChannelMessageReadReceipt: { get: () => ({ read_count: '2', member_count: '3' }) },
    selectParticipants: { all: () => users },
    selectLastMessageForConversation: { get: () => null },
    sanitizeUser: (user) => {
      if (!user) return null;
      const { password_hash, twofa_secret, ...safe } = user;
      return safe;
    },
    serializeAttachment: (raw) => raw ? JSON.parse(raw) : null
  });
  return serializers;
}

test('message serializers normalize reactions, delivery and reply metadata', () => {
  const serializers = createSerializers();
  const result = serializers.serializeMessage({
    id: 10, conversation_id: 4, author_id: 1, username: 'one', display_name: 'One',
    content: 'hello', attachment: null, created_at: '2026-01-01', reply_to_message_id: 9
  });
  assert.deepEqual(result.reactions, [{ emoji: '👍', count: 2, user_ids: [1, 2] }]);
  assert.deepEqual(result.delivery, { delivered_count: 1, recipient_count: 2 });
  assert.equal(result.reply_to.id, 9);
  assert.equal(result.reply_to.content, 'reply');
});

test('conversation serialization strips private user fields', () => {
  const serializers = createSerializers();
  const result = serializers.serializeConversation({ id: 4, type: 'dm', updated_at: 'now' }, 1);
  assert.equal(result.counterpart.id, 2);
  assert.equal('password_hash' in result.participants[0], false);
  assert.equal('twofa_secret' in result.participants[1], false);
});
