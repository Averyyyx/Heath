'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServerReadiness } = require('./server-readiness');

test('server readiness resolves after the health endpoint responds while process stays alive', async () => {
  const processState = { killed: false, exitCode: null };
  const http = { get: (_url, callback) => {
    callback({ resume() {} });
    return { on() {}, setTimeout() {}, destroy() {} };
  } };
  const readiness = createServerReadiness({
    http, serverUrl: 'http://127.0.0.1:4000', getServerProcess: () => processState,
    setTimeoutFn: (callback) => callback()
  });
  await readiness.waitForServer(2, 1);
});

test('server readiness rejects immediately if the child process is already dead', async () => {
  const readiness = createServerReadiness({
    http: { get: () => { throw new Error('should not request'); } },
    serverUrl: 'http://127.0.0.1:4000',
    getServerProcess: () => ({ killed: true, exitCode: 1 })
  });
  await assert.rejects(readiness.waitForServer(), /process died before becoming ready/);
});

test('server readiness retries failed connections and respects the attempt limit', async () => {
  let requests = 0;
  const processState = { killed: false, exitCode: null };
  const http = {
    get: (_url, _callback) => {
      requests += 1;
      return {
        on(event, callback) { if (event === 'error') callback(new Error('offline')); },
        setTimeout() {},
        destroy() {}
      };
    }
  };
  const readiness = createServerReadiness({
    http, serverUrl: 'http://127.0.0.1:4000', getServerProcess: () => processState,
    setTimeoutFn: (callback) => callback()
  });
  await assert.rejects(readiness.waitForServer(3, 1), /Server failed to start/);
  assert.equal(requests, 3);
});
