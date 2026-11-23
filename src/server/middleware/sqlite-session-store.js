'use strict';

const session = require('express-session');

class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.readSession = database.prepare('SELECT sess, expires_at FROM http_sessions WHERE sid = ?');
    this.writeSession = database.prepare(`
      INSERT INTO http_sessions (sid, sess, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
    `);
    this.touchSession = database.prepare('UPDATE http_sessions SET expires_at = ? WHERE sid = ?');
    this.deleteSession = database.prepare('DELETE FROM http_sessions WHERE sid = ?');
    this.deleteExpired = database.prepare('DELETE FROM http_sessions WHERE expires_at <= ?');
    this.cleanupTimer = setInterval(() => {
      try { this.deleteExpired.run(Date.now()); } catch (error) {
        console.warn('Session cleanup failed:', error.message);
      }
    }, 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  get(sid, callback) {
    try {
      const row = this.readSession.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.deleteSession.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) { return callback(error); }
  }

  set(sid, sess, callback) {
    try {
      const expiry = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 30 * 24 * 60 * 60 * 1000;
      this.writeSession.run(sid, JSON.stringify(sess), Number.isFinite(expiry) ? expiry : Date.now() + 30 * 24 * 60 * 60 * 1000);
      callback?.(null);
    } catch (error) { callback?.(error); }
  }

  touch(sid, sess, callback) {
    try {
      const expiry = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 30 * 24 * 60 * 60 * 1000;
      this.touchSession.run(Number.isFinite(expiry) ? expiry : Date.now() + 30 * 24 * 60 * 60 * 1000, sid);
      callback?.(null);
    } catch (error) { callback?.(error); }
  }

  destroy(sid, callback) {
    try { this.deleteSession.run(sid); callback?.(null); }
    catch (error) { callback?.(error); }
  }
}

module.exports = { SQLiteSessionStore };
