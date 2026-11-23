'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setupLogging } = require('./logging');

test('logging service creates the log directory and writes console messages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-logs-'));
  const messages = [];
  const consoleRef = {
    log: (...args) => messages.push(args.join(' ')),
    error: (...args) => messages.push('ERROR ' + args.join(' '))
  };
  try {
    const result = setupLogging({
      app: { getPath: () => root, getAppPath: () => root },
      fs,
      path,
      consoleRef,
      processRef: { pid: 10, execPath: '/hearth' }
    });
    consoleRef.log('hello', 'hearth');
    consoleRef.error('failure');
    const log = fs.readFileSync(result.logFile, 'utf8');
    assert.match(log, /hello hearth/);
    assert.match(log, /ERROR: failure/);
    assert.equal(fs.existsSync(result.logDir), true);
    assert.ok(messages.some((message) => message.includes('Hearth Electron Process Starting')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
