'use strict';

const fs = require('node:fs');
const path = require('node:path');

function afterPack(context) {
  const projectDir = context.projectDir || process.cwd();
  const appOutDir = context.appOutDir;
  if (!appOutDir) throw new Error('electron-builder did not provide appOutDir.');

  const relativeBinary = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const source = path.join(projectDir, relativeBinary);
  const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', relativeBinary);

  // electron-builder's nativeRebuilder runs before afterPack. Depending on the
  // packager copy path, the binary may still exist in project node_modules or
  // may already have been copied to app.asar.unpacked.
  if (fs.existsSync(source)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (path.resolve(source) !== path.resolve(target)) {
      fs.copyFileSync(source, target);
    }
  } else if (!fs.existsSync(target)) {
    throw new Error(
      'The Electron-compatible better-sqlite3 native binary is missing from both ' +
      'the build dependencies and app.asar.unpacked. Check electron-builder nativeRebuilder/npmRebuild settings. ' +
      'Expected: ' + target
    );
  }
}

module.exports = afterPack;
