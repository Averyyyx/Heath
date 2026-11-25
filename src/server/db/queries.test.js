'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createDatabase } = require('./schema');
const { createQueries } = require('./queries');

test('database query registry exposes prepared statements and permission flags', () => {
  const db = createDatabase({ Database, path, dataDir: process.cwd(), env: { DB_PATH: ':memory:' } });
  try {
    const queries = createQueries(db);
    assert.equal(typeof queries.selectUserByEmail.get, 'function');
    assert.equal(typeof queries.insertMessage.run, 'function');
    assert.equal(typeof queries.selectServerById.get, 'function');
    assert.equal(queries.PERMISSIONS.ADMIN, 1);
    assert.equal(queries.PERMISSIONS.VIEW_CHANNEL, 1 << 4);
    assert.equal(queries.PERMISSIONS.STREAM, 1 << 9);
  } finally {
    db.close();
  }
});
