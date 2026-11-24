'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const afterPack = require('./after-pack');

const relativeBinary = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

test('copies the rebuilt Electron SQLite binary into app.asar.unpacked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-'));
  try {
    const source = path.join(root, relativeBinary);
    const appOutDir = path.join(root, 'dist', 'win-unpacked');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'electron-native-module-fixture');

    afterPack({ projectDir: root, appOutDir });

    const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', relativeBinary);
    assert.equal(fs.readFileSync(target, 'utf8'), 'electron-native-module-fixture');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts the native binary when electron-builder has already unpacked it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-unpacked-'));
  try {
    const appOutDir = path.join(root, 'dist', 'win-unpacked');
    const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', relativeBinary);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'already-unpacked-native-module');
    
    afterPack({ projectDir: root, appOutDir });

    assert.equal(fs.readFileSync(target, 'utf8'), 'already-unpacked-native-module');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails clearly when neither the build dependency nor unpacked app contains the binary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-missing-'));
  try {
    assert.throws(
      () => afterPack({ projectDir: root, appOutDir: path.join(root, 'dist') }),
      /Electron-compatible better-sqlite3 native binary is missing/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
