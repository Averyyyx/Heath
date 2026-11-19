const { contextBridge, ipcRenderer } = require('electron');
let pendingDeepLink = null;
ipcRenderer.on('deep-link', (_event, payload) => { pendingDeepLink = payload; });

contextBridge.exposeInMainWorld('nexoAPI', {
  setNotificationCount: (count) => ipcRenderer.send('set-notification-count', count),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  setWindowTheme: (theme) => ipcRenderer.send('set-window-theme', theme),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUpdatePreferences: () => ipcRenderer.invoke('get-update-preferences'),
  setUpdatePreferences: (preferences) => ipcRenderer.send('set-update-preferences', preferences),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  onDeepLink: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('deep-link', listener);
    if (pendingDeepLink) { const payload = pendingDeepLink; pendingDeepLink = null; callback(payload); }
    return () => ipcRenderer.removeListener('deep-link', listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  onNotificationUpdate: (callback) => ipcRenderer.on('notification-updated', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
