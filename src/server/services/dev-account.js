'use strict';

const { randomBytes } = require('node:crypto');

function createDevAccountSeeder({
  process,
  path,
  fs,
  dataDir,
  REQUIRE_HTTPS,
  isDesktop,
  selectUserByEmail,
  insertUser,
  bcrypt,
  generateHandleFromEmail,
  selectUserById,
  markProfile,
  updatePasswordHash,
  getUserSettings,
  updateUserSettings,
  selectPremiumPlanBySlug,
  db,
  logger = console
}) {
  function seedDevAccount() {
    const flag = String(process.env.HEARTH_DEV_ACCOUNT || '').toLowerCase();
    if (flag !== 'true' && flag !== '1') return false;

    const looksLikePublicDeployment =
      REQUIRE_HTTPS || String(process.env.CLIENT_ORIGIN || '').startsWith('https://');
    if (!isDesktop && looksLikePublicDeployment) {
      logger.warn('HEARTH_DEV_ACCOUNT ignored: the dev account is never created on a public HTTPS deployment.');
      return false;
    }

    const email = String(process.env.HEARTH_DEV_EMAIL || 'dev@hearth.local').trim().toLowerCase();
    const configuredPassword = process.env.HEARTH_DEV_PASSWORD || '';
    let user = selectUserByEmail.get(email);

    if (!user) {
      const password = configuredPassword || randomBytes(12).toString('base64url');
      const result = insertUser.run(
        email,
        generateHandleFromEmail(email),
        bcrypt.hashSync(password, 12),
        '',
        1,
        0,
        null
      );
      user = selectUserById.get(result.lastInsertRowid);
      markProfile.run('Hearth Dev', user.username, '0001', '', '#D97757', 0, 0, 'Hearth Dev', user.username, user.id);
      user = selectUserById.get(user.id);

      if (configuredPassword) {
        logger.log(`Dev account created: ${email} (password from HEARTH_DEV_PASSWORD)`);
      } else {
        const credentialsFile = path.join(dataDir, 'dev-account.txt');
        fs.writeFileSync(credentialsFile, `email: ${email}\npassword: ${password}\n`, { mode: 0o600 });
        logger.log(`Dev account created: ${email} (password saved to ${credentialsFile})`);
      }
    } else if (configuredPassword && !bcrypt.compareSync(configuredPassword, user.password_hash || '')) {
      updatePasswordHash.run(bcrypt.hashSync(configuredPassword, 12), user.id);
      logger.log('Dev account password updated from HEARTH_DEV_PASSWORD.');
    }

    const settings = getUserSettings(user.id);
    const badges = Array.from(new Set([...settings.badges, 'dev', 'premium']));
    updateUserSettings.run(
      settings.theme,
      settings.accent,
      settings.background_url,
      settings.reduce_motion ? 1 : 0,
      JSON.stringify(badges),
      user.id
    );

    const plan = selectPremiumPlanBySlug.get('pulse-monthly');
    if (plan) {
      const hasDevSubscription = db
        .prepare("SELECT id FROM premium_subscriptions WHERE user_id = ? AND status = 'active' AND metadata LIKE '%\"dev\":true%'")
        .get(user.id);
      if (!hasDevSubscription) {
        db.prepare(`
          INSERT INTO premium_subscriptions (user_id, plan_id, status, started_at, renews_at, metadata)
          VALUES (?, ?, 'active', CURRENT_TIMESTAMP, DATETIME('now', '+100 years'), ?)
        `).run(user.id, plan.id, JSON.stringify({ dev: true }));
      }
    }
    return true;
  }

  return { seedDevAccount };
}

module.exports = { createDevAccountSeeder };
