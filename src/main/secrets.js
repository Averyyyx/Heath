'use strict';

function createSecretsService({ app, fs, path, crypto, process }) {
  function isDevAccountEnabled() {
    const flag = process.env.HEARTH_DEV_ACCOUNT;
    if (flag === 'false' || flag === '0') return false;
    if (flag === 'true' || flag === '1') return true;
    return !app.isPackaged || fs.existsSync(path.join(app.getPath('userData'), 'dev-account.enabled'));
  }

  function getOrCreateSecrets() {
    const secretsFile = path.join(app.getPath('userData'), 'secrets.json');
    let secrets = {};
    try {
      secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
    } catch {
      secrets = {};
    }

    let changed = false;
    for (const key of ['SESSION_SECRET', 'JWT_SECRET']) {
      if (typeof secrets[key] !== 'string' || secrets[key].length < 32) {
        secrets[key] = crypto.randomBytes(48).toString('hex');
        changed = true;
      }
    }

    if (changed) {
      fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
      fs.writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });
    }
    return secrets;
  }

  return { isDevAccountEnabled, getOrCreateSecrets };
}

module.exports = { createSecretsService };
