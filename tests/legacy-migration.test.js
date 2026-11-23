'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrateLegacyUserData } = require('../src/main/legacy-migration');

function createFixture() {
  const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-legacy-migration-'));
  const legacyPath = path.join(appDataPath, 'Nexo');
  const legacyData = path.join(legacyPath, 'data');
  fs.mkdirSync(legacyData, { recursive: true });
  return {
    appDataPath,
    legacyPath,
    legacyData,
    hearthPath: path.join(appDataPath, 'Hearth'),
    hearthData: path.join(appDataPath, 'Hearth', 'data')
  };
}

function createLegacyDatabase(databasePath) {
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT DEFAULT ''
    );
    CREATE TABLE http_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE app_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE preserved_records (value TEXT NOT NULL);
    INSERT INTO users (id, email, username, display_name)
      VALUES (1, 'dev@nexo.local', 'hearth-dev', 'Nexo Dev');
    INSERT INTO http_sessions VALUES ('legacy-http-session', '{}', 9999999999);
    INSERT INTO app_sessions VALUES ('legacy-app-session', '{}', 9999999999);
    INSERT INTO preserved_records VALUES ('keep-this-record');
  `);
  db.close();
}

test('copies user data, migrates the SQLite database and preserves the original profile', () => {
  const fixture = createFixture();
  const legacyDbPath = path.join(fixture.legacyData, 'nexo.db');
  createLegacyDatabase(legacyDbPath);
  for (const dir of ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'Local Storage', 'Session Storage', 'Cookies']) {
    fs.mkdirSync(path.join(fixture.legacyPath, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(fixture.legacyData, 'uploads'), { recursive: true });
  for (const cache of ['Cache', 'Code Cache', 'GPUCache', 'DawnCache']) {
    fs.writeFileSync(path.join(fixture.legacyPath, cache, 'cache.bin'), 'cache');
  }
  fs.writeFileSync(path.join(fixture.legacyPath, 'Local Storage', 'leveldb'), 'local-storage');
  fs.writeFileSync(path.join(fixture.legacyPath, 'Session Storage', 'leveldb'), 'session-storage');
  fs.writeFileSync(path.join(fixture.legacyPath, 'Cookies', 'Cookies'), 'cookie-db');
  fs.writeFileSync(path.join(fixture.legacyPath, 'secrets.json'), '{"session":"preserve"}');
  fs.writeFileSync(path.join(fixture.legacyData, 'uploads', 'attachment.bin'), 'attachment');

  try {
    const result = migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs,
      path,
      Database,
      logger: { log() {}, warn() {} }
    });
    assert.equal(result, fixture.hearthPath);

    const databasePath = path.join(fixture.hearthData, 'hearth.db');
    assert.equal(fs.existsSync(databasePath), true);
    assert.equal(fs.existsSync(path.join(fixture.hearthData, 'nexo.db')), false);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, '.migrated-from-legacy')), true);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, '.hearth-migration-in-progress')), false);
    for (const cache of ['Cache', 'Code Cache', 'GPUCache', 'DawnCache']) {
      assert.equal(fs.existsSync(path.join(fixture.hearthPath, cache)), false);
    }
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'Local Storage', 'leveldb'), 'utf8'), 'local-storage');
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'Session Storage', 'leveldb'), 'utf8'), 'session-storage');
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'Cookies', 'Cookies'), 'utf8'), 'cookie-db');
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'secrets.json'), 'utf8'), '{"session":"preserve"}');
    assert.equal(fs.readFileSync(path.join(fixture.hearthData, 'uploads', 'attachment.bin'), 'utf8'), 'attachment');

    const migrated = new Database(databasePath);
    try {
      assert.deepEqual(
        migrated.prepare('SELECT email, display_name FROM users WHERE id = 1').get(),
        { email: 'dev@hearth.local', display_name: 'Hearth Dev' }
      );
      assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 0);
      assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM app_sessions').get().count, 1);
      assert.equal(migrated.prepare('SELECT value FROM preserved_records').get().value, 'keep-this-record');
    } finally {
      migrated.close();
    }

    // Repeating the migration must not overwrite the Hearth profile or mutate the source.
    fs.writeFileSync(path.join(fixture.legacyPath, 'later-change.txt'), 'old-profile-only');
    assert.equal(migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs,
      path,
      Database,
      logger: { log() {}, warn() {} }
    }), fixture.hearthPath);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, 'later-change.txt')), false);

    const original = new Database(legacyDbPath);
    try {
      assert.equal(original.prepare('SELECT email FROM users WHERE id = 1').get().email, 'dev@nexo.local');
      assert.equal(original.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 1);
      assert.equal(original.prepare('SELECT COUNT(*) AS count FROM app_sessions').get().count, 1);
    } finally {
      original.close();
    }
  } finally {
    fs.rmSync(fixture.appDataPath, { recursive: true, force: true });
  }
});

test('does not overwrite an existing Hearth profile', () => {
  const fixture = createFixture();
  fs.mkdirSync(fixture.hearthPath, { recursive: true });
  fs.writeFileSync(path.join(fixture.hearthPath, 'settings.json'), '{"theme":"new"}');
  fs.writeFileSync(path.join(fixture.legacyPath, 'settings.json'), '{"theme":"old"}');
  try {
    assert.equal(migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs,
      path,
      Database,
      logger: { log() {}, warn() {} }
    }), fixture.hearthPath);
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'settings.json'), 'utf8'), '{"theme":"new"}');
  } finally {
    fs.rmSync(fixture.appDataPath, { recursive: true, force: true });
  }
});

test('resumes an interrupted profile copy and finishes database migration', () => {
  const fixture = createFixture();
  createLegacyDatabase(path.join(fixture.legacyData, 'app.db'));
  fs.mkdirSync(fixture.hearthPath, { recursive: true });
  fs.writeFileSync(path.join(fixture.hearthPath, '.hearth-migration-in-progress'), 'partial');
  fs.writeFileSync(path.join(fixture.legacyPath, 'settings.json'), 'source');
  try {
    assert.equal(migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs,
      path,
      Database,
      logger: { log() {}, warn() {} }
    }), fixture.hearthPath);
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'settings.json'), 'utf8'), 'source');
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, 'data', 'hearth.db')), true);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, '.hearth-migration-in-progress')), false);
  } finally {
    fs.rmSync(fixture.appDataPath, { recursive: true, force: true });
  }
});

test('falls back to the original profile when copying fails', () => {
  const fixture = createFixture();
  fs.writeFileSync(path.join(fixture.legacyPath, 'settings.json'), '{"theme":"dark"}');
  const failingFs = { ...fs, cpSync() { throw new Error('simulated copy failure'); } };
  try {
    assert.equal(migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs: failingFs,
      path,
      Database,
      logger: { log() {}, warn() {} }
    }), fixture.legacyPath);
    assert.equal(fs.readFileSync(path.join(fixture.legacyPath, 'settings.json'), 'utf8'), '{"theme":"dark"}');
    assert.equal(fs.existsSync(fixture.hearthPath), false);
  } finally {
    fs.rmSync(fixture.appDataPath, { recursive: true, force: true });
  }
});

test('rolls back a copied profile when the database is missing', () => {
  const fixture = createFixture();
  fs.writeFileSync(path.join(fixture.legacyPath, 'settings.json'), 'preserve');
  try {
    assert.equal(migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs,
      path,
      Database,
      logger: { log() {}, warn() {} }
    }), fixture.legacyPath);
    assert.equal(fs.readFileSync(path.join(fixture.legacyPath, 'settings.json'), 'utf8'), 'preserve');
    assert.equal(fs.existsSync(fixture.hearthPath), false);
  } finally {
    fs.rmSync(fixture.appDataPath, { recursive: true, force: true });
  }
});
