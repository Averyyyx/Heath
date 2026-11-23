'use strict';

function createSplashWindow({
  BrowserWindow,
  nativeImage,
  process,
  getDesktopIconPath,
  preloadPath,
  splashHtml,
  app,
  onClosed
}) {
  console.log('Creating splash window...');
  const splashIconPath = getDesktopIconPath();
  const splashWindow = new BrowserWindow({
    width: 440,
    height: 520,
    resizable: false,
    movable: true,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    },
    show: false,
    backgroundColor: '#262624',
    icon: splashIconPath
  });

  if (process.platform === 'win32') {
    const splashIcon = nativeImage.createFromPath(splashIconPath);
    if (!splashIcon.isEmpty()) splashWindow.setIcon(splashIcon);
    else console.warn('Hearth splash icon could not be loaded:', splashIconPath);
  }

  console.log('Loading splash from:', splashHtml);
  splashWindow.loadFile(splashHtml);

  splashWindow.once('ready-to-show', () => {
    console.log('Splash window ready to show');
    splashWindow.center();
    splashWindow.show();
    splashWindow.webContents.send('app-version', app.getVersion());
  });

  splashWindow.on('closed', () => {
    console.log('Splash window closed');
    onClosed();
  });

  return splashWindow;
}

module.exports = { createSplashWindow };
