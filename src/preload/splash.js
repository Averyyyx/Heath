const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hearthSplash', {
  onLoadingStatus: (callback) => ipcRenderer.on('loading-status', (_event, value) => callback(value)),
  onAppVersion: (callback) => ipcRenderer.on('app-version', (_event, value) => callback(value)),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, value) => callback(value)),
  skipUpdate: () => ipcRenderer.send('skip-update')
});
