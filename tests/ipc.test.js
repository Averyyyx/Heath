'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createIpcService } = require('../src/main/ipc');

function fakeIpcMain() {
  const listeners = new Map();
  const handlers = new Map();
  return {
    listeners,
    handlers,
    on(name, callback) { listeners.set(name, callback); },
    handle(name, callback) { handlers.set(name, callback); }
  };
}

test('registers window, notification, update and logging IPC handlers', async () => {
  const ipcMain = fakeIpcMain();
  const sent = [];
  const windowCalls = [];
  const mainWindow = {
    webContents: { send: (...args) => sent.push(args) },
    minimize: () => windowCalls.push('minimize'),
    isMaximized: () => false,
    maximize: () => windowCalls.push('maximize'),
    unmaximize: () => windowCalls.push('unmaximize'),
    close: () => windowCalls.push('close'),
    isDestroyed: () => false,
    setTitleBarOverlay: (value) => windowCalls.push(value)
  };
  const notifications = [];
  let deepLink = null;
  let notificationCount = null;
  let preferences = null;
  let skipped = false;
  class Notification extends EventEmitter {
    constructor(options) { super(); this.options = options; notifications.push(this); }
    static isSupported() { return true; }
    show() { this.shown = true; }
  }
  const service = createIpcService({
    ipcMain,
    app: { getVersion: () => '0.0.9-alpha', getPath: () => '/profile' },
    getMainWindow: () => mainWindow,
    setNotificationCount: (value) => { notificationCount = value; },
    Notification,
    getDesktopIconPath: () => '/icons/hearth.ico',
    dispatchDeepLink: (value) => { deepLink = value; },
    checkForUpdates: async (value) => value,
    getUpdatePreferences: () => ({ autoDownload: true }),
    setUpdatePreferences: (value) => { preferences = value; },
    shell: { openPath: async () => '' },
    path,
    nativeTheme: { shouldUseDarkColors: true },
    skipUpdate: () => { skipped = true; }
  });

  service.setupIPCHandlers();
  ipcMain.listeners.get('set-notification-count')({}, 7);
  assert.equal(notificationCount, 7);
  assert.deepEqual(sent, [['notification-updated', 7]]);
  ipcMain.listeners.get('minimize-window')();
  ipcMain.listeners.get('maximize-window')();
  ipcMain.listeners.get('close-window')();
  assert.deepEqual(windowCalls.slice(0, 3), ['minimize', 'maximize', 'close']);
  ipcMain.listeners.get('set-window-theme')({}, 'system');
  assert.deepEqual(windowCalls[3], { color: '#262624', symbolColor: '#ECE9E3', height: 34 });
  ipcMain.listeners.get('skip-update')();
  assert.equal(skipped, true);

  assert.equal(await ipcMain.handlers.get('get-app-version')(), '0.0.9-alpha');
  assert.deepEqual(await ipcMain.handlers.get('get-update-preferences')(), { autoDownload: true });
  await ipcMain.listeners.get('set-update-preferences')({}, { autoDownload: false });
  assert.deepEqual(preferences, { autoDownload: false });
  assert.equal(await ipcMain.handlers.get('open-logs')(), true);
  assert.equal(await ipcMain.handlers.get('show-system-notification')({}, {
    title: 'Message',
    body: 'Hello',
    deepLink: 'hearth://conversation/1'
  }), true);
  assert.equal(notifications[0].shown, true);
  assert.equal(notifications[0].options.icon, '/icons/hearth.ico');
  notifications[0].emit('click');
  assert.equal(deepLink, 'hearth://conversation/1');
});

test('does not create notifications when desktop notifications are unsupported', () => {
  const ipcMain = fakeIpcMain();
  const service = createIpcService({
    ipcMain,
    app: {},
    getMainWindow: () => null,
    setNotificationCount() {},
    Notification: { isSupported: () => false },
    getDesktopIconPath: () => '',
    dispatchDeepLink() {},
    checkForUpdates() {},
    getUpdatePreferences() {},
    setUpdatePreferences() {},
    shell: {},
    path,
    nativeTheme: {},
    skipUpdate() {}
  });
  service.setupIPCHandlers();
  assert.equal(ipcMain.handlers.get('show-system-notification')({}, {}), false);
});
