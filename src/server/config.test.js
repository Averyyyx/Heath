'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServerConfig } = require('./config');

test('server config preserves desktop session defaults and data paths', () => {
  const env = { ELECTRON_DESKTOP: '1' };
  const config = createServerConfig(env, path.join(__dirname, 'fixture'));
  assert.equal(env.SESSION_SECRET, 'nexo-desktop-session-secret-change-in-production');
  assert.equal(env.JWT_SECRET, 'nexo-desktop-jwt-secret-change-in-production');
  assert.equal(env.CLIENT_ORIGIN, 'http://localhost:4000');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(config.isDesktop, true);
  assert.equal(config.useMemorySession, true);
  assert.equal(config.useSQLiteSession, true);
  assert.equal(config.isProduction, true);
  assert.equal(config.PORT, 4000);
  assert.equal(config.dataDir, path.resolve(__dirname, 'fixture', '..', '..', 'data'));
  assert.equal(config.publicDir, path.resolve(__dirname, 'fixture', '..', '..', 'public'));
});

test('server config respects explicit environment values', () => {
  const env = {
    PORT: '4555',
    DATA_DIR: '/tmp/hearth-data',
    USE_MEMORY_SESSION: 'true',
    NODE_ENV: 'development',
    PASSWORD_MIN_SCORE: '4',
    REQUIRE_HTTPS: 'true',
    ALLOWED_EXTENSIONS: '.png, .webp'
  };
  const config = createServerConfig(env, __dirname);
  assert.equal(config.PORT, '4555');
  assert.equal(config.dataDir, '/tmp/hearth-data');
  assert.equal(config.useMemorySession, true);
  assert.equal(config.useSQLiteSession, true);
  assert.equal(config.isProduction, false);
  assert.equal(config.PASSWORD_MIN_SCORE, 4);
  assert.equal(config.REQUIRE_HTTPS, true);
  assert.deepEqual([...config.ALLOWED_EXTENSIONS], ['.png', '.webp']);
});
