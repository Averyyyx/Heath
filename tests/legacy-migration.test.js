'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrateLegacyUserData } = require('../src/main/lib/user-data-migration');
const { createDatabase } = require('../src/server/db/schema');

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
    CREATE TABLE preserved_records (value TEXT NOT NULL);
    INSERT INTO users (id, email, username, display_name)
      VALUES (1, 'dev@nexo.local', 'hearth-dev', 'Nexo Dev');
    INSERT INTO http_sessions VALUES ('legacy-session', '{}', 9999999999);
    INSERT INTO preserved_records VALUES ('keep-this-record');
  `);
  db.close();
}

test('migrates a 0.0.8 profile and updates the copied database without touching the original', () => {
  const fixture = createFixture();
  const legacyDbPath = path.join(fixture.legacyData, 'nexo.db');
  createLegacyDatabase(legacyDbPath);
  fs.mkdirSync(path.join(fixture.legacyPath, 'Cache'), { recursive: true });
  fs.mkdirSync(path.join(fixture.legacyPath, 'Code Cache'), { recursive: true });
  fs.mkdirSync(path.join(fixture.legacyPath, 'Local Storage'), { recursive: true });
  fs.mkdirSync(path.join(fixture.legacyPath, 'Session Storage'), { recursive: true });
  fs.mkdirSync(path.join(fixture.legacyData, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(fixture.legacyPath, 'Cache', 'cache.bin'), 'cache');
  fs.writeFileSync(path.join(fixture.legacyPath, 'Code Cache', 'code.bin'), 'cache');
  fs.writeFileSync(path.join(fixture.legacyPath, 'Local Storage', 'leveldb'), 'local-storage');
  fs.writeFileSync(path.join(fixture.legacyPath, 'Session Storage', 'leveldb'), 'session-storage');
  fs.writeFileSync(path.join(fixture.legacyPath, 'secrets.json'), '{"session":"preserve"}');
  fs.writeFileSync(path.join(fixture.legacyData, 'uploads', 'attachment.bin'), 'attachment');

  try {
    const migratedPath = migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs,
      path,
      logger: { log() {}, warn() {} }
    });
    assert.equal(migratedPath, fixture.hearthPath);

    const databasePath = path.join(fixture.hearthData, 'hearth.db');
    assert.equal(fs.existsSync(databasePath), true);
    assert.equal(fs.existsSync(path.join(fixture.hearthData, 'nexo.db')), false);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, '.migrated-from-legacy')), true);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, 'Cache')), false);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, 'Code Cache')), false);
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'Local Storage', 'leveldb'), 'utf8'), 'local-storage');
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'Session Storage', 'leveldb'), 'utf8'), 'session-storage');
    assert.equal(fs.readFileSync(path.join(fixture.hearthPath, 'secrets.json'), 'utf8'), '{"session":"preserve"}');
    assert.equal(fs.readFileSync(path.join(fixture.hearthData, 'uploads', 'attachment.bin'), 'utf8'), 'attachment');

    const db = createDatabase({
      Database,
      path,
      dataDir: fixture.hearthData,
      env: { ELECTRON_DESKTOP: '1', DB_PATH: databasePath }
    });
    try {
      assert.deepEqual(
        db.prepare('SELECT email, display_name FROM users WHERE id = 1').get(),
        { email: 'dev@hearth.local', display_name: 'Hearth Dev' }
      );
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 0);
      assert.equal(db.prepare('SELECT value FROM preserved_records').get().value, 'keep-this-record');
    } finally {
      db.close();
    }

    // A repeated migration must not copy over or alter the already migrated profile.
    fs.writeFileSync(path.join(fixture.legacyPath, 'later-change.txt'), 'old-profile-only');
    assert.equal(migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs,
      path,
      logger: { log() {}, warn() {} }
    }), fixture.hearthPath);
    assert.equal(fs.existsSync(path.join(fixture.hearthPath, 'later-change.txt')), false);
    assert.equal(fs.existsSync(legacyDbPath), true);
    const original = new Database(legacyDbPath);
    try {
      assert.equal(original.prepare('SELECT email FROM users WHERE id = 1').get().email, 'dev@nexo.local');
      assert.equal(original.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 1);
    } finally {
      original.close();
    }
  } finally {
    fs.rmSync(fixture.appDataPath, { recursive: true, force: true });
  }
});

test('keeps the original profile when copying fails', () => {
  const fixture = createFixture();
  fs.writeFileSync(path.join(fixture.legacyData, 'nexo.db'), 'source-database');
  fs.writeFileSync(path.join(fixture.legacyPath, 'settings.json'), '{"theme":"dark"}');
  const failingFs = { ...fs, cpSync() { throw new Error('simulated copy failure'); } };

  try {
    const result = migrateLegacyUserData({
      appDataPath: fixture.appDataPath,
      fs: failingFs,
      path,
      logger: { log() {}, warn() {} }
    });
    assert.equal(result, fixture.legacyPath);
    assert.equal(fs.readFileSync(path.join(fixture.legacyPath, 'settings.json'), 'utf8'), '{"theme":"dark"}');
    assert.equal(fs.readFileSync(path.join(fixture.legacyData, 'nexo.db'), 'utf8'), 'source-database');
    assert.equal(fs.existsSync(fixture.hearthPath), false);
  } finally {
    fs.rmSync(fixture.appDataPath, { recursive: true, force: true });
  }
});
