'use strict';

function createUpdateInstaller({ app, spawn, dialog, getMainWindow, sendUpdateStatus }) {
  async function installUpdate(installerPath, version, { silent = false } = {}) {
    if (silent) {
      sendUpdateStatus('installing', `Устанавливаем Hearth ${version}…`, version);
      const child = spawn(installerPath, ['/S', '--updated'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      return new Promise((resolve) => {
        child.once('spawn', () => {
          app.isQuitting = true;
          app.quit();
          resolve({ status: 'installing', version, message: 'Установка обновления запущена.' });
        });
        child.once('error', (error) => {
          console.warn('Silent update install failed:', error.message);
          sendUpdateStatus('install-fallback', 'Тихая установка не удалась. Откроется обычный установщик.', version);
          const fallback = spawn(installerPath, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          });
          fallback.once('spawn', () => {
            app.isQuitting = true;
            app.quit();
            resolve({ status: 'installing', version, message: 'Открылся обычный установщик.' });
          });
          fallback.once('error', () => resolve({
            status: 'error',
            message: 'Не удалось запустить установщик. Попробуйте установить его вручную.'
          }));
        });
      });
    }

    const mainWindow = getMainWindow();
    const choice = await dialog.showMessageBox(
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      {
        type: 'info',
        title: 'Обновление Hearth',
        message: `Доступна новая версия Hearth ${version}`,
        detail: 'Обновление скачано и проверено. Hearth закроется на время установки.',
        buttons: ['Установить сейчас', 'Позже'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      }
    );
    if (choice.response !== 0) {
      return {
        status: 'downloaded',
        version,
        message: `Обновление ${version} готово к установке. Можно вернуться к нему позже.`
      };
    }
    return installUpdate(installerPath, version, { silent: true });
  }

  return { installUpdate };
}

module.exports = { createUpdateInstaller };
