'use strict';

function registerAuthRoutes({ app, authLimiter, zxcvbn, isValidEmail, selectUserByEmail, validatePasswordStrength, bcrypt, generateHandleFromEmail, insertUser, db, defaultAvatarColor, selectUserById, sanitizeUser, ensureAuthenticated, speakeasy, QRCode, updateTwoFactor, updatePasswordHash, passport }) {
  app.post('/api/auth/password-strength', authLimiter, (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 128) : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.slice(0, 254) : '';
    if (!password) return res.status(400).json({ message: 'Введите пароль.' });
    const analysis = zxcvbn(password, email ? [email] : undefined);
    return res.json({ score: analysis.score, label: ['Слабый', 'Слабый', 'Средний', 'Хороший', 'Сильный'][analysis.score] });
  });
  
  app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body || {};
  
    if (!email || !password) {
      return res.status(400).json({ message: 'Введите адрес электронной почты и пароль.' });
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Проверьте адрес электронной почты и пароль.' });
    }
    if (email.length > 254 || password.length > 128) {
      return res.status(400).json({ message: 'Email не должен превышать 254 символа, пароль — 128 символов.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Введите корректный адрес электронной почты.' });
    }
  
    try {
      const existing = selectUserByEmail.get(normalizedEmail);
      if (existing) {
        return res.status(409).json({ message: 'Этот адрес электронной почты уже используется.' });
      }
  
      validatePasswordStrength(password, normalizedEmail);
      const passwordHash = bcrypt.hashSync(password, 12);
      const placeholderHandle = generateHandleFromEmail(normalizedEmail);
      const result = insertUser.run(
        normalizedEmail,
        placeholderHandle,
        passwordHash,
        '',
        0,
        0,
        null
      );
      db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?').run(defaultAvatarColor(placeholderHandle), result.lastInsertRowid);
      const user = selectUserById.get(result.lastInsertRowid);
      const safeUser = sanitizeUser(user);
  
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          return res.status(500).json({ message: 'Не удалось создать сессию. Повторите попытку.' });
        }
        req.session.cookie.maxAge = req.body?.remember === false ? null : 30 * 24 * 60 * 60 * 1000;
        req.login(safeUser, (err) => {
          if (err) {
            return res.status(500).json({ message: 'Login failed after registration.' });
          }
          res.status(201).json({ user: safeUser });
        });
      });
    } catch (error) {
      // Ошибки валидации (например, слабый пароль) несут statusCode и безопасны для показа;
      // внутренние ошибки не раскрываем.
      if (error.statusCode && error.statusCode < 500) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      console.error('Registration failed:', error);
      res.status(500).json({ message: 'Registration failed.' });
    }
  });
  
  app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) {
        return res.status(500).json({ message: 'Не удалось выполнить вход. Повторите попытку.' });
      }
      if (!user) {
        return res.status(401).json({
          message: info?.message || 'Неверный email или пароль.',
          twoFactorRequired: Boolean(info?.twoFactorRequired)
        });
      }
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          return res.status(500).json({ message: 'Session initialization failed.' });
        }
        req.session.cookie.maxAge = req.body?.remember === false ? null : 30 * 24 * 60 * 60 * 1000;
        req.login(user, (loginErr) => {
          if (loginErr) {
            return res.status(500).json({ message: 'Login failed.' });
          }
          return res.json({ user });
        });
      });
    })(req, res, next);
  });
  
  app.post('/api/auth/2fa/initiate', ensureAuthenticated, async (req, res) => {
    if (req.user.twofa_enabled) {
      return res.status(400).json({ message: 'Two-factor authentication already enabled.' });
    }
    const secret = speakeasy.generateSecret({
      name: `Hearth (${req.user.email})`,
      length: 20
    });
    req.session.twofaSetup = {
      secret: secret.base32,
      otpauth: secret.otpauth_url
    };
    const qr = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ otpauthUrl: secret.otpauth_url, qr });
  });
  
  app.post('/api/auth/2fa/enable', ensureAuthenticated, (req, res) => {
    const pending = req.session.twofaSetup;
    if (!pending) {
      return res.status(400).json({ message: 'No pending 2FA setup.' });
    }
    const token = req.body?.token;
    if (!token) {
      return res.status(400).json({ message: 'Two-factor code is required.' });
    }
    const verified = speakeasy.totp.verify({
      secret: pending.secret,
      encoding: 'base32',
      token,
      window: 1
    });
    if (!verified) {
      return res.status(400).json({ message: 'Invalid two-factor code.' });
    }
    updateTwoFactor.run(pending.secret, 1, req.user.id);
    delete req.session.twofaSetup;
    const updated = sanitizeUser(selectUserById.get(req.user.id));
    req.user = updated;
    res.json({ enabled: true, user: updated });
  });
  
  app.post('/api/auth/2fa/disable', ensureAuthenticated, (req, res) => {
    if (!req.user.twofa_enabled) {
      return res.status(400).json({ message: 'Two-factor authentication not enabled.' });
    }
    const token = req.body?.token;
    if (!token) {
      return res.status(400).json({ message: 'Two-factor code is required.' });
    }
    const fullUser = selectUserById.get(req.user.id);
    const verified = speakeasy.totp.verify({
      secret: fullUser.twofa_secret,
      encoding: 'base32',
      token,
      window: 1
    });
    if (!verified) {
      return res.status(400).json({ message: 'Invalid two-factor code.' });
    }
    updateTwoFactor.run(null, 0, req.user.id);
    const updated = sanitizeUser(selectUserById.get(req.user.id));
    req.user = updated;
    res.json({ disabled: true, user: updated });
  });
  
  app.post('/api/auth/password', ensureAuthenticated, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    const fullUser = selectUserById.get(req.user.id);
    const isMatch = bcrypt.compareSync(currentPassword, fullUser.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }
    validatePasswordStrength(newPassword, req.user.email);
    const newHash = bcrypt.hashSync(newPassword, 12);
    updatePasswordHash.run(newHash, req.user.id);
    res.json({ updated: true });
  });
}

module.exports = { registerAuthRoutes };
