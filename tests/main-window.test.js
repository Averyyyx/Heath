'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMainWindow } = require('../src/main/windows/main-window');

test('creates the Hearth window with isolated preload and retained minimum dimensions', async () => {
  let options;
  let openHandler;
  let closed = false;
  const sent = [];
  const external = [];

  class FakeWindow extends EventEmitter {
    constructor(value) {
      super();
      options = value;
      this.webContents = new EventEmitter();
      this.webContents.send = (...args) => sent.push(args);
      this.webContents.setWindowOpenHandler = (handler) => { openHandler = handler; };
      this.loadURL = async (url) => { this.loadedUrl = url; };
      this.setIcon = () => {};
    }
  }

  const window = createMainWindow({
    BrowserWindow: FakeWindow,
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    process: { platform: 'win32', env: { NODE_ENV: 'production' } },
    getDesktopIconPath: () => '/resources/icon.ico',
    preloadPath: '/app/src/preload/index.js',
    serverUrl: 'http://127.0.0.1:4000',
    app: { isQuitting: false },
    shell: { openExternal: (url) => external.push(url) },
    dispatchDeepLink: (url) => external.push('deeplink:' + url),
    getPendingUpdateNotice: () => ({ status: 'available' }),
    onClosed: () => { closed = true; }
  });

  assert.equal(options.width, 1280);
  assert.equal(options.height, 800);
  assert.equal(options.minWidth, 1024);
  assert.equal(options.minHeight, 700);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.preload, '/app/src/preload/index.js');
  assert.equal(options.title, 'Hearth');
  assert.equal(window.loadedUrl, 'http://127.0.0.1:4000');

  window.webContents.emit('did-finish-load');
  assert.deepEqual(sent, [['update-status', { status: 'available' }]]);
  assert.equal(openHandler({ url: 'hearth://conversation/1' }).action, 'deny');
  assert.equal(external[0], 'deeplink:hearth://conversation/1');
  openHandler({ url: 'https://example.com' });
  assert.equal(external[1], 'https://example.com');
  window.emit('closed');
  assert.equal(closed, true);
});

test('hides the main window on close unless the application is quitting', () => {
  let prevented = false;
  let hidden = false;
  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      this.webContents = new EventEmitter();
      this.webContents.send = () => {};
      this.webContents.setWindowOpenHandler = () => {};
      this.loadURL = async () => {};
      this.hide = () => { hidden = true; };
    }
  }
  createMainWindow({
    BrowserWindow: FakeWindow,
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    process: { platform: 'linux', env: {} },
    getDesktopIconPath: () => '',
    preloadPath: '',
    serverUrl: 'http://127.0.0.1:4000',
    app: { isQuitting: false },
    shell: { openExternal() {} },
    dispatchDeepLink() {},
    getPendingUpdateNotice: () => null,
    onClosed() {}
  }).emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(hidden, true);
});
