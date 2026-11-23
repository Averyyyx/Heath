'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Electron constructs the server service after its URL and waits for readiness before opening the main window', () => {
  const projectRoot = path.join(__dirname, '..');
  const mainSource = fs.readFileSync(path.join(projectRoot, 'index.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(projectRoot, 'server-process.js'), 'utf8');

  const positions = [
    mainSource.indexOf('const SERVER_PORT ='),
    mainSource.indexOf('const SERVER_URL ='),
    mainSource.indexOf("const { createServerProcessService } = require('./server-process');"),
    mainSource.indexOf('const serverService = createServerProcessService('),
    mainSource.indexOf('const gotSingleInstanceLock ='),
    mainSource.indexOf('app.whenReady().then(async () => {'),
    mainSource.indexOf('serverService.startServer();'),
    mainSource.indexOf('await serverService.waitForServer();'),
    mainSource.indexOf('    createWindow();', mainSource.indexOf('await serverService.waitForServer();'))
  ];
  assert.ok(positions.every((position) => position >= 0), 'all server startup stages must exist');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b),
    'the server URL and service must exist before startup; the main window opens after server readiness');
  assert.match(serviceSource, /createServerReadiness/);
  assert.match(serviceSource, /waitForServer,/);
});
