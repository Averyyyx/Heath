'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDevAccountSeeder } = require('../src/server/services/dev-account');

function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-dev-account-'));
  const calls = [];
  const user = { id: 7, username: 'hearthdev', password_hash: 'stored-hash' };
  const dependencies = {
    process: { env: {} },
    path,
    fs,
    dataDir: root,
    REQUIRE_HTTPS: false,
    isDesktop: true,
    selectUserByEmail: { get: () => null },
    insertUser: { run: (...args) => { calls.push(['insertUser', ...args]); return { lastInsertRowid: 7 }; } },
    bcrypt: {
      hashSync: (password, rounds) => `hash:${password}:${rounds}`,
      compareSync: (password, hash) => hash === `hash:${password}:12`
    },
    generateHandleFromEmail: (email) => email.split('@')[0],
    selectUserById: { get: () => user },
    markProfile: { run: (...args) => calls.push(['markProfile', ...args]) },
    updatePasswordHash: { run: (...args) => calls.push(['updatePasswordHash', ...args]) },
    getUserSettings: () => ({ theme: 'dark', accent: 'terracotta', background_url: '', reduce_motion: false, badges: ['early'] }),
    updateUserSettings: { run: (...args) => calls.push(['updateUserSettings', ...args]) },
    selectPremiumPlanBySlug: { get: () => ({ id: 2 }) },
    db: {
      prepare: () => ({
        get: () => null,
        run: (...args) => calls.push(['premiumSubscription', ...args])
      })
    },
    logger: { log: (...args) => calls.push(['log', ...args]), warn: (...args) => calls.push(['warn', ...args]) },
    ...overrides
  };
  return { root, calls, user, service: createDevAccountSeeder(dependencies), dependencies };
}

test('does not create a developer account unless the explicit flag is enabled', () => {
  const f = fixture();
  try {
    assert.equal(f.service.seedDevAccount(), false);
    assert.equal(f.calls.length, 0);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('never seeds a developer account on a public HTTPS deployment', () => {
  const f = fixture({
    process: { env: { HEARTH_DEV_ACCOUNT: 'true', CLIENT_ORIGIN: 'https://example.com' } },
    isDesktop: false,
    REQUIRE_HTTPS: true
  });
  try {
    assert.equal(f.service.seedDevAccount(), false);
    assert.equal(f.calls[0][0], 'warn');
    assert.equal(f.calls.some((call) => call[0] === 'insertUser'), false);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('creates a local developer account, applies badges and grants a developer subscription', () => {
  const f = fixture({
    process: { env: {
      HEARTH_DEV_ACCOUNT: 'true',
      HEARTH_DEV_EMAIL: 'Dev@Hearth.Local',
      HEARTH_DEV_PASSWORD: 'temporary-test-password'
    } }
  });
  try {
    assert.equal(f.service.seedDevAccount(), true);
    const insert = f.calls.find((call) => call[0] === 'insertUser');
    assert.equal(insert[1], 'dev@hearth.local');
    assert.equal(insert[2], 'dev');
    assert.equal(insert[3], 'hash:temporary-test-password:12');
    const profile = f.calls.find((call) => call[0] === 'markProfile');
    assert.equal(profile[1], 'Hearth Dev');
    const settings = f.calls.find((call) => call[0] === 'updateUserSettings');
    assert.deepEqual(JSON.parse(settings[5]), ['early', 'dev', 'premium']);
    const subscription = f.calls.find((call) => call[0] === 'premiumSubscription');
    assert.deepEqual(JSON.parse(subscription[3]), { dev: true });
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
