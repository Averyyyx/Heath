'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const afterPack = require('./after-pack');

const napiBinary = path.join('node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node');
const legacyBinary = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

test('copies the better-sqlite3 v13 N-API prebuild into app.asar.unpacked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-napi-'));
  try {
    const source = path.join(root, napiBinary);
    const appOutDir = path.join(root, 'dist', 'win-unpacked');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'napi-native-module-fixture');

    afterPack({ projectDir: root, appOutDir });

    const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', napiBinary);
    assert.equal(fs.readFileSync(target, 'utf8'), 'napi-native-module-fixture');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copies the legacy node-gyp Release binary into app.asar.unpacked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-node-gyp-'));
  try {
    const source = path.join(root, legacyBinary);
    const appOutDir = path.join(root, 'dist', 'win-unpacked');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'legacy-native-module-fixture');

    afterPack({ projectDir: root, appOutDir });

    const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', legacyBinary);
    assert.equal(fs.readFileSync(target, 'utf8'), 'legacy-native-module-fixture');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts the N-API prebuild when electron-builder already unpacked it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-unpacked-'));
  try {
    const appOutDir = path.join(root, 'dist', 'win-unpacked');
    const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', napiBinary);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'already-unpacked-napi-module');

    afterPack({ projectDir: root, appOutDir });

    assert.equal(fs.readFileSync(target, 'utf8'), 'already-unpacked-napi-module');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails clearly when none of the supported native binary paths exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-missing-'));
  try {
    assert.throws(
      () => afterPack({ projectDir: root, appOutDir: path.join(root, 'dist') }),
      /better-sqlite3 native binary is missing/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
