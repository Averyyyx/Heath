'use strict';

function migrateLegacyUserData({ appDataPath, fs, path, logger = console }) {
  const legacyPath = path.join(appDataPath, 'Nexo');
  const targetPath = path.join(appDataPath, 'Hearth');
  const markerPath = path.join(targetPath, '.migrated-from-legacy');
  const previousMarkerPath = path.join(targetPath, '.hearth-migration-v1');
  const databasePath = path.join(targetPath, 'data', 'hearth.db');
  const inProgressPath = path.join(targetPath, '.hearth-migration-in-progress');

  if (
    fs.existsSync(markerPath) ||
    fs.existsSync(previousMarkerPath) ||
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
    // Keep those profiles compatible while renaming the database in the copy.
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

    const migratedDatabase = path.join(targetPath, 'data', 'hearth.db');
    if (!fs.existsSync(migratedDatabase)) {
      throw new Error('The migrated Hearth database was not found: ' + migratedDatabase);
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
