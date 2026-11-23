'use strict';

function createAttachmentService({
  fsp,
  path,
  fileTypeFromFile,
  NodeClam,
  env = process.env,
  allowedMimeTypes,
  allowedExtensions,
  uploadsDir,
  randomUUID,
  logger = console
}) {
  let clamScannerPromise = null;

  async function initClamScanner() {
    if (!clamScannerPromise) {
      const host = env.CLAMAV_HOST || '127.0.0.1';
      const port = Number(env.CLAMAV_PORT || 3310);
      clamScannerPromise = new NodeClam()
        .init({
          removeInfected: false,
          quarantineInfected: false,
          scanLog: null,
          clamdscan: {
            host,
            port,
            socket: env.CLAMAV_SOCKET || false,
            timeout: 60000,
            localFallback: true
          },
          preference: 'clamdscan'
        })
        .catch((error) => {
          logger.warn('ClamAV initialization failed:', error.message);
          return null;
        });
    }
    return clamScannerPromise;
  }

  async function scanUploadedFile(filePath) {
    const scanner = await initClamScanner();
    if (!scanner) return true;
    try {
      const { isInfected } = await scanner.isInfected(filePath);
      return !isInfected;
    } catch (error) {
      logger.warn('ClamAV scan error:', error.message);
      return true;
    }
  }

  async function removeFileSafe(filePath) {
    if (!filePath) return;
    try {
      await fsp.unlink(filePath);
    } catch {
      // ignore
    }
  }

  async function processAttachment(file, buildUrl) {
    const detected = await fileTypeFromFile(file.path).catch(() => null);
    const mime = detected?.mime || file.mimetype;
    const ext = (detected?.ext ? '.' + detected.ext : path.extname(file.originalname))?.toLowerCase() || '';

    if (!allowedMimeTypes.has(mime) || (ext && !allowedExtensions.has(ext))) {
      await removeFileSafe(file.path);
      const error = new Error('Unsupported or disallowed file type.');
      error.statusCode = 415;
      throw error;
    }

    const clean = await scanUploadedFile(file.path);
    if (!clean) {
      await removeFileSafe(file.path);
      const error = new Error('File failed security scan.');
      error.statusCode = 400;
      throw error;
    }

    const attachmentId = randomUUID();
    const storageName = attachmentId + ext;
    const finalPath = path.join(uploadsDir, storageName);
    await fsp.rename(file.path, finalPath);

    const publicMeta = {
      id: attachmentId,
      name: file.originalname,
      mime,
      size: file.size,
      url: buildUrl(attachmentId)
    };

    return { public: publicMeta, storagePath: storageName };
  }

  function processDmAttachment(file, conversationId) {
    return processAttachment(file, (attachmentId) => '/api/files/' + conversationId + '/' + attachmentId);
  }

  function processServerAttachment(file, serverId, channelId) {
    return processAttachment(
      file,
      (attachmentId) => '/api/servers/' + serverId + '/channels/' + channelId + '/files/' + attachmentId
    );
  }

  return { removeFileSafe, processAttachment, processDmAttachment, processServerAttachment };
}

module.exports = { createAttachmentService };
