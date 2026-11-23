'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApplicationPaths } = require('../src/main/paths');

test('development paths resolve source files from the project root on the current platform', () => {
  const root = path.parse(process.cwd()).root;
  const mainDirectory = path.join(root, 'work', 'hearth', 'src', 'main');
  const projectRoot = path.join(root, 'work', 'hearth');
  const paths = createApplicationPaths({
    app: { isPackaged: false },
    path,
    process: {},
    mainDirectory
  });

  assert.equal(paths.projectRoot, projectRoot);
  assert.equal(paths.resourcesDirectory, path.join(projectRoot, 'resources'));
  assert.equal(paths.serverPath, path.join(projectRoot, 'src', 'server', 'index.js'));
  assert.equal(paths.serverWorkingDirectory, projectRoot);
  assert.equal(paths.mainPreload, path.join(projectRoot, 'src', 'preload', 'index.js'));
  assert.equal(paths.splashPreload, path.join(projectRoot, 'src', 'preload', 'splash.js'));
  assert.equal(paths.splashHtml, path.join(projectRoot, 'src', 'main', 'splash.html'));
});

test('packaged paths keep the server and resources outside app.asar', () => {
  const root = path.parse(process.cwd()).root;
  const installRoot = path.join(root, 'install');
  const resourcesPath = path.join(installRoot, 'resources');
  const mainDirectory = path.join(resourcesPath, 'app.asar', 'src', 'main');
  const paths = createApplicationPaths({
    app: { isPackaged: true },
    path,
    process: { resourcesPath },
    mainDirectory
  });

  const unpacked = path.join(resourcesPath, 'app.asar.unpacked');
  assert.equal(paths.serverPath, path.join(unpacked, 'src', 'server', 'index.js'));
  assert.equal(paths.serverWorkingDirectory, unpacked);
  assert.equal(paths.resourcesDirectory, path.join(resourcesPath, 'resources'));
  assert.equal(paths.mainPreload, path.join(resourcesPath, 'app.asar', 'src', 'preload', 'index.js'));
});
