'use strict';

function createMainWindow({
  BrowserWindow,
  nativeImage,
  process,
  getDesktopIconPath,
  preloadPath,
  serverUrl,
  app,
  shell,
  dispatchDeepLink,
  getPendingUpdateNotice,
  onClosed
}) {
  console.log('Creating main window...');
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#262624', symbolColor: '#ECE9E3', height: 34 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: preloadPath
    },
    title: 'Hearth',
    show: false,
    backgroundColor: '#0D0A1A',
    icon: getDesktopIconPath()
  });

  if (process.platform === 'win32') {
    const desktopIcon = nativeImage.createFromPath(getDesktopIconPath());
    if (!desktopIcon.isEmpty()) mainWindow.setIcon(desktopIcon);
  }

  mainWindow.webContents.on('did-finish-load', () => {
    const pendingUpdateNotice = getPendingUpdateNotice();
    if (pendingUpdateNotice) mainWindow.webContents.send('update-status', pendingUpdateNotice);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${level}: ${message}`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
  });

  console.log('Loading URL:', serverUrl);
  mainWindow.loadURL(serverUrl)
    .then(() => {
      console.log('URL loaded successfully');
    })
    .catch((loadErr) => {
      console.error('Failed to load URL:', loadErr);
      const safeMessage = String(loadErr.message || loadErr)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <html>
          <head><title>Hearth Error</title></head>
          <body style="background: #1e1e1e; color: white; font-family: sans-serif; padding: 20px;">
            <h1>Hearth Failed to Start</h1>
            <p>Could not load the application. Error: ${safeMessage}</p>
            <p>Server URL: ${serverUrl}</p>
            <p>Please check the log file in the Hearth user data folder for more details.</p>
          </body>
        </html>
      `));
    });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    console.log('Main window closed');
    onClosed();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('Window hidden to tray');
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'hearth:') dispatchDeepLink(url);
      else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') void shell.openExternal(url);
    } catch { /* malformed URLs are denied */ }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(serverUrl)) return;
    event.preventDefault();
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'hearth:') dispatchDeepLink(url);
      else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') void shell.openExternal(url);
    } catch { /* malformed URLs are denied */ }
  });

  return mainWindow;
}

module.exports = { createMainWindow };
