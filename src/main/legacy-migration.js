'use strict';

function migrateLegacyUserData({
  appDataPath,
  fs,
  path,
  Database = require('better-sqlite3'),
  logger = console
}) {
  const legacyPath = path.join(appDataPath, 'Nexo');
  const targetPath = path.join(appDataPath, 'Hearth');
  const markerPath = path.join(targetPath, '.migrated-from-legacy');
  const databasePath = path.join(targetPath, 'data', 'hearth.db');
  const legacyMigrationMarker = path.join(targetPath, '.hearth-migration-v1');
  const inProgressPath = path.join(targetPath, '.hearth-migration-in-progress');

  if (
    fs.existsSync(markerPath) ||
    fs.existsSync(legacyMigrationMarker) ||
    fs.existsSync(databasePath) ||
    !fs.existsSync(legacyPath)
  ) return targetPath;

  let createdTarget = false;
  try {
    if (fs.existsSync(targetPath)) {
      if (fs.existsSync(inProgressPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        return targetPath;
      }
    }

    fs.mkdirSync(targetPath, { recursive: true });
    createdTarget = true;
    fs.writeFileSync(inProgressPath, new Date().toISOString(), 'utf8');

    const cacheDirectories = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache']);
    fs.cpSync(legacyPath, targetPath, {
      recursive: true,
      force: false,
      filter: (sourcePath) => {
        const relative = path.relative(legacyPath, sourcePath);
        if (!relative) return true;
        return !relative.split(path.sep).some((part) => cacheDirectories.has(part));
      }
    });

    const dataDirectory = path.join(targetPath, 'data');
    fs.mkdirSync(dataDirectory, { recursive: true });

    // Prefer the database already stored in the historical data/ directory.
    for (const databaseName of ['app.db', 'nexo.db']) {
      for (const suffix of ['', '-wal', '-shm']) {
        const oldFile = path.join(dataDirectory, databaseName + suffix);
        const newFile = path.join(dataDirectory, 'hearth.db' + suffix);
        if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) fs.renameSync(oldFile, newFile);
      }
    }

    // Some older profiles stored the SQLite file in the profile root.
    // Move it into the current data/ location only when no nested database exists.
    if (!fs.existsSync(databasePath)) {
      for (const databaseName of ['app.db', 'nexo.db', 'hearth.db']) {
        for (const suffix of ['', '-wal', '-shm']) {
          const oldFile = path.join(targetPath, databaseName + suffix);
          const newFile = path.join(dataDirectory, 'hearth.db' + suffix);
          if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) fs.renameSync(oldFile, newFile);
        }
      }
    }

    if (!fs.existsSync(databasePath)) {
      throw new Error('The copied SQLite database was not found: ' + databasePath);
    }

    const db = new Database(databasePath);
    try {
      const hasTable = (name) => Boolean(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
      );
      const userColumns = hasTable('users')
        ? new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name))
        : new Set();

      db.transaction(() => {
        if (userColumns.has('email')) {
          const hearthAccount = db.prepare('SELECT id FROM users WHERE email = ?').get('dev@hearth.local');
          if (!hearthAccount) {
            db.prepare('UPDATE users SET email = ? WHERE email = ?').run('dev@hearth.local', 'dev@nexo.local');
          }
          if (userColumns.has('display_name')) {
            db.prepare('UPDATE users SET display_name = ? WHERE email = ?').run('Hearth Dev', 'dev@hearth.local');
          }
        }
        if (hasTable('http_sessions')) db.prepare('DELETE FROM http_sessions').run();
        
      })();
    } finally {
      db.close();
    }

    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');
    fs.rmSync(inProgressPath, { force: true });
    logger.log?.('Legacy user data copied to Hearth. The original folder was preserved.');
  } catch (error) {
    if (createdTarget) {
      try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
    }
    logger.warn?.('Hearth user-data migration failed; continuing with the original profile to avoid opening an empty account:', error.message);
    return legacyPath;
  }

  return targetPath;
}

module.exports = { migrateLegacyUserData };
