'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
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
