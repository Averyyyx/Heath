'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApplicationPaths } = require('../src/main/paths');

test('development paths resolve source files from the project root', () => {
  const mainDirectory = path.join('/work', 'hearth', 'src', 'main');
  const paths = createApplicationPaths({
    app: { isPackaged: false },
    path,
    process: {},
    mainDirectory
  });

  assert.equal(paths.projectRoot, path.join('/work', 'hearth'));
  assert.equal(paths.resourcesDirectory, path.join('/work', 'hearth', 'resources'));
  assert.equal(paths.serverPath, path.join('/work', 'hearth', 'src', 'server', 'index.js'));
  assert.equal(paths.serverWorkingDirectory, path.join('/work', 'hearth'));
  assert.equal(paths.mainPreload, path.join('/work', 'hearth', 'src', 'preload', 'index.js'));
  assert.equal(paths.splashPreload, path.join('/work', 'hearth', 'src', 'preload', 'splash.js'));
  assert.equal(paths.splashHtml, path.join('/work', 'hearth', 'src', 'main', 'splash.html'));
});

test('packaged paths keep the server and resources outside app.asar', () => {
  const mainDirectory = path.join('/install', 'resources', 'app.asar', 'src', 'main');
  const paths = createApplicationPaths({
    app: { isPackaged: true },
    path,
    process: { resourcesPath: path.join('/install', 'resources') },
    mainDirectory
  });

  const unpacked = path.join('/install', 'resources', 'app.asar.unpacked');
  assert.equal(paths.serverPath, path.join(unpacked, 'src', 'server', 'index.js'));
  assert.equal(paths.serverWorkingDirectory, unpacked);
  assert.equal(paths.resourcesDirectory, path.join('/install', 'resources', 'resources'));
  assert.equal(paths.mainPreload, path.join('/install', 'resources', 'app.asar', 'src', 'preload', 'index.js'));
});
