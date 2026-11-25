'use strict';

function createUpdateDownloader({
  app,
  brand,
  fs,
  path,
  crypto,
  fetch,
  Readable,
  Transform,
  pipeline,
  isSkipUpdateRequested,
  sendUpdateStatus
}) {
  let activeUpdateController = null;

  async function readExpectedSha256(release, asset) {
    if (typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(asset.digest)) {
      return asset.digest.slice(7).toLowerCase();
    }
    const checksum = (release.assets || []).find((item) => item.name === `${asset.name}.sha256`);
    if (!checksum?.browser_download_url) return null;
    const response = await fetch(checksum.browser_download_url, {
      headers: { 'User-Agent': brand.userAgent },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const match = (await response.text()).trim().match(/\b([a-f0-9]{64})\b/i);
    return match ? match[1].toLowerCase() : null;
  }

  async function downloadAndVerifyUpdate(asset, expectedHash, version) {
    const updatesDirectory = path.join(app.getPath('userData'), 'updates');
    fs.mkdirSync(updatesDirectory, { recursive: true });
    const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');
    const installerPath = path.join(updatesDirectory, `Hearth-${safeVersion}-Setup.exe`);
    try {
      const stat = await fs.promises.stat(installerPath);
      if (stat.isFile() && stat.size === asset.size && stat.size > 1024) {
        const hash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(installerPath)) hash.update(chunk);
        if (hash.digest('hex') === expectedHash) {
          sendUpdateStatus('downloaded', `Установщик Hearth ${version} уже загружен и проверен.`, version, 100);
          return installerPath;
        }
      }
    } catch {}
    try { await fs.promises.unlink(installerPath); } catch {}
    if (isSkipUpdateRequested()) {
      sendUpdateStatus('skipped', 'Запуск продолжается без обновления.', version);
      return null;
    }

    activeUpdateController = new AbortController();
    const response = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': brand.userAgent },
      signal: AbortSignal.any([activeUpdateController.signal, AbortSignal.timeout(20 * 60 * 1000)])
    });
    if (!response.ok || !response.body) {
      throw new Error(`Не удалось скачать обновление (HTTP ${response.status}).`);
    }

    const total = Number(response.headers.get('content-length')) || Number(asset.size) || 0;
    let received = 0;
    let lastPercent = -1;
    const hash = crypto.createHash('sha256');
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        hash.update(chunk);
        const percent = total ? Math.floor(received / total * 100) : 0;
        if (percent !== lastPercent) {
          lastPercent = percent;
          sendUpdateStatus('downloading', `Скачиваем обновление… ${percent}%`, version, percent);
        }
        callback(null, chunk);
      }
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body),
        meter,
        fs.createWriteStream(installerPath, { flags: 'w' })
      );
      const actualHash = hash.digest('hex');
      const stat = await fs.promises.stat(installerPath);
      if (stat.size < 1024 || (asset.size && stat.size !== asset.size)) {
        throw new Error('Размер скачанного установщика не совпадает с опубликованным.');
      }
      if (actualHash !== expectedHash) {
        throw new Error('Контрольная сумма установщика не совпала. Файл удалён из соображений безопасности.');
      }
      sendUpdateStatus('downloaded', `Обновление ${version} скачано и проверено.`, version, 100);
      return installerPath;
    } catch (error) {
      await fs.promises.unlink(installerPath).catch(() => {});
      if (isSkipUpdateRequested() || error.name === 'AbortError') {
        sendUpdateStatus('skipped', 'Запуск продолжается без обновления.', version);
        return null;
      }
      throw error;
    } finally {
      activeUpdateController = null;
    }
  }

  function abortDownload() {
    activeUpdateController?.abort();
  }

  return { readExpectedSha256, downloadAndVerifyUpdate, abortDownload };
}

module.exports = { createUpdateDownloader };
