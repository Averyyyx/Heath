'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createServerProcessService } = require('../src/main/server-process');

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 1234;
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

test('starts the embedded server with the Electron runtime and the Hearth data paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-server-process-'));
  const userData = path.join(root, 'profile');
  const serverPath = path.join(root, 'src', 'server', 'index.js');
  fs.mkdirSync(path.dirname(serverPath), { recursive: true });
  fs.writeFileSync(serverPath, '');
  const child = makeChild();
  let forkArgs;
  const service = createServerProcessService({
    app: { isQuitting: false, getPath: () => userData, isPackaged: false },
    path,
    fs,
    fork: (...args) => { forkArgs = args; return child; },
    http: {},
    process: { execPath: '/runtime/electron.exe', env: { PATH: 'runtime-path' } },
    paths: { serverPath, serverWorkingDirectory: root },
    serverPort: 4000,
    serverUrl: 'http://127.0.0.1:4000',
    getOrCreateSecrets: () => ({ SESSION_SECRET: 'session-secret', JWT_SECRET: 'jwt-secret' }),
    isDevAccountEnabled: () => true
  });

  try {
    service.startServer();
    assert.equal(forkArgs[0], serverPath);
    assert.deepEqual(forkArgs[1], []);
    const options = forkArgs[2];
    assert.equal(options.cwd, root);
    assert.equal(options.execPath, '/runtime/electron.exe');
    assert.equal(options.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(options.env.ELECTRON_DESKTOP, '1');
    assert.equal(options.env.USE_MEMORY_SESSION, 'true');
    assert.equal(options.env.PORT, '4000');
    assert.equal(options.env.HOST, '127.0.0.1');
    assert.equal(options.env.CLIENT_ORIGIN, 'http://127.0.0.1:4000');
    assert.equal(options.env.SESSION_SECRET, 'session-secret');
    assert.equal(options.env.JWT_SECRET, 'jwt-secret');
    assert.equal(options.env.DATA_DIR, path.join(userData, 'data'));
    assert.equal(options.env.DB_PATH, path.join(userData, 'data', 'hearth.db'));
    assert.equal(options.env.HEARTH_DEV_ACCOUNT, 'true');
    assert.equal(fs.existsSync(path.join(userData, 'data', 'uploads')), true);
    assert.equal(fs.existsSync(path.join(userData, 'data', 'tmp')), true);
    service.stop();
    assert.equal(child.killed, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
