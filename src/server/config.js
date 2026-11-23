'use strict';

const brand = require('../shared/brand');

const path = require('node:path');

function createServerConfig(env = process.env, baseDir = __dirname) {
  if (!env.SESSION_SECRET) {
    console.warn('WARNING: Using default SESSION_SECRET. Set SESSION_SECRET in production!');
    env.SESSION_SECRET = 'hearth-desktop-session-secret-change-in-production';
  }
  if (!env.JWT_SECRET) {
    console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET in production!');
    env.JWT_SECRET = 'hearth-desktop-jwt-secret-change-in-production';
  }
  if (!env.CLIENT_ORIGIN) env.CLIENT_ORIGIN = 'http://localhost:4000';
  if (!env.NODE_ENV) env.NODE_ENV = 'production';

  const isDesktop = env.ELECTRON_DESKTOP === '1';
  const dataDir = env.DATA_DIR || path.resolve(baseDir, '..', '..', 'data');
  const publicDir = path.resolve(baseDir, '..', '..', 'public');
  const useMemorySession = env.USE_MEMORY_SESSION === 'true' || isDesktop;
  const useSQLiteSession = isDesktop || useMemorySession;

  return {
    isDesktop,
    PORT: env.PORT || 4000,
    dataDir,
    publicDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    tempUploadsDir: path.join(dataDir, 'tmp'),
    avatarsDir: path.join(dataDir, 'avatars'),
    ALLOWED_MIME_TYPES: new Set(
      (env.ALLOWED_MIME_TYPES ||
        'image/png,image/jpeg,image/webp,image/gif,video/mp4,application/pdf')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
    ALLOWED_EXTENSIONS: new Set(
      (env.ALLOWED_EXTENSIONS || '.png,.jpg,.jpeg,.webp,.gif,.mp4,.pdf')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    ),
    PASSWORD_MIN_SCORE: Number(env.PASSWORD_MIN_SCORE || 3),
    REQUIRE_HTTPS: env.REQUIRE_HTTPS === 'true',
    isProduction: env.NODE_ENV === 'production',
    PREMIUM_BRAND: env.PREMIUM_BRAND || brand.premium,
    PREMIUM_BALANCE_TOKEN: env.PREMIUM_BALANCE_TOKEN || '',
    useMemorySession,
    useSQLiteSession
  };
}

module.exports = { createServerConfig };
