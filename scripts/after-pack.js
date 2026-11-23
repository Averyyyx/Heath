'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function rebuildNativeAddon(context) {
  if (typeof context.rebuildNative === 'function') {
    await context.rebuildNative();
    return;
  }

  const electronPackage = path.join(context.projectDir, 'node_modules', 'electron', 'package.json');
  if (!fs.existsSync(electronPackage)) return;

  const electronVersion = JSON.parse(fs.readFileSync(electronPackage, 'utf8')).version;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCommand, [
    'rebuild',
    'better-sqlite3',
    '--build-from-source',
    '--runtime=electron',
    '--target=' + electronVersion,
    '--dist-url=https://electronjs.org/headers'
  ], {
    cwd: context.projectDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
}

async function afterPack(context) {
  const projectDir = context.projectDir || process.cwd();
  const appOutDir = context.appOutDir;
  if (!appOutDir) throw new Error('electron-builder did not provide appOutDir.');

  const relativeBinary = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const source = path.join(projectDir, relativeBinary);
  const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', relativeBinary);

  // The install-app-deps postinstall can report a successful rebuild without leaving
  // the expected addon at this path. Rebuild explicitly for the pinned Electron ABI.
  if (!fs.existsSync(source)) await rebuildNativeAddon({ ...context, projectDir });

  if (!fs.existsSync(source)) {
    throw new Error('The Electron-built better-sqlite3 native binary is missing: ' + source);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

module.exports = afterPack;
