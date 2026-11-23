'use strict';

function setupLogging({ app, fs, path, consoleRef = console, processRef = process }) {
  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'main.log');

  function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = '[' + timestamp + '] ' + message + '\n';
    try { fs.appendFileSync(logFile, logMessage); } catch {}
  }

  const originalConsoleLog = consoleRef.log;
  consoleRef.log = (...args) => {
    originalConsoleLog(...args);
    logToFile(args.join(' '));
  };

  const originalConsoleError = consoleRef.error;
  consoleRef.error = (...args) => {
    originalConsoleError(...args);
    logToFile('ERROR: ' + args.join(' '));
  };

  consoleRef.log('=== Hearth Electron Process Starting ===');
  consoleRef.log('Process ID:', processRef.pid);
  consoleRef.log('Exec Path:', processRef.execPath);
  consoleRef.log('App Path:', app.getAppPath());
  consoleRef.log('User Data:', app.getPath('userData'));
  consoleRef.log('Log File:', logFile);

  return { logDir, logFile };
}

module.exports = { setupLogging };
