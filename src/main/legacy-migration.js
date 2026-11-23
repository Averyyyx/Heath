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
  const inProgressPath = path.join(targetPath, '.hearth-migration-in-progress');

  if (
    fs.existsSync(markerPath) ||
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

    // Earlier desktop builds used both root-level and data/app.db layouts.
    // Rename every database sidecar in the copied profile without touching the source.
    const databaseDirectories = [targetPath, path.join(targetPath, 'data')];
    for (const databaseDirectory of databaseDirectories) {
      if (!fs.existsSync(databaseDirectory)) continue;
      for (const databaseName of ['app.db', 'nexo.db']) {
        for (const suffix of ['', '-wal', '-shm']) {
          const oldFile = path.join(databaseDirectory, databaseName + suffix);
          const newFile = path.join(databaseDirectory, 'hearth.db' + suffix);
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
        if (userColumns.size) {
          db.prepare("UPDATE users SET email = 'dev@hearth.local' WHERE email = 'dev@nexo.local'").run();
          if (userColumns.has('display_name')) {
            db.prepare("UPDATE users SET display_name = 'Hearth Dev' WHERE display_name = 'Nexo Dev'").run();
          }
        }
        if (hasTable('http_sessions')) db.prepare('DELETE FROM http_sessions').run();
        if (hasTable('app_sessions')) db.prepare('DELETE FROM app_sessions').run();
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
