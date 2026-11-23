'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function afterPack(context) {
  const projectDir = context.projectDir || process.cwd();
  const appOutDir = context.appOutDir;
  if (!appOutDir) throw new Error('electron-builder did not provide appOutDir.');

  const relativeBinary = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const source = path.join(projectDir, relativeBinary);
  const target = path.join(
    appOutDir,
    'resources',
    'app.asar.unpacked',
    relativeBinary
  );

  if (!fs.existsSync(source)) {
    throw new Error('The Electron-built better-sqlite3 native binary is missing: ' + source);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

module.exports = afterPack;
