const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', 'client/src/components/MessengerWorkspace.tsx'), 'utf8');

test('group DM calls accept up to six members and track the accepted mesh', () => {
  assert.match(server, /participants\.length\s*>\s*6/);
  assert.match(server, /activeCallParticipants\.set\(Number\(conversationId\)/);
  assert.match(server, /acceptedParticipants:\s*\[\.\.\.call\.accepted\]/);
  assert.doesNotMatch(server, /Групповые звонки до четырёх участников ещё проходят разработку/);
  assert.match(server, /call\.declined\.size\s*>=\s*call\.invited\.size\s*-\s*1/);
});

test('group DM WebRTC signaling is addressed to a single accepted participant', () => {
  assert.match(server, /socket\.on\('call:signal',\s*\(\{\s*conversationId,\s*to,\s*payload\s*\}\)/);
  assert.match(server, /call\.accepted\.has\(socket\.user\.id\).*call\.accepted\.has\(targetId\)/s);
  assert.match(server, /io\.to\(getUserRoom\(targetId\)\)\.emit\('call:signal'/);
  assert.match(client, /socketRef\.current\?\.emit\('call:signal',\s*\{\s*conversationId,\s*to:\s*remoteId,\s*payload\s*\}\)/);
});

test('one-to-one calls address the peer and reflect the received remote stream', () => {
  assert.match(client, /const peerUserId = conversation\?\.participants\?\.find/);
  assert.match(client, /emit\('call:signal', \{ conversationId, to: peerUserId, payload \}\)/);
  assert.match(client, /\{state\.group \? groupUsers\.map/);
});

test('every accepted group participant creates one deterministic peer per other participant', () => {
  assert.match(client, /function ensureGroupPeers\(conversationId: number, acceptedUserIds: number\[\]\)/);
  assert.match(client, /initiator:\s*user\.id\s*<\s*remoteId/);
  assert.match(client, /acceptedUserIds\s*\|\|\s*\[\]\)\.filter/);
  assert.match(client, /pendingGroupSignalsRef/);
  assert.match(server, /call:participant-left/);
  assert.match(client, /socket\.on\('call:participant-left'/);
  assert.match(client, /current\.group\s*\?\s*Object\.values\(current\.peers\s*\|\|\s*\{\}\)/);
});
