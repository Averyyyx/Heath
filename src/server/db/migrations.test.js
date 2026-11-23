'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runBrandMigration } = require('./migrations');

function createDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, display_name TEXT);
    CREATE TABLE http_sessions (sid TEXT PRIMARY KEY, sess TEXT, expires_at INTEGER);
  `);
  return db;
}

test('brand migration renames the developer account and clears sessions transactionally', () => {
  const db = createDatabase();
  try {
    db.prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)').run(1, 'dev@nexo.local', 'Nexo Dev');
    db.prepare('INSERT INTO http_sessions (sid, sess, expires_at) VALUES (?, ?, ?)').run('old-session', '{}', Date.now() + 10000);
    assert.equal(runBrandMigration(db), true);
    const user = db.prepare('SELECT email, display_name FROM users WHERE id = 1').get();
    assert.deepEqual(user, { email: 'dev@hearth.local', display_name: 'Hearth Dev' });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 0);
    assert.equal(runBrandMigration(db), false);
    db.prepare('INSERT INTO http_sessions (sid, sess, expires_at) VALUES (?, ?, ?)').run('new-session', '{}', Date.now() + 10000);
    assert.equal(runBrandMigration(db), false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM http_sessions').get().count, 1);
  } finally {
    db.close();
  }
});

test('brand migration updates an existing Hearth developer display name without creating a duplicate', () => {
  const db = createDatabase();
  try {
    db.prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)').run(1, 'dev@hearth.local', 'Old Dev');
    db.prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)').run(2, 'dev@nexo.local', 'Legacy Dev');
    runBrandMigration(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2);
    assert.equal(db.prepare('SELECT display_name FROM users WHERE email = ?').get('dev@hearth.local').display_name, 'Hearth Dev');
    assert.equal(db.prepare('SELECT email FROM users WHERE id = 2').get().email, 'dev@nexo.local');
  } finally {
    db.close();
  }
});
