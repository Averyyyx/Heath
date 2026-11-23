'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');

test('Windows AppUserModelId is assigned before Electron becomes ready', () => {
  const identityIndex = mainSource.indexOf("app.setAppUserModelId('com.nexo.app')");
  const readyIndex = mainSource.indexOf('app.whenReady().then');
  assert.notEqual(identityIndex, -1, 'Nexo AppUserModelId must be explicit');
  assert.notEqual(readyIndex, -1, 'Electron ready handler must exist');
  assert.ok(identityIndex < readyIndex, 'AppUserModelId must be assigned before app.whenReady()');
});

test('both startup splash and main windows receive the Nexo icon', () => {
  assert.match(mainSource, /if \(!ico\.isEmpty\(\)\) return iconPath/);
  assert.match(mainSource, /if \(!png\.isEmpty\(\)\) return pngPath/);
  assert.match(mainSource, /icon:\s*splashIconPath/);
  assert.match(mainSource, /icon:\s*getDesktopIconPath\(\)/);
  assert.match(mainSource, /splashWindow\.setIcon\(splashIcon\)/);
  assert.match(mainSource, /mainWindow\.setIcon\(desktopIcon\)/);
});
