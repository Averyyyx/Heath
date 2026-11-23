'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeepLinkService } = require('../src/main/deeplink');

test('queues a valid Hearth deep link until the main window is available', () => {
  let queued = null;
  const service = createDeepLinkService({
    parseDeepLink: (url) => url === 'hearth://conversation/1' ? { conversationId: '1' } : null,
    getMainWindow: () => null,
    serverUrl: 'http://127.0.0.1:4000',
    getQueuedDeepLink: () => queued,
    setQueuedDeepLink: (value) => { queued = value; }
  });
  assert.equal(service.dispatchDeepLink('hearth://conversation/1'), true);
  assert.deepEqual(queued, { conversationId: '1' });
  assert.equal(service.dispatchDeepLink('invalid:'), false);
  assert.deepEqual(queued, { conversationId: '1' });
});

test('restores and focuses the app before dispatching a deep link to its renderer', () => {
  const calls = [];
  const mainWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    webContents: {
      getURL: () => 'http://127.0.0.1:4000/',
      send: (...args) => calls.push(args)
    }
  };
  const service = createDeepLinkService({
    parseDeepLink: () => ({ conversationId: '7' }),
    getMainWindow: () => mainWindow,
    serverUrl: 'http://127.0.0.1:4000',
    getQueuedDeepLink() { throw new Error('Should not queue when renderer is ready'); },
    setQueuedDeepLink() { throw new Error('Should not queue when renderer is ready'); }
  });
  assert.equal(service.dispatchDeepLink('hearth://conversation/7'), true);
  assert.deepEqual(calls, ['restore', 'show', 'focus', ['deep-link', { conversationId: '7' }]]);
});
