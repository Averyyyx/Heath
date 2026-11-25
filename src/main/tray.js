'use strict';

function createTrayService({
  app,
  Tray,
  Menu,
  nativeImage,
  getMainWindow,
  checkForUpdates,
  createTrayImage,
  getIconPath,
  createTaskbarOverlay,
  process,
  getNotificationCount,
  setNotificationCountState
}) {
  let tray = null;

  function createTray() {
    console.log('Creating system tray...');
    tray = new Tray(createTrayImage(getNotificationCount()));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Hearth',
        icon: nativeImage.createFromPath(getIconPath('icon', 16)),
        click: () => {
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Проверить обновления',
        click: () => {
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
          checkForUpdates({ interactive: true });
        }
      },
      {
        label: 'О программе',
        click: () => {
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Hearth');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    console.log('System tray created');
  }

  function updateTrayIcon() {
    if (!tray) return;
    const count = getNotificationCount();
    tray.setImage(createTrayImage(count));
    tray.setToolTip(count > 0 ? `Hearth · ${count} уведомлений` : 'Hearth');
  }

  function setNotificationCount(count) {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
    const boundedCount = Math.min(safeCount, 9);
    setNotificationCountState(boundedCount);
    updateTrayIcon();

    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      mainWindow.setOverlayIcon(
        createTaskbarOverlay(boundedCount),
        boundedCount > 0 ? `${boundedCount} непрочитанных уведомлений` : ''
      );
    }
  }

  return { createTray, updateTrayIcon, setNotificationCount };
}

module.exports = { createTrayService };
