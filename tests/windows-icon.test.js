'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const iconBuilder = fs.readFileSync(path.join(root, 'scripts', 'build-icons.js'), 'utf8');
const brandMark = fs.readFileSync(path.join(root, 'resources', 'brand', 'hearth-mark.svg'), 'utf8');

test('Windows AppUserModelId is assigned before Electron becomes ready', () => {
  const identityIndex = mainSource.indexOf("app.setAppUserModelId('com.nexo.app')");
  const readyIndex = mainSource.indexOf('app.whenReady().then');
  assert.notEqual(identityIndex, -1, 'The legacy installer AppUserModelId must stay explicit');
  assert.notEqual(readyIndex, -1, 'Electron ready handler must exist');
  assert.ok(identityIndex < readyIndex, 'AppUserModelId must be assigned before app.whenReady()');
});

test('splash, window, and tray use generated Hearth artwork', () => {
  assert.match(mainSource, /'icon\\.ico'/);
  assert.match(mainSource, /getIconPath\('icon', 256\)/);
  assert.match(mainSource, /'tray-32\\.png'/);
  assert.match(mainSource, /taskbar-badge-/);
  assert.match(builder, /productName: Hearth/);
  assert.match(builder, /icon\\.ico/);
  assert.match(builder, /extraResources:/);
  assert.match(iconBuilder, /icon-512\\.png/);
  assert.match(iconBuilder, /makeIco/);
  assert.match(brandMark, /#C4623F/);
  assert.match(mainSource, /icon:\\s*getDesktopIconPath\(\)/);
});
