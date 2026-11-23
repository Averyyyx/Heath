'use strict';

function runBrandMigration(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  if (db.prepare('SELECT name FROM app_migrations WHERE name = ?').get('hearth-brand-v1')) {
    return false;
  }

  const apply = db.transaction(() => {
    const currentAccount = db.prepare('SELECT id FROM users WHERE email = ?').get('dev@hearth.local');
    if (!currentAccount) {
      db.prepare(`
        UPDATE users
        SET email = ?, display_name = ?
        WHERE email = ?
      `).run('dev@hearth.local', 'Hearth Dev', 'dev@nexo.local');
    } else {
      db.prepare("UPDATE users SET display_name = ? WHERE email = ?").run('Hearth Dev', 'dev@hearth.local');
    }

    db.prepare('DELETE FROM http_sessions').run();
    db.prepare('INSERT INTO app_migrations (name) VALUES (?)').run('hearth-brand-v1');
  });

  apply();
  return true;
}

module.exports = { runBrandMigration };
