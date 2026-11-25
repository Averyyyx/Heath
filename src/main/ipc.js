'use strict';

function createIpcService({
  ipcMain,
  app,
  getMainWindow,
  setNotificationCount,
  Notification,
  getDesktopIconPath,
  dispatchDeepLink,
  checkForUpdates,
  getUpdatePreferences,
  setUpdatePreferences,
  shell,
  path,
  nativeTheme,
  skipUpdate
}) {
  function setupIPCHandlers() {
    ipcMain.on('set-notification-count', (_event, count) => {
      setNotificationCount(count);
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('notification-updated', count);
    });

    ipcMain.on('minimize-window', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('maximize-window', () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    });

    ipcMain.on('close-window', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.close();
    });

    ipcMain.handle('show-system-notification', (_event, payload = {}) => {
      if (!Notification.isSupported()) return false;
      const title = String(payload.title || 'Hearth').slice(0, 100);
      const body = String(payload.body || '').slice(0, 240);
      const notification = new Notification({ title, body, icon: getDesktopIconPath(), silent: true });
      if (typeof payload.deepLink === 'string' && payload.deepLink.startsWith('hearth://')) {
        notification.on('click', () => dispatchDeepLink(payload.deepLink));
      }
      notification.show();
      return true;
    });

    ipcMain.handle('get-app-version', () => app.getVersion());
    ipcMain.handle('check-for-updates', () => checkForUpdates({ interactive: true }));
    ipcMain.handle('get-update-preferences', () => getUpdatePreferences());
    ipcMain.on('set-update-preferences', (_event, value) => { setUpdatePreferences(value); });
    ipcMain.handle('open-logs', async () => {
      await shell.openPath(path.join(app.getPath('userData'), 'logs'));
      return true;
    });
    ipcMain.on('skip-update', () => skipUpdate());
    ipcMain.on('set-window-theme', (_event, theme) => {
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
      mainWindow.setTitleBarOverlay({
        color: dark ? '#262624' : '#FAF9F5',
        symbolColor: dark ? '#ECE9E3' : '#262624',
        height: 34
      });
    });
  }

  return { setupIPCHandlers };
}

module.exports = { createIpcService };
