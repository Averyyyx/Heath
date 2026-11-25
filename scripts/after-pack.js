'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NATIVE_BINARY_CANDIDATES = [
  // better-sqlite3 v13 uses a Node-API prebuild rather than the old node-gyp Release path.
  path.join('node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node'),
  // Keep compatibility with versions or local builds that still use node-gyp output.
  path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  path.join('node_modules', 'better-sqlite3', 'build', 'Debug', 'better_sqlite3.node')
];

function afterPack(context) {
  const projectDir = context.projectDir || process.cwd();
  const appOutDir = context.appOutDir;
  if (!appOutDir) throw new Error('electron-builder did not provide appOutDir.');

  const unpackedRoot = path.join(appOutDir, 'resources', 'app.asar.unpacked');
  const found = [];

  for (const relativeBinary of NATIVE_BINARY_CANDIDATES) {
    const source = path.join(projectDir, relativeBinary);
    const target = path.join(unpackedRoot, relativeBinary);

    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (path.resolve(source) !== path.resolve(target)) {
        fs.copyFileSync(source, target);
      }
      found.push({ source, target });
      continue;
    }

    // electron-builder may already have copied this candidate through asarUnpack.
    if (fs.existsSync(target)) {
      found.push({ source: null, target });
    }
  }

  if (found.length === 0) {
    const searched = NATIVE_BINARY_CANDIDATES
      .map((relative) => path.join(unpackedRoot, relative))
      .join('\n - ');
    throw new Error(
      'The better-sqlite3 native binary is missing. Checked the N-API prebuild and node-gyp output paths in both ' +
      'the project dependencies and app.asar.unpacked. Expected one of:\n - ' + searched
    );
  }
}

module.exports = afterPack;
