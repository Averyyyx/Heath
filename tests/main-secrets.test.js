'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSecretsService } = require('../src/main/secrets');

test('creates strong desktop secrets once and reuses them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-secrets-'));
  const app = { isPackaged: true, getPath: () => root };
  const service = createSecretsService({ app, fs, path, crypto, process });
  try {
    const first = service.getOrCreateSecrets();
    assert.equal(first.SESSION_SECRET.length, 96);
    assert.equal(first.JWT_SECRET.length, 96);
    assert.notEqual(first.SESSION_SECRET, first.JWT_SECRET);
    const second = service.getOrCreateSecrets();
    assert.deepEqual(second, first);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'secrets.json'), 'utf8')), first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('respects explicit developer-account environment flags and packaged opt-in file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-dev-account-'));
  const app = { isPackaged: true, getPath: () => root };
  const saved = process.env.HEARTH_DEV_ACCOUNT;
  try {
    const service = createSecretsService({ app, fs, path, crypto, process });
    delete process.env.HEARTH_DEV_ACCOUNT;
    assert.equal(service.isDevAccountEnabled(), false);
    fs.writeFileSync(path.join(root, 'dev-account.enabled'), '1');
    assert.equal(service.isDevAccountEnabled(), true);
    process.env.HEARTH_DEV_ACCOUNT = 'false';
    assert.equal(service.isDevAccountEnabled(), false);
    process.env.HEARTH_DEV_ACCOUNT = 'true';
    assert.equal(service.isDevAccountEnabled(), true);
  } finally {
    if (saved === undefined) delete process.env.HEARTH_DEV_ACCOUNT;
    else process.env.HEARTH_DEV_ACCOUNT = saved;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
