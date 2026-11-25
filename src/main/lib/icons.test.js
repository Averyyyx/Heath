'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIconService } = require('./icons');

function setup(platform = 'win32', packaged = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-icons-'));
  const assets = path.join(root, 'resources');
  fs.mkdirSync(assets, { recursive: true });
  const nativeImage = {
    createFromPath: (file) => ({ file, isEmpty: () => false }),
    createEmpty: () => ({ empty: true })
  };
  const calls = [];
  const app = { isPackaged: packaged, getPath: () => root };
  const resourcesDir = path.join(root, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  const service = createIconService({
    app, path, fs, nativeImage, process: { platform, execPath: 'C:/Hearth/Hearth.exe', resourcesPath: root },
    shell: { writeShortcutLink: (...args) => { calls.push(args); return true; } },
    devResourcesDir: resourcesDir, getNotificationCount: () => 0
  });
  return { root, resourcesDir, service, calls };
}

test('icon service resolves the generated ICO and size-specific PNG assets', () => {
  const { root, resourcesDir, service } = setup();
  try {
    fs.writeFileSync(path.join(resourcesDir, 'icon.ico'), 'ico');
    fs.writeFileSync(path.join(resourcesDir, 'icon-256.png'), 'png');
    assert.equal(service.getDesktopIconPath(), path.join(resourcesDir, 'icon.ico'));
    assert.equal(service.getIconPath('icon', 256), path.join(resourcesDir, 'icon-256.png'));
    assert.equal(service.getTrayIconPath(12), path.join(resourcesDir, 'tray-9-32.png'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('icon service creates a Hearth desktop shortcut only for packaged Windows builds', () => {
  const { root, service, calls } = setup();
  try {
    service.ensureDesktopShortcut();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], path.join(root, 'Hearth.lnk'));
    const nonWindows = setup('linux', true);
    nonWindows.service.ensureDesktopShortcut();
    assert.equal(nonWindows.calls.length, 0);
    fs.rmSync(nonWindows.root, { recursive: true, force: true });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tray and taskbar helpers return safe empty fallbacks when assets are absent', () => {
  const { root, service } = setup();
  try {
    assert.deepEqual(service.createTrayImage(), { empty: true });
    assert.equal(service.createTaskbarOverlay(0), null);
    assert.equal(service.createTaskbarOverlay(3), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
