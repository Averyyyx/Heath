const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, dialog, nativeTheme, Notification } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { compareReleaseVersions } = require('./lib/version');
const { parseHearthDeepLink } = require('./lib/deeplink');
const brand = require('../shared/brand');
const { migrateLegacyUserData } = require('./legacy-migration');

// Windows связывает иконку окна и ярлык с этим ID. Задаём до app.whenReady(),
// иначе Windows может закрепить процесс под общим значком Electron.
if (process.platform === 'win32') app.setAppUserModelId('com.nexo.app');
app.setName(brand.name);


let mainWindow = null;
let splashWindow = null;
let backgroundUpdateTimer = null;
let pendingUpdateNotice = null;
let queuedDeepLink = null;
let notificationCount = 0;
const SERVER_PORT = process.env.PORT || 4000;

// ВАЖНО: Electron должен всегда использовать локальный сервер
// Используем 127.0.0.1 для стабильности
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

const { createApplicationPaths } = require('./paths');
const appPaths = createApplicationPaths({ app, path, process, mainDirectory: __dirname });
const { createSecretsService } = require('./secrets');
const { isDevAccountEnabled, getOrCreateSecrets } = createSecretsService({ app, fs, path, crypto, process });
const { createServerProcessService } = require('./server-process');
const serverService = createServerProcessService({
  app,
  path,
  fs,
  fork: require('child_process').fork,
  http,
  process,
  paths: appPaths,
  serverPort: SERVER_PORT,
  serverUrl: SERVER_URL,
  getOrCreateSecrets,
  isDevAccountEnabled
});

const { setupLogging } = require('./lib/logging');

const { createUpdaterPreferences } = require('./updater/preferences');
const { createUpdateDownloader } = require('./updater/download');
const { createUpdateInstaller } = require('./updater/install');
const { createUpdaterService } = require('./updater');
const { createDeepLinkService } = require('./deeplink');
const { createSplashWindow: buildSplashWindow } = require('./windows/splash-window');
const { createMainWindow: buildMainWindow } = require('./windows/main-window');
const { createIpcService } = require('./ipc');
const { createTrayService } = require('./tray');
const { createIconService } = require('./lib/icons');
const {
  getIconsDir,
  getDesktopIconPath,
  getIconPath,
  ensureDesktopShortcut,
  getTrayIconPath,
  createTrayImage,
  createTaskbarOverlay
} = createIconService({
  app,
  path,
  fs,
  nativeImage,
  shell,
  process,
  devResourcesDir: appPaths.resourcesDirectory,
  getNotificationCount: () => notificationCount
});

// IPC handlers (will be registered inside app.whenReady)
const deepLinkService = createDeepLinkService({
  parseDeepLink: parseHearthDeepLink,
  getMainWindow: () => mainWindow,
  serverUrl: SERVER_URL,
  getQueuedDeepLink: () => queuedDeepLink,
  setQueuedDeepLink: (value) => { queuedDeepLink = value; }
});
const { dispatchDeepLink } = deepLinkService;

const updaterState = { skipUpdateRequested: false };
let sendUpdaterStatus = () => {};
const updatePreferences = createUpdaterPreferences({ app, fs, path });
const updateDownloader = createUpdateDownloader({
  app, brand, fs, path, crypto: require('crypto'), fetch,
  Readable: require('stream').Readable,
  Transform: require('stream').Transform,
  pipeline: require('stream/promises').pipeline,
  isSkipUpdateRequested: () => updaterState.skipUpdateRequested,
  sendUpdateStatus: (...args) => sendUpdaterStatus(...args)
});
const updateInstaller = createUpdateInstaller({
  app, spawn: require('child_process').spawn, dialog,
  getMainWindow: () => mainWindow,
  sendUpdateStatus: (...args) => sendUpdaterStatus(...args)
});
const updaterService = createUpdaterService({
  app, fetch, compareReleaseVersions, brand,
  preferences: updatePreferences,
  downloader: updateDownloader,
  installer: updateInstaller,
  getMainWindow: () => mainWindow,
  getSplashWindow: () => splashWindow,
  setPendingUpdateNotice: (value) => { pendingUpdateNotice = value; },
  state: updaterState
});
sendUpdaterStatus = updaterService.sendUpdateStatus;
const { checkForUpdates, getUpdatePreferences, setUpdatePreferences, skipUpdate } = updaterService;

const trayService = createTrayService({
  app, Tray, Menu, nativeImage,
  getMainWindow: () => mainWindow,
  checkForUpdates,
  createTrayImage, getIconPath, createTaskbarOverlay,
  process,
  getNotificationCount: () => notificationCount,
  setNotificationCountState: (value) => { notificationCount = value; }
});
const { createTray, setNotificationCount } = trayService;

function createSplashWindow() {
  splashWindow = buildSplashWindow({
    BrowserWindow, nativeImage, process,
    getDesktopIconPath,
    preloadPath: appPaths.splashPreload,
    splashHtml: appPaths.splashHtml,
    app,
    onClosed: () => { splashWindow = null; }
  });
}

function createWindow() {
  mainWindow = buildMainWindow({
    BrowserWindow, nativeImage, process,
    getDesktopIconPath,
    preloadPath: appPaths.mainPreload,
    serverUrl: SERVER_URL,
    app, shell,
    dispatchDeepLink,
    getPendingUpdateNotice: () => pendingUpdateNotice,
    onClosed: () => { mainWindow = null; }
  });
}

const { setupIPCHandlers } = createIpcService({
  ipcMain, app,
  getMainWindow: () => mainWindow,
  setNotificationCount,
  Notification, getDesktopIconPath,
  dispatchDeepLink: (url) => dispatchDeepLink(url),
  checkForUpdates,
  getUpdatePreferences, setUpdatePreferences,
  shell, path, nativeTheme,
  skipUpdate
});

// Только один экземпляр: второй запуск иначе упёрся бы в занятый порт сервера (EADDRINUSE)
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = commandLine.find((argument) => argument.startsWith('hearth://'));
    if (deepLink) dispatchDeepLink(deepLink);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('open-url', (event, url) => { event.preventDefault(); dispatchDeepLink(url); });
}

// Инициализация приложения Electron
app.whenReady().then(async () => {
  // Migrate the previous user profile before any service or window uses userData.
  app.setPath('userData', migrateLegacyUserData({ appDataPath: app.getPath('appData'), fs, path, logger: console }));

  if (!gotSingleInstanceLock) {
    return;
  }

  // Регистрируем hearth:// для ссылок на сообщения.
  try { app.setAsDefaultProtocolClient('hearth'); } catch (error) { console.warn('Не удалось зарегистрировать hearth://:', error.message); }

  const startupDeepLink = process.argv.find((argument) => argument.startsWith('hearth://'));
  if (startupDeepLink) dispatchDeepLink(startupDeepLink);

  // Инициализируем логирование после того, как app готов
  setupLogging({ app, fs, path, console, process });
  ensureDesktopShortcut();
  
  // Регистрируем IPC handlers
  setupIPCHandlers();
  
  try {
    console.log('=== Hearth Electron App Starting ===');
    console.log('App path:', app.getAppPath());
    console.log('User data:', app.getPath('userData'));
    console.log('Is packaged:', app.isPackaged);
    console.log('Node version:', process.version);
    console.log('Platform:', process.platform);
    console.log('Server URL:', SERVER_URL);
    console.log('Server Port:', SERVER_PORT);
    
    // Сначала создаем splash screen
    createSplashWindow();
    
    // Проверяем обновления на splash до запуска встроенного сервера.
    const startupUpdateTask = checkForUpdates({ interactive: false, startup: true });

    // Затем запускаем сервер, сохраняя последовательность старта из задания.
    console.log('Starting embedded server...');
    if (splashWindow) {
      splashWindow.webContents.send('loading-status', 'Запуск сервера...');
    }
    serverService.startServer();
    
    // Ждем, пока сервер станет доступен
    console.log('Waiting for server to be ready...');
    if (splashWindow) {
      splashWindow.webContents.send('loading-status', 'Ожидание сервера...');
    }
    await serverService.waitForServer();
    serverService.markReady();
    console.log('Server is ready!');
    const startupUpdateResult = await startupUpdateTask;
    if (startupUpdateResult?.status === 'installing' || app.isQuitting) return;
    
    // Создаем system tray
    createTray();
    
    // Создаем главное окно только после того, как сервер готов
    console.log('Creating main window...');
    if (splashWindow) {
      splashWindow.webContents.send('loading-status', 'Загрузка интерфейса...');
    }
    createWindow();
    
    // Когда главное окно готово, закрываем splash screen
    // Окно показывает/открывает DevTools обработчик в createWindow; здесь только закрываем splash
    mainWindow.once('ready-to-show', () => {
      console.log('Main window ready, closing splash...');
      if (splashWindow) splashWindow.close();
      if (!backgroundUpdateTimer && app.isPackaged) {
        backgroundUpdateTimer = setInterval(() => { void checkForUpdates({ interactive: false, startup: false }); }, 6 * 60 * 60 * 1000);
        backgroundUpdateTimer.unref?.();
      }
    });
    
    console.log('=== Hearth Started Successfully ===');
  } catch (error) {
    console.error('=== Hearth Failed to Start ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Показываем ошибку пользователю
    const errorHtml = `
      <html>
        <head><title>Hearth Error</title></head>
        <body style="background: #1e1e1e; color: white; font-family: sans-serif; padding: 40px;">
          <h1 style="color: #ff6b6b;">Hearth Failed to Start</h1>
          <p><strong>Error:</strong> ${String(error.message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <p><strong>Server URL:</strong> ${SERVER_URL}</p>
          <p><strong>Is Packaged:</strong> ${app.isPackaged}</p>
          <p>Please check the console logs for more details.</p>
          <p>The application will close in 10 seconds.</p>
        </body>
      </html>
    `;
    
    const errorWindow = new BrowserWindow({
      width: 600,
      height: 400,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    errorWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml));
    
    setTimeout(() => {
      app.quit();
    }, 10000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Не закрываем приложение когда все окна закрыты - оно работает в фоне
  console.log('All windows closed, keeping app running in background');
});

app.on('before-quit', () => {
  // Без этого флага обработчик 'close' окна отменяет закрытие (прячет в трей),
  // и приложение не завершается при выходе из меню, перезагрузке или выключении системы.
  app.isQuitting = true;
  serverService.stop();
});

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('hearth', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('hearth');
}