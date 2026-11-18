const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexoAPI', {
  setNotificationCount: (count) => ipcRenderer.send('set-notification-count', count),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  setWindowTheme: (theme) => ipcRenderer.send('set-window-theme', theme),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, payload) => callback(payload)),
  onNotificationUpdate: (callback) => ipcRenderer.on('notification-updated', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
