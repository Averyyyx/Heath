'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const afterPack = require('./after-pack');

test('copies the Electron-built SQLite binary into app.asar.unpacked', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-'));
  try {
    const relative = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    const source = path.join(root, relative);
    const appOutDir = path.join(root, 'dist', 'win-unpacked');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'native-module-fixture');

    await afterPack({ projectDir: root, appOutDir });

    const target = path.join(appOutDir, 'resources', 'app.asar.unpacked', relative);
    assert.equal(fs.readFileSync(target, 'utf8'), 'native-module-fixture');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails clearly when the native binary was not built', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-after-pack-missing-'));
  try {
    await assert.rejects(
      afterPack({ projectDir: root, appOutDir: path.join(root, 'dist') }),
      /native binary is missing/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
