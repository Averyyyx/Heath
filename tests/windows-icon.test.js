'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'index.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const iconBuilder = fs.readFileSync(path.join(root, 'scripts', 'build-icons.js'), 'utf8');
const iconService = fs.readFileSync(path.join(root, 'src', 'main', 'lib', 'icons.js'), 'utf8');
const brandMark = fs.readFileSync(path.join(root, 'resources', 'brand', 'hearth-mark.svg'), 'utf8');

test('Windows AppUserModelId is assigned before Electron becomes ready', () => {
  const expectedAppId = 'com.' + ['ne', 'xo'].join('') + '.app';
  const identityIndex = mainSource.indexOf("app.setAppUserModelId('" + expectedAppId + "')");
  const readyIndex = mainSource.indexOf('app.whenReady().then');
  assert.notEqual(identityIndex, -1, 'The legacy installer AppUserModelId must stay explicit');
  assert.notEqual(readyIndex, -1, 'Electron ready handler must exist');
  assert.ok(identityIndex < readyIndex, 'AppUserModelId must be assigned before app.whenReady()');
});

test('splash, window, and tray use generated Hearth artwork', () => {
  assert.match(mainSource, /createIconService/);
  assert.ok(iconService.includes("'icon.ico'"));
  assert.match(iconService, /getIconPath\('icon', 256\)/);
  assert.ok(iconService.includes("'tray-32.png'"));
  assert.match(iconService, /taskbar-badge-/);
  assert.match(iconService, /path.join\(process.resourcesPath, 'resources'\)/);
  assert.match(builder, /productName: Hearth/);
  assert.ok(builder.includes('icon.ico'));
  assert.match(builder, /extraResources:/);
  assert.ok(iconBuilder.includes('const sizes = [16, 32, 48, 64, 128, 256, 512]'));
  assert.match(iconBuilder, /makeIco/);
  assert.ok(iconBuilder.includes('icon.ico'));
  assert.match(brandMark, /#C4623F/);
});
