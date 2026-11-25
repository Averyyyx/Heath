const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = [
  fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'index.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'realtime', 'calls.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'realtime', 'voice.js'), 'utf8')
].join('\\n');
const client = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/components/MessengerWorkspace.tsx'), 'utf8');
const callOverlay = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/components/messenger/CallOverlay.tsx'), 'utf8');
const clientUi = client + '\\n' + callOverlay;
const realtime = ['calls.js', 'voice.js'].map((name) => fs.readFileSync(path.join(__dirname, '..', 'src/server/realtime', name), 'utf8')).join('\n');

test('group DM calls accept up to six members and track the accepted mesh', () => {
  assert.match(server, /participants\.length\s*>\s*6/);
  assert.match(server, /activeCallParticipants\.set\(Number\(conversationId\)/);
  assert.match(server, /acceptedParticipants:\s*\[\.\.\.call\.accepted\]/);
  assert.doesNotMatch(realtime, /Групповые звонки до четырёх участников ещё проходят разработку/);
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
  assert.match(client, /remoteStreams\?: Record<number, MediaStream>/);
});

test('every accepted group participant creates one deterministic peer per other participant', () => {
  assert.match(client, /function ensureGroupPeers\(conversationId: number, acceptedUserIds: number\[\]\)/);
  assert.match(client, /initiator:\s*user\.id\s*<\s*remoteId/);
  assert.match(client, /acceptedUserIds\s*\|\|\s*\[\]\)\.filter/);
  assert.match(client, /pendingGroupSignalsRef/);
  assert.match(realtime, /call:participant-left/);
  assert.match(client, /socket\.on\('call:participant-left'/);
  assert.match(client, /current\.group\s*\?\s*Object\.values\(current\.peers\s*\|\|\s*\{\}\)/);
});


test('one group invite timeout does not end an accepted mesh while other invites remain', () => {
  assert.match(server, /if \(call\.callerId === socket\.user\.id\)\s*\{[\s\S]*?call\.invited\.forEach/);
  assert.match(server, /if \(!call\.invited\.has\(socket\.user\.id\) \|\| call\.accepted\.has\(socket\.user\.id\)\) return/);
  assert.match(server, /call\.declined\.add\(socket\.user\.id\)/);
  assert.match(server, /!call\.invited\.has\(socket\.user\.id\) \|\| call\.declined\.has\(socket\.user\.id\)/);
  assert.match(server, /call\.accepted\.size === 1 && call\.declined\.size >= call\.invited\.size - 1/);
  assert.match(client, /const onCallTimeout = \(\{ conversationId \}/);
  assert.match(client, /current\?\.group && current\.conversationId === conversationId\) return/);
});
