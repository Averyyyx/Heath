'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SQLiteSessionStore } = require('./sqlite-session-store');

function fakeDatabase() {
  const sessions = new Map();
  return {
    sessions,
    prepare(sql) {
      const statement = sql.trim();
      if (statement.startsWith('SELECT sess')) return { get: (sid) => sessions.get(sid) || null };
      if (statement.startsWith('INSERT INTO http_sessions')) return { run: (sid, sess, expires_at) => sessions.set(sid, { sess, expires_at }) };
      if (statement.startsWith('UPDATE http_sessions')) return { run: (expires_at, sid) => { const row=sessions.get(sid); if(row) row.expires_at=expires_at; } };
      if (statement.startsWith('DELETE FROM http_sessions WHERE sid')) return { run: (sid) => sessions.delete(sid) };
      if (statement.startsWith('DELETE FROM http_sessions WHERE expires_at')) return { run: (now) => { for(const [sid,row] of sessions) if(row.expires_at<=now) sessions.delete(sid); } };
      throw new Error('Unexpected SQL: ' + statement);
    }
  };
}

function callbackResult(run) {
  return new Promise((resolve, reject) => run((error, value) => error ? reject(error) : resolve(value)));
}

test('SQLite session store writes, reads, touches and destroys sessions', async () => {
  const database = fakeDatabase();
  const store = new SQLiteSessionStore(database);
  try {
    const value = { user: { id: 12 }, cookie: {} };
    await callbackResult((cb) => store.set('sid-1', value, cb));
    assert.deepEqual(await callbackResult((cb) => store.get('sid-1', cb)), value);
    await callbackResult((cb) => store.touch('sid-1', value, cb));
    await callbackResult((cb) => store.destroy('sid-1', cb));
    assert.equal(await callbackResult((cb) => store.get('sid-1', cb)), null);
  } finally {
    clearInterval(store.cleanupTimer);
  }
});

test('SQLite session store deletes expired sessions when read', async () => {
  const database = fakeDatabase();
  const store = new SQLiteSessionStore(database);
  try {
    database.sessions.set('expired', { sess: JSON.stringify({ user: 1 }), expires_at: Date.now() - 1 });
    assert.equal(await callbackResult((cb) => store.get('expired', cb)), null);
    assert.equal(database.sessions.has('expired'), false);
  } finally {
    clearInterval(store.cleanupTimer);
  }
});
