'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Electron initializes server readiness only after its URL and factory exist', () => {
  const mainPath = path.join(__dirname, '..', 'main.js');
  const source = fs.readFileSync(mainPath, 'utf8');
  const positions = [
    source.indexOf('const SERVER_PORT ='),
    source.indexOf('const SERVER_URL ='),
    source.indexOf("const { createServerReadiness } = require('./lib/server-readiness');"),
    source.indexOf('const { waitForServer } = createServerReadiness(')
  ];
  assert.ok(positions.every((position) => position >= 0), 'all server startup declarations must exist');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b),
    'SERVER_PORT, SERVER_URL, and createServerReadiness must be initialized before calling the factory');
});
