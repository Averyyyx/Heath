'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateLegacyUserData } = require('./user-data-migration');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-migration-'));
  return { root, legacy: path.join(root, 'Nexo'), target: path.join(root, 'Hearth') };
}

test('migration copies durable user data and browser storage while skipping Chromium caches', () => {
  const { root, legacy, target } = fixture();
  fs.mkdirSync(path.join(legacy, 'Local Storage'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'Session Storage'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'Cookies'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'Cache'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'Code Cache'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'GPUCache'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'DawnCache'), { recursive: true });
  fs.mkdirSync(path.join(legacy, 'data', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'secrets.json'), '{"secret":"keep"}');
  fs.writeFileSync(path.join(legacy, 'Local Storage', 'leveldb'), 'local');
  fs.writeFileSync(path.join(legacy, 'Session Storage', 'leveldb'), 'session');
  fs.writeFileSync(path.join(legacy, 'Cookies', 'Cookies'), 'cookie-db');
  fs.writeFileSync(path.join(legacy, 'Cache', 'cache.bin'), 'cache');
  fs.writeFileSync(path.join(legacy, 'Code Cache', 'code.bin'), 'cache');
  fs.writeFileSync(path.join(legacy, 'GPUCache', 'gpu.bin'), 'cache');
  fs.writeFileSync(path.join(legacy, 'DawnCache', 'dawn.bin'), 'cache');
  fs.writeFileSync(path.join(legacy, 'app.db'), 'database');
  fs.writeFileSync(path.join(legacy, 'app.db-wal'), 'wal');
  fs.writeFileSync(path.join(legacy, 'app.db-shm'), 'shm');
  fs.writeFileSync(path.join(legacy, 'data', 'app.db'), 'nested-database');
  fs.writeFileSync(path.join(legacy, 'data', 'app.db-wal'), 'nested-wal');
  fs.writeFileSync(path.join(legacy, 'data', 'uploads', 'attachment.bin'), 'attachment');
  try {
    assert.equal(migrateLegacyUserData({ appDataPath: root, fs, path, logger: { log() {}, warn() {} } }), target);
    assert.equal(fs.readFileSync(path.join(target, 'secrets.json'), 'utf8'), '{"secret":"keep"}');
    assert.equal(fs.readFileSync(path.join(target, 'Local Storage', 'leveldb'), 'utf8'), 'local');
    assert.equal(fs.readFileSync(path.join(target, 'Session Storage', 'leveldb'), 'utf8'), 'session');
    assert.equal(fs.readFileSync(path.join(target, 'Cookies', 'Cookies'), 'utf8'), 'cookie-db');
    assert.equal(fs.existsSync(path.join(target, 'Cache')), false);
    assert.equal(fs.existsSync(path.join(target, 'Code Cache')), false);
    assert.equal(fs.existsSync(path.join(target, 'GPUCache')), false);
    assert.equal(fs.existsSync(path.join(target, 'DawnCache')), false);
    assert.equal(fs.readFileSync(path.join(target, 'hearth.db'), 'utf8'), 'database');
    assert.equal(fs.readFileSync(path.join(target, 'hearth.db-wal'), 'utf8'), 'wal');
    assert.equal(fs.readFileSync(path.join(target, 'hearth.db-shm'), 'utf8'), 'shm');
    assert.equal(fs.readFileSync(path.join(target, 'data', 'hearth.db'), 'utf8'), 'nested-database');
    assert.equal(fs.readFileSync(path.join(target, 'data', 'hearth.db-wal'), 'utf8'), 'nested-wal');
    assert.equal(fs.readFileSync(path.join(target, 'data', 'uploads', 'attachment.bin'), 'utf8'), 'attachment');
    assert.match(fs.readFileSync(path.join(target, '.migrated-from-legacy'), 'utf8'), /^\d{4}-\d\d-\d\dT/);
    assert.equal(fs.existsSync(legacy), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration does not overwrite an existing Hearth profile', () => {
  const { root, legacy, target } = fixture();
  fs.mkdirSync(legacy, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'settings.json'), 'old');
  fs.writeFileSync(path.join(target, 'settings.json'), 'new');
  try {
    migrateLegacyUserData({ appDataPath: root, fs, path, logger: { log() {}, warn() {} } });
    assert.equal(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'), 'new');
    assert.equal(fs.existsSync(path.join(target, '.migrated-from-legacy')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration resumes after a marked partial destination and rolls forward cleanly', () => {
  const { root, legacy, target } = fixture();
  fs.mkdirSync(legacy, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, '.hearth-migration-in-progress'), 'partial');
  fs.mkdirSync(path.join(legacy, 'data'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'data', 'app.db'), 'legacy-database');
  fs.writeFileSync(path.join(legacy, 'settings.json'), 'source');
  try {
    migrateLegacyUserData({ appDataPath: root, fs, path, logger: { log() {}, warn() {} } });
    assert.equal(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'), 'source');
    assert.equal(fs.readFileSync(path.join(target, 'data', 'hearth.db'), 'utf8'), 'legacy-database');
    assert.equal(fs.existsSync(path.join(target, '.hearth-migration-in-progress')), false);
    assert.equal(fs.existsSync(path.join(target, '.migrated-from-legacy')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('existing Hearth database prevents a second profile copy even without a marker', () => {
  const { root, legacy, target } = fixture();
  fs.mkdirSync(path.join(legacy, 'data'), { recursive: true });
  fs.mkdirSync(path.join(target, 'data'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'settings.json'), 'legacy');
  fs.writeFileSync(path.join(target, 'data', 'hearth.db'), 'existing-database');
  try {
    assert.equal(migrateLegacyUserData({ appDataPath: root, fs, path, logger: { log() {}, warn() {} } }), target);
    assert.equal(fs.existsSync(path.join(target, 'settings.json')), false);
    assert.equal(fs.existsSync(path.join(target, '.migrated-from-legacy')), false);
    assert.equal(fs.readFileSync(path.join(target, 'data', 'hearth.db'), 'utf8'), 'existing-database');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration failure falls back to the original profile instead of opening an empty one', () => {
  const { root, legacy, target } = fixture();
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'settings.json'), 'keep-existing-profile');
  const failingFs = { ...fs, cpSync() { throw new Error('simulated disk failure'); } };
  try {
    const result = migrateLegacyUserData({
      appDataPath: root,
      fs: failingFs,
      path,
      logger: { log() {}, warn() {} }
    });
    assert.equal(result, legacy);
    assert.equal(fs.readFileSync(path.join(legacy, 'settings.json'), 'utf8'), 'keep-existing-profile');
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration rolls back when the copied Hearth database is missing', () => {
  const { root, legacy, target } = fixture();
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'settings.json'), 'preserve');
  try {
    const result = migrateLegacyUserData({
      appDataPath: root,
      fs,
      path,
      logger: { log() {}, warn() {} }
    });
    assert.equal(result, legacy);
    assert.equal(fs.readFileSync(path.join(legacy, 'settings.json'), 'utf8'), 'preserve');
    assert.equal(fs.existsSync(path.join(target, '.migrated-from-legacy')), false);
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
