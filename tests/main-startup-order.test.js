'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Electron migrates user data, checks updates and waits for server readiness before the main window', () => {
  const mainDirectory = path.join(__dirname, '..', 'src', 'main');
  const mainSource = fs.readFileSync(path.join(mainDirectory, 'index.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(mainDirectory, 'server-process.js'), 'utf8');
  const ready = mainSource.indexOf('app.whenReady().then(async () => {');
  const wait = mainSource.indexOf('await serverService.waitForServer();');
  const positions = [
    mainSource.indexOf('const SERVER_PORT ='),
    mainSource.indexOf('const SERVER_URL ='),
    mainSource.indexOf('const serverService = createServerProcessService('),
    ready,
    mainSource.indexOf("app.setPath('userData', migrateLegacyUserData(", ready),
    mainSource.indexOf('createSplashWindow();', ready),
    mainSource.indexOf('const startupUpdateTask = checkForUpdates(', ready),
    mainSource.indexOf('serverService.startServer();', ready),
    wait,
    mainSource.indexOf('serverService.markReady();', wait),
    mainSource.indexOf('    createWindow();', wait)
  ];
  assert.ok(positions.every((position) => position >= 0), 'all startup stages must be present');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b),
    'profile migration, splash, update check, server readiness and main window must run in order');
  assert.match(serviceSource, /createServerReadiness/);
  assert.match(serviceSource, /waitForServer,/);
});
