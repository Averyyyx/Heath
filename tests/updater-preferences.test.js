'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdaterPreferences } = require('../src/main/updater/preferences');

test('uses automatic downloads by default and persists the explicit preference', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-updater-preferences-'));
  try {
    const service = createUpdaterPreferences({
      app: { getPath: () => root },
      fs,
      path
    });
    assert.deepEqual(service.getUpdatePreferences(), { autoDownload: true });
    assert.deepEqual(service.setUpdatePreferences({ autoDownload: false }), { autoDownload: false });
    assert.deepEqual(service.getUpdatePreferences(), { autoDownload: false });
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(root, 'update-preferences.json'), 'utf8')),
      { autoDownload: false }
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
