'use strict';

function createIconService({ app, path, fs, nativeImage, shell, process, devResourcesDir, getNotificationCount }) {
  function getIconsDir() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'resources')
      : devResourcesDir;
  }

  function getDesktopIconPath() {
    const iconPath = path.join(getIconsDir(), 'icon.ico');
    if (fs.existsSync(iconPath)) {
      const ico = nativeImage.createFromPath(iconPath);
      if (!ico.isEmpty()) return iconPath;
      console.warn('Hearth ICO is unreadable; falling back to the PNG app icon:', iconPath);
    }

    const pngPath = getIconPath('icon', 256);
    if (fs.existsSync(pngPath)) {
      const png = nativeImage.createFromPath(pngPath);
      if (!png.isEmpty()) return pngPath;
    }
    console.error('No readable Hearth application icon was found.');
    return iconPath;
  }

  function getIconPath(iconName, size = 256) {
    const dir = getIconsDir();
    const candidates = [
      iconName + '-' + size + '.png',
      iconName + '.png',
      iconName + '-256.png',
      iconName + '-128.png',
      iconName + '-64.png',
      iconName + '-48.png',
      iconName + '-32.png',
      iconName + '-16.png'
    ];
    for (const file of candidates) {
      const candidate = path.join(dir, file);
      if (fs.existsSync(candidate)) return candidate;
    }
    return path.join(dir, iconName + '-' + size + '.png');
  }

  function ensureDesktopShortcut() {
    if (process.platform !== 'win32' || !app.isPackaged) return;
    const shortcutPath = path.join(app.getPath('desktop'), 'Hearth.lnk');
    try {
      const shortcutAction = fs.existsSync(shortcutPath) ? 'update' : 'create';
      const created = shell.writeShortcutLink(shortcutPath, shortcutAction, {
        target: process.execPath,
        args: [],
        cwd: path.dirname(process.execPath),
        description: 'Hearth — рабочее пространство для общения и совместной работы',
        icon: getDesktopIconPath(),
        iconIndex: 0
      });
      if (created) console.log('Desktop shortcut created:', shortcutPath);
      else console.warn('Windows did not create the Hearth desktop shortcut.');
    } catch (error) {
      console.warn('Could not create Hearth desktop shortcut:', error.message);
    }
  }

  function getTrayIconPath(count = getNotificationCount()) {
    const fileName = count > 0 ? 'tray-' + Math.min(9, count) + '-32.png' : 'tray-32.png';
    return path.join(getIconsDir(), fileName);
  }

  function createTrayImage(count = getNotificationCount()) {
    const iconPath = getTrayIconPath(count);
    if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
    return nativeImage.createEmpty();
  }

  function createTaskbarOverlay(count) {
    if (!count) return null;
    const overlayPath = path.join(getIconsDir(), 'taskbar-badge-' + Math.min(9, count) + '.png');
    if (!fs.existsSync(overlayPath)) return null;
    return nativeImage.createFromPath(overlayPath);
  }

  return { getIconsDir, getDesktopIconPath, getIconPath, ensureDesktopShortcut, getTrayIconPath, createTrayImage, createTaskbarOverlay };
}

module.exports = { createIconService };
