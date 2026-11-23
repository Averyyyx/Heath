'use strict';

const { createServerReadiness } = require('./lib/server-readiness');

function createServerProcessService({
  app,
  path,
  fs,
  fork,
  http,
  process,
  paths,
  serverPort,
  serverUrl,
  getOrCreateSecrets,
  isDevAccountEnabled,
  maxRestarts = 5
}) {
  let serverProcess = null;
  let serverReady = false;
  let serverRestarts = 0;

  const { waitForServer } = createServerReadiness({
    http,
    serverUrl,
    getServerProcess: () => serverProcess
  });

  function getServerRuntime() {
    return {
      execPath: process.execPath,
      useElectronAsNode: true
    };
  }

  function startServer() {
    const userDataDir = path.join(app.getPath('userData'), 'data');
    const directories = [
      [userDataDir, 'Created userData directory:'],
      [path.join(userDataDir, 'uploads'), 'Created uploads directory:'],
      [path.join(userDataDir, 'tmp'), 'Created tmp directory:']
    ];
    for (const [directory, label] of directories) {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
        console.log(label, directory);
      }
    }

    const serverPath = paths.serverPath;
    const serverCwd = paths.serverWorkingDirectory;
    const runtime = getServerRuntime();

    console.log('Starting server with:');
    console.log('  serverPath:', serverPath);
    console.log('  serverCwd:', serverCwd);
    console.log('  runtime:', runtime.execPath);
    console.log('  userDataDir:', userDataDir);
    console.log('  PORT:', serverPort);

    if (!fs.existsSync(serverPath)) {
      const error = `Server file not found: ${serverPath}`;
      console.error(error);
      throw new Error(error);
    }

    const secrets = getOrCreateSecrets();
    const child = fork(serverPath, [], {
      cwd: serverCwd,
      execPath: runtime.execPath,
      env: {
        ...process.env,
        ...(runtime.useElectronAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        ELECTRON_DESKTOP: '1',
        USE_MEMORY_SESSION: 'true',
        PORT: String(serverPort),
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        CLIENT_ORIGIN: serverUrl,
        SESSION_SECRET: process.env.SESSION_SECRET || secrets.SESSION_SECRET,
        JWT_SECRET: process.env.JWT_SECRET || secrets.JWT_SECRET,
        DATA_DIR: userDataDir,
        DB_PATH: path.join(userDataDir, 'hearth.db'),
        HEARTH_DEV_ACCOUNT: isDevAccountEnabled() ? 'true' : 'false'
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    serverProcess = child;

    child.on('error', (error) => {
      console.error('Server process error:', error);
    });

    child.on('exit', (code, signal) => {
      console.log(`Server process exited with code ${code} and signal ${signal}`);
      if (serverProcess === child) serverProcess = null;

      const crashed = code !== 0 && signal !== 'SIGTERM';
      if (crashed && serverReady && !app.isQuitting) {
        console.error('Server crashed! Exit code:', code);
        if (serverRestarts < maxRestarts) {
          serverRestarts += 1;
          const delay = 1000 * serverRestarts;
          console.log(`Restarting server in ${delay} ms (attempt ${serverRestarts}/${maxRestarts})`);
          setTimeout(() => {
            if (!app.isQuitting) {
              try {
                startServer();
              } catch (error) {
                console.error('Failed to restart server:', error);
              }
            }
          }, delay);
        } else {
          console.error('Server restart limit reached; giving up.');
        }
      }
    });

    child.stdout?.on('data', (data) => {
      console.log('[Server stdout]', data.toString());
    });

    child.stderr?.on('data', (data) => {
      console.error('[Server stderr]', data.toString());
    });

    console.log('Server process started with PID:', child.pid);
  }

  return {
    startServer,
    waitForServer,
    markReady() { serverReady = true; },
    stop() {
      if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
      }
    },
    getProcess() { return serverProcess; }
  };
}

module.exports = { createServerProcessService };
