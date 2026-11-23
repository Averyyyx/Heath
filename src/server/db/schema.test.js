'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
const { createDatabase } = require('./schema');

test('database schema creates core tables and required user columns', () => {
  const db = createDatabase({ Database, path, dataDir: process.cwd(), env: { DB_PATH: ':memory:' } });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    for (const table of ['http_sessions', 'users', 'conversations', 'messages', 'servers', 'channels', 'voice_sessions']) {
      assert.equal(tables.has(table), true, table + ' should exist');
    }
    const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
    for (const column of ['display_name', 'discriminator', 'profile_complete', 'avatar_preset', 'status', 'custom_status']) {
      assert.equal(columns.has(column), true, column + ' should exist');
    }
  } finally {
    db.close();
  }
});

test('clears migrated desktop sessions exactly once while preserving other data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-session-reset-'));
  const profileDir = path.join(root, 'Hearth');
  const dataDir = path.join(profileDir, 'data');
  const dbPath = path.join(dataDir, 'hearth.db');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, '.migrated-from-legacy'), new Date().toISOString());

  const legacyDb = new Database(dbPath);
  legacyDb.exec(`
    CREATE TABLE http_sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE app_sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE preserved_data (value TEXT NOT NULL);
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT NOT NULL, display_name TEXT DEFAULT '');
    INSERT INTO users (id, email, username, display_name) VALUES (1, 'dev@nexo.local', 'nexo-dev', 'Nexo Dev');
    INSERT INTO http_sessions VALUES ('old-http', '{}', 9999999999);
    INSERT INTO app_sessions VALUES ('old-app', '{}', 9999999999);
    INSERT INTO preserved_data VALUES ('keep');
  `);
  legacyDb.close();

  try {
    let db = createDatabase({ Database, path, dataDir, env: { ELECTRON_DESKTOP: '1', DB_PATH: dbPath } });
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM app_sessions').get().count, 0);
      assert.equal(db.prepare('SELECT value FROM preserved_data').get().value, 'keep');
      assert.deepEqual(
        db.prepare('SELECT email, display_name FROM users WHERE id = 1').get(),
        { email: 'dev@hearth.local', display_name: 'Hearth Dev' }
      );
      assert.equal(fs.existsSync(path.join(profileDir, '.hearth-sessions-reset-v1')), true);
      db.prepare("INSERT INTO http_sessions VALUES ('new-session', '{}', 9999999999)").run();
    } finally {
      db.close();
    }

    db = createDatabase({ Database, path, dataDir, env: { ELECTRON_DESKTOP: '1', DB_PATH: dbPath } });
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 1);
      assert.deepEqual(
        db.prepare('SELECT email, display_name FROM users WHERE id = 1').get(),
        { email: 'dev@hearth.local', display_name: 'Hearth Dev' }
      );
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
