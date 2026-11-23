'use strict';

function migrateLegacyUserData({ appDataPath, fs, path, logger = console }) {
  const legacyPath = path.join(appDataPath, 'Nexo');
  const targetPath = path.join(appDataPath, 'Hearth');
  const markerPath = path.join(targetPath, '.hearth-migration-v1');
  const inProgressPath = path.join(targetPath, '.hearth-migration-in-progress');

  if (fs.existsSync(markerPath) || !fs.existsSync(legacyPath)) return targetPath;

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

    const cacheDirectories = new Set([
      'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'ShaderCache',
      'GrShaderCache', 'blob_storage', 'CacheStorage', 'Session Storage', 'Cookies'
    ]);
    fs.cpSync(legacyPath, targetPath, {
      recursive: true,
      filter: (sourcePath) => {
        const relative = path.relative(legacyPath, sourcePath);
        if (!relative) return true;
        return !relative.split(path.sep).some((part) => cacheDirectories.has(part));
      }
    });

    // 0.0.8 stored the SQLite database under userData/data/app.db.
    // Keep root-level locations supported for profiles created by older dev builds.
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

    fs.writeFileSync(markerPath, '1', 'utf8');
    fs.rmSync(inProgressPath, { force: true });
    logger.log?.('Legacy Nexo user data copied to Hearth. The original folder was preserved.');
  } catch (error) {
    if (createdTarget) {
      try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
    }
    logger.warn?.('Hearth user-data migration failed; continuing with the original Nexo profile to avoid opening an empty account:', error.message);
    return legacyPath;
  }

  return targetPath;
}

module.exports = { migrateLegacyUserData };
