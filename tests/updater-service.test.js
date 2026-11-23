'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdaterService } = require('../src/main/updater');

function makeWindow() {
  const sent = [];
  return {
    sent,
    isDestroyed: () => false,
    webContents: { send: (...args) => sent.push(args) }
  };
}

test('skips network updates in development and reports the status to both windows', async () => {
  const mainWindow = makeWindow();
  const splashWindow = makeWindow();
  const statuses = [];
  const service = createUpdaterService({
    app: { isPackaged: false },
    brand: { name: 'Hearth', userAgent: 'Hearth-Desktop', repo: { owner: 'Averyyyx', name: 'Hearth' } },
    fetch: async () => { throw new Error('must not call network'); },
    compareReleaseVersions() {},
    preferences: { getUpdatePreferences: () => ({ autoDownload: true }), setUpdatePreferences() {} },
    downloader: { readExpectedSha256() {}, downloadAndVerifyUpdate() {}, abortDownload() {} },
    installer: { installUpdate() {} },
    getMainWindow: () => mainWindow,
    getSplashWindow: () => splashWindow,
    setPendingUpdateNotice: (value) => statuses.push(value),
    state: { skipUpdateRequested: false }
  });
  const result = await service.checkForUpdates();
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(mainWindow.sent[0], ['update-status', {
    status: 'development',
    message: 'Режим разработки — проверка обновлений пропущена.'
  }]);
  assert.deepEqual(splashWindow.sent, mainWindow.sent);
});

test('reports current version when no public prerelease is available', async () => {
  const mainWindow = makeWindow();
  const pending = [];
  const service = createUpdaterService({
    app: { isPackaged: true, getVersion: () => '0.0.9-alpha' },
    brand: { name: 'Hearth', userAgent: 'Hearth-Desktop', repo: { owner: 'Averyyyx', name: 'Hearth' } },
    fetch: async () => ({ ok: true, json: async () => [] }),
    compareReleaseVersions: () => 0,
    preferences: { getUpdatePreferences: () => ({ autoDownload: true }), setUpdatePreferences() {} },
    downloader: { readExpectedSha256() {}, downloadAndVerifyUpdate() {}, abortDownload() {} },
    installer: { installUpdate() {} },
    getMainWindow: () => mainWindow,
    getSplashWindow: () => null,
    setPendingUpdateNotice: (value) => pending.push(value),
    state: { skipUpdateRequested: false }
  });
  const result = await service.checkForUpdates();
  assert.equal(result.status, 'up-to-date');
  assert.equal(mainWindow.sent.at(-1)[1].status, 'up-to-date');
  assert.equal(pending.at(-1), null);
});

test('respects the disabled automatic-download preference for an available prerelease', async () => {
  const downloads = [];
  const mainWindow = makeWindow();
  const state = { skipUpdateRequested: false };
  const service = createUpdaterService({
    app: { isPackaged: true, getVersion: () => '0.0.8-alpha' },
    brand: { name: 'Hearth', userAgent: 'Hearth-Desktop', repo: { owner: 'Averyyyx', name: 'Hearth' } },
    fetch: async () => ({
      ok: true,
      json: async () => [{
        draft: false,
        prerelease: true,
        tag_name: 'v0.0.9-alpha',
        body: 'Release notes',
        assets: [{ name: 'Hearth-0.0.9-Setup.exe', size: 1024, browser_download_url: 'https://example.invalid/setup.exe' }]
      }]
    }),
    compareReleaseVersions: (left, right) => left === right ? 0 : 1,
    preferences: { getUpdatePreferences: () => ({ autoDownload: false }), setUpdatePreferences() {} },
    downloader: {
      readExpectedSha256: async () => { downloads.push('hash'); return 'hash'; },
      downloadAndVerifyUpdate: async () => { downloads.push('download'); return '/tmp/setup.exe'; },
      abortDownload() {}
    },
    installer: { installUpdate: async () => { downloads.push('install'); } },
    getMainWindow: () => mainWindow,
    getSplashWindow: () => null,
    setPendingUpdateNotice() {},
    state
  });
  const result = await service.checkForUpdates({ interactive: false, startup: true });
  assert.equal(result.status, 'available');
  assert.equal(result.version, '0.0.9-alpha');
  assert.deepEqual(downloads, []);
  assert.equal(state.skipUpdateRequested, false);
});
