'use strict';

function createUpdaterService({
  app,
  fetch,
  brand,
  compareReleaseVersions,
  preferences,
  downloader,
  installer,
  getMainWindow,
  getSplashWindow,
  setPendingUpdateNotice,
  state
}) {
  let updateCheckPromise = null;
  let releaseNotesText = '';

  function sendUpdateStatus(status, message, version, percent, releaseNotes) {
    const payload = {
      status,
      message,
      ...(version ? { version } : {}),
      ...(Number.isFinite(percent) ? { percent: Math.max(0, Math.min(100, percent)) } : {}),
      ...(releaseNotes ? { releaseNotes } : {})
    };
    if (status === 'available' || status === 'downloaded') setPendingUpdateNotice(payload);
    if (status === 'up-to-date') setPendingUpdateNotice(null);
    const mainWindow = getMainWindow();
    const splashWindow = getSplashWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', payload);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.webContents.send('update-status', payload);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function checkForUpdates({ interactive = true, startup = false } = {}) {
    if (!app.isPackaged) {
      sendUpdateStatus('development', 'Режим разработки — проверка обновлений пропущена.');
      return { status: 'unavailable', message: 'Режим разработки — обновления не проверяются.' };
    }
    if (updateCheckPromise) return updateCheckPromise;
    if (startup) state.skipUpdateRequested = false;

    updateCheckPromise = (async () => {
      sendUpdateStatus('checking', 'Проверяем обновления…');
      try {
        const response = await fetch(`https://api.github.com/repos/${brand.repo.owner}/${brand.repo.name}/releases?per_page=30`, {
          headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': brand.userAgent },
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) {
          throw new Error(response.status === 404
            ? `Не удалось найти публичные Alpha-релизы ${brand.name}.`
            : `Сервис обновлений временно недоступен (HTTP ${response.status}).`);
        }

        const releases = await response.json();
        const latest = releases.filter((item) => !item.draft && item.prerelease)
          .sort((left, right) => compareReleaseVersions(right.tag_name, left.tag_name))[0];
        if (!latest) {
          const message = `У вас последняя доступная Alpha-версия ${brand.name}.`;
          sendUpdateStatus('up-to-date', message, app.getVersion());
          if (startup) await sleep(400);
          return { status: 'up-to-date', message };
        }

        const current = app.getVersion().replace(/^v/, '');
        const version = String(latest.tag_name || '').replace(/^v/, '');
        if (!version || compareReleaseVersions(version, current) <= 0) {
          const message = `У вас последняя версия ${brand.name}.`;
          sendUpdateStatus('up-to-date', message, current);
          if (startup) await sleep(400);
          return { status: 'up-to-date', version: current, message };
        }

        const asset = (latest.assets || []).find((item) => /\.exe$/i.test(item.name || '') && /setup/i.test(item.name || ''));
        if (!asset?.browser_download_url || !asset.size) {
          throw new Error(`В релизе ${version} нет установщика Windows.`);
        }
        releaseNotesText = String(latest.body || '').replace(/<[^>]+>/g, '').trim().slice(0, 12000);
        sendUpdateStatus('available', `Найдена версия ${version}.`, version, undefined, releaseNotesText);
        const updatePreferences = preferences.getUpdatePreferences();
        if (!updatePreferences.autoDownload && (!interactive || startup)) {
          return {
            status: 'available',
            version,
            message: `Доступна версия ${version}. Автоматическая загрузка выключена.`,
            releaseNotes: releaseNotesText
          };
        }
        if (startup && state.skipUpdateRequested) {
          sendUpdateStatus('skipped', `Запуск ${brand.name} продолжается без обновления.`, version);
          return { status: 'skipped', version, message: 'Обновление пропущено.' };
        }

        const expectedHash = await downloader.readExpectedSha256(latest, asset);
        if (!expectedHash) throw new Error('У релиза отсутствует SHA-256. Установщик не будет запущен.');
        if (startup && state.skipUpdateRequested) {
          sendUpdateStatus('skipped', `Запуск ${brand.name} продолжается без обновления.`, version);
          return { status: 'skipped', version, message: 'Обновление пропущено.' };
        }

        const installerPath = await downloader.downloadAndVerifyUpdate(asset, expectedHash, version);
        if (!installerPath) {
          return { status: 'skipped', version, message: `Запуск ${brand.name} продолжается без обновления.` };
        }
        if (startup) return installer.installUpdate(installerPath, version, { silent: true });
        if (interactive) return installer.installUpdate(installerPath, version, { silent: false });
        return {
          status: 'downloaded',
          version,
          message: `Обновление ${version} скачано и проверено.`,
          releaseNotes: releaseNotesText
        };
      } catch (error) {
        const message = error.name === 'TimeoutError' || error.name === 'AbortError'
          ? `Не удалось проверить обновления по тайм-ауту. Запуск ${brand.name} продолжается.`
          : (error.message || 'Не удалось проверить или скачать обновление.');
        console.warn('Update check failed:', error);
        sendUpdateStatus('error', message);
        if (startup) await sleep(1000);
        return { status: 'error', message };
      }
    })();

    try {
      return await updateCheckPromise;
    } finally {
      updateCheckPromise = null;
    }
  }

  function skipUpdate() {
    state.skipUpdateRequested = true;
    downloader.abortDownload();
  }

  return {
    checkForUpdates,
    sendUpdateStatus,
    getUpdatePreferences: preferences.getUpdatePreferences,
    setUpdatePreferences: preferences.setUpdatePreferences,
    skipUpdate
  };
}

module.exports = { createUpdaterService };
