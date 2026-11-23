'use strict';

function createDeepLinkService({
  parseDeepLink,
  getMainWindow,
  serverUrl,
  getQueuedDeepLink,
  setQueuedDeepLink,
  logger = console
}) {
  function dispatchDeepLink(rawUrl) {
    const payload = parseDeepLink(rawUrl);
    if (!payload) return false;
    try {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.getURL().startsWith(serverUrl)) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('deep-link', payload);
      } else {
        setQueuedDeepLink(payload);
      }
      return true;
    } catch (error) {
      logger.warn('Failed to dispatch Hearth deep link:', error.message);
      return false;
    }
  }

  return { dispatchDeepLink };
}

module.exports = { createDeepLinkService };
