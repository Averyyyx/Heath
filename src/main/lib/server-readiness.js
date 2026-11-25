'use strict';

function createServerReadiness({ http, serverUrl, getServerProcess, setTimeoutFn = setTimeout }) {
  function waitForServer(maxAttempts = 60, intervalMs = 500) {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const isServerAlive = () => {
        const serverProcess = getServerProcess();
        return serverProcess && !serverProcess.killed && serverProcess.exitCode === null;
      };

      const checkServerHealth = () => {
        if (!isServerAlive()) {
          reject(new Error('Server process died before becoming ready'));
          return;
        }

        attempts += 1;
        let settled = false;
        const retry = (reason) => {
          if (settled) return;
          settled = true;
          if (attempts >= maxAttempts) {
            reject(new Error('Server failed to start (' + reason + ')'));
            return;
          }
          setTimeoutFn(checkServerHealth, intervalMs);
        };

        const req = http.get(serverUrl + '/api/security/csrf-token', (res) => {
          res.resume();
          if (settled) return;
          settled = true;
          setTimeoutFn(() => {
            if (!isServerAlive()) {
              reject(new Error('Server process died immediately after opening port'));
              return;
            }
            resolve();
          }, 1000);
        });
        req.on('error', () => retry('connection error'));
        req.setTimeout(1000, () => {
          req.destroy();
          retry('timeout');
        });
      };

      checkServerHealth();
    });
  }

  return { waitForServer };
}

module.exports = { createServerReadiness };
