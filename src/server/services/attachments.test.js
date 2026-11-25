'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createAttachmentService } = require('./attachments');

function createService({ infected = false, allowedMimeTypes = new Set(['image/png']), allowedExtensions = new Set(['.png']) } = {}) {
  class NodeClamMock {
    async init() {
      return { isInfected: async () => ({ isInfected: infected }) };
    }
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-attachments-'));
  const uploadsDir = path.join(root, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const service = createAttachmentService({
    fsp,
    path,
    fileTypeFromFile: async () => ({ ext: 'png', mime: 'image/png' }),
    NodeClam: NodeClamMock,
    env: {},
    allowedMimeTypes,
    allowedExtensions,
    uploadsDir,
    randomUUID
  });
  return { root, uploadsDir, service };
}

test('accepted attachments are scanned and moved to permanent storage', async () => {
  const { root, uploadsDir, service } = createService();
  const tempPath = path.join(root, 'upload.tmp');
  fs.writeFileSync(tempPath, 'image');
  try {
    const result = await service.processDmAttachment({
      path: tempPath, originalname: 'avatar.png', mimetype: 'application/octet-stream', size: 5
    }, 42);
    assert.equal(result.public.name, 'avatar.png');
    assert.equal(result.public.mime, 'image/png');
    assert.equal(result.public.url, '/api/files/42/' + result.public.id);
    assert.equal(fs.existsSync(path.join(uploadsDir, result.storagePath)), true);
    assert.equal(fs.existsSync(tempPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('disallowed attachment types are deleted and rejected with HTTP 415', async () => {
  const { root, service } = createService({ allowedMimeTypes: new Set(['application/pdf']) });
  const tempPath = path.join(root, 'bad.tmp');
  fs.writeFileSync(tempPath, 'bad');
  try {
    await assert.rejects(service.processServerAttachment({
      path: tempPath, originalname: 'bad.png', mimetype: 'image/png', size: 3
    }, 7, 9), (error) => error.statusCode === 415);
    assert.equal(fs.existsSync(tempPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('infected attachments are deleted and rejected with HTTP 400', async () => {
  const { root, service } = createService({ infected: true });
  const tempPath = path.join(root, 'infected.tmp');
  fs.writeFileSync(tempPath, 'bad');
  try {
    await assert.rejects(service.processDmAttachment({
      path: tempPath, originalname: 'infected.png', mimetype: 'image/png', size: 3
    }, 1), (error) => error.statusCode === 400);
    assert.equal(fs.existsSync(tempPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
