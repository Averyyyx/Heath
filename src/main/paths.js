'use strict';

function createApplicationPaths({ app, path, process, mainDirectory = __dirname }) {
  const projectRoot = path.resolve(mainDirectory, '..', '..');
  const appResourcesDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(projectRoot, 'resources');
  const unpackedDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : projectRoot;

  return Object.freeze({
    projectRoot,
    resourcesDirectory: appResourcesDirectory,
    splashHtml: path.join(mainDirectory, 'splash.html'),
    mainPreload: path.join(mainDirectory, '..', 'preload', 'preload.js'),
    splashPreload: path.join(mainDirectory, '..', 'preload', 'splash-preload.js'),
    serverPath: app.isPackaged
      ? path.join(unpackedDirectory, 'src', 'server', 'index.js')
      : path.join(mainDirectory, '..', 'server', 'index.js'),
    serverWorkingDirectory: unpackedDirectory
  });
}

module.exports = { createApplicationPaths };
