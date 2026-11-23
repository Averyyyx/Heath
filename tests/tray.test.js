'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTrayService } = require('../src/main/tray');

function createFakeTray() {
  const tray = new EventEmitter();
  tray.setImage = (image) => { tray.image = image; };
  tray.setToolTip = (text) => { tray.tooltip = text; };
  tray.setContextMenu = (menu) => { tray.menu = menu; };
  return tray;
}

test('creates a Hearth tray and toggles the main window on tray click', () => {
  const tray = createFakeTray();
  let visible = false;
  const calls = [];
  const mainWindow = {
    show() { visible = true; calls.push('show'); },
    hide() { visible = false; calls.push('hide'); },
    focus() { calls.push('focus'); },
    isVisible() { return visible; },
    isDestroyed() { return false; }
  };
  const service = createTrayService({
    app: { quit() {}, isQuitting: false },
    Tray: function Tray() { return tray; },
    Menu: { buildFromTemplate: (items) => items },
    nativeImage: { createFromPath: (value) => value },
    getMainWindow: () => mainWindow,
    checkForUpdates() {},
    createTrayImage: (count) => 'tray-' + count,
    getIconPath: () => 'hearth.ico',
    createTaskbarOverlay: () => 'overlay',
    process: { platform: 'win32' },
    getNotificationCount: () => 0,
    setNotificationCountState() {}
  });

  service.createTray();
  assert.equal(tray.tooltip, 'Hearth');
  assert.equal(tray.image, 'tray-0');
  tray.emit('click');
  assert.deepEqual(calls, ['show', 'focus']);
  tray.emit('click');
  assert.deepEqual(calls, ['show', 'focus', 'hide']);
});

test('clamps notification counts and updates the tray and Windows overlay', () => {
  const tray = createFakeTray();
  const mainWindowCalls = [];
  const mainWindow = {
    isDestroyed: () => false,
    setOverlayIcon: (...args) => mainWindowCalls.push(args)
  };
  let count = 0;
  const service = createTrayService({
    app: {},
    Tray: function Tray() { return tray; },
    Menu: { buildFromTemplate: (items) => items },
    nativeImage: { createFromPath: (value) => value },
    getMainWindow: () => mainWindow,
    checkForUpdates() {},
    createTrayImage: (value) => 'tray-' + value,
    getIconPath: () => 'icon',
    createTaskbarOverlay: (value) => 'overlay-' + value,
    process: { platform: 'win32' },
    getNotificationCount: () => count,
    setNotificationCountState: (value) => { count = value; }
  });

  service.createTray();
  service.setNotificationCount(100);
  assert.equal(count, 9);
  assert.equal(tray.image, 'tray-9');
  assert.equal(tray.tooltip, 'Hearth · 9 уведомлений');
  assert.deepEqual(mainWindowCalls, [['overlay-9', '9 непрочитанных уведомлений']]);

  service.setNotificationCount(-20);
  assert.equal(count, 0);
  assert.equal(tray.image, 'tray-0');
});
