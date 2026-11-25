'use strict';

function registerProfileRoutes({ app, selectUserByUsername, ensureAuthenticated, friendActionLimiter, selectUserById, markProfile, randomDiscriminator, sanitizeUser, broadcastUserUpdate, upload, removeFileSafe, fileTypeFromFile, path, avatarsDir, sharp, db, fs, getUserSettings, updateUserSettingsRecord }) {
  function checkHandleAvailability(req, res) {
    const rawUsername = typeof req.query.username === 'string' ? req.query.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/.test(rawUsername)) {
      return res.json({ available: false, reason: 'Логин: 3–24 символа a–z, 0–9, точка, дефис или подчёркивание. Первый и последний символ — буква или цифра.' });
    }
    const existing = selectUserByUsername.get(rawUsername);
    const available = !existing || existing.id === req.user.id;
    return res.json({ available, reason: available ? 'Свободен' : 'Уже занят' });
  }
  app.get('/api/profile/check-handle', ensureAuthenticated, friendActionLimiter, checkHandleAvailability);
  // Backward-compatible route for clients from 0.0.3.
  app.get('/api/profile/username-availability', ensureAuthenticated, friendActionLimiter, checkHandleAvailability);
  
  app.post('/api/profile', ensureAuthenticated, friendActionLimiter, (req, res) => {
    const rawName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const rawHandle = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const safeBio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 200) : '';
    const safeAvatarColor = typeof req.body?.avatarColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.avatarColor)
      ? req.body.avatarColor : req.user.avatar_color || '#D97757';
    const currentHandle = String(req.user.username || '').toLowerCase();
    const handleChanged = rawHandle !== currentHandle;
    const nameChanged = rawName !== String(req.user.display_name || '');
  
    if (rawName.length < 2 || rawName.length > 32) {
      return res.status(400).json({ message: 'Имя должно содержать от 2 до 32 символов.' });
    }
    if (!/^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/.test(rawHandle)) {
      return res.status(400).json({ message: 'Логин должен содержать от 3 до 24 символов: a–z, 0–9, точка, дефис или подчёркивание. Нельзя начинать или заканчивать спецсимволом.' });
    }
  
    if (handleChanged && req.user.profile_complete) {
      const lastChanged = req.user.username_changed_at ? Date.parse(req.user.username_changed_at + (String(req.user.username_changed_at).includes('Z') ? '' : 'Z')) : 0;
      if (lastChanged && Date.now() - lastChanged < 14 * 24 * 60 * 60 * 1000) {
        const remainingDays = Math.ceil((14 * 24 * 60 * 60 * 1000 - (Date.now() - lastChanged)) / (24 * 60 * 60 * 1000));
        return res.status(429).json({ message: `Логин можно менять раз в 14 дней. Повторите через ${remainingDays} дн.` });
      }
    }
    if (nameChanged && req.user.display_name_changed_at) {
      const lastNameChange = Date.parse(req.user.display_name_changed_at + (String(req.user.display_name_changed_at).includes('Z') ? '' : 'Z'));
      if (Number.isFinite(lastNameChange) && Date.now() - lastNameChange < 60 * 1000) {
        return res.status(429).json({ message: 'Отображаемое имя можно менять не чаще одного раза в минуту.' });
      }
    }
    const existingHandle = selectUserByUsername.get(rawHandle);
    if (existingHandle && existingHandle.id !== req.user.id) {
      return res.status(409).json({ message: 'Этот логин уже занят.' });
    }
  
    try {
      const stableDiscriminator = req.user.discriminator || randomDiscriminator();
      const requestedPreset = Number(req.body?.avatarPreset);
      const safeAvatarPreset = Number.isInteger(requestedPreset) && requestedPreset >= 0 && requestedPreset <= 11
        ? requestedPreset : Number(req.user.avatar_preset) || 0;
      markProfile.run(rawName, rawHandle, stableDiscriminator, safeBio, safeAvatarColor, safeAvatarPreset, safeAvatarPreset, rawName, rawHandle, req.user.id);
      const updated = sanitizeUser(selectUserById.get(req.user.id));
      req.user = updated;
      broadcastUserUpdate(updated);
      return res.json({ user: updated });
    } catch (error) {
      console.error('Profile update failed:', error);
      return res.status(500).json({ message: 'Не удалось сохранить профиль.' });
    }
  });
  
  app.post('/api/profile/avatar', ensureAuthenticated, friendActionLimiter, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Выберите изображение аватара.' });
    try {
      if (req.file.size > 2 * 1024 * 1024) {
        await removeFileSafe(req.file.path);
        return res.status(413).json({ message: 'Изображение должно быть не больше 2 МБ.' });
      }
      const detected = await fileTypeFromFile(req.file.path).catch(() => null);
      if (!detected || !['png', 'jpg', 'jpeg', 'webp'].includes(detected.ext)) {
        await removeFileSafe(req.file.path);
        return res.status(415).json({ message: 'Поддерживаются только PNG, JPG и WebP.' });
      }
      const avatarPath = path.join(avatarsDir, `user-${req.user.id}.webp`);
      await sharp(req.file.path).rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 84 }).toFile(avatarPath);
      await removeFileSafe(req.file.path);
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(`/api/avatars/${req.user.id}?v=${Date.now()}`, req.user.id);
      const updated = sanitizeUser(selectUserById.get(req.user.id));
      req.user = updated;
      broadcastUserUpdate(updated);
      return res.json({ user: updated });
    } catch (error) {
      await removeFileSafe(req.file.path);
      console.error('Avatar upload failed:', error);
      return res.status(500).json({ message: 'Не удалось обработать изображение.' });
    }
  });
  
  app.delete('/api/profile/avatar', ensureAuthenticated, friendActionLimiter, async (req, res) => {
    try {
      await removeFileSafe(path.join(avatarsDir, `user-${req.user.id}.webp`));
      db.prepare("UPDATE users SET avatar_url = '' WHERE id = ?").run(req.user.id);
      const updated = sanitizeUser(selectUserById.get(req.user.id));
      req.user = updated;
      broadcastUserUpdate(updated);
      return res.json({ user: updated });
    } catch (error) {
      return res.status(500).json({ message: 'Не удалось удалить аватар.' });
    }
  });
  
  app.get('/api/avatars/:userId', ensureAuthenticated, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) return res.status(400).end();
    const target = selectUserById.get(userId);
    if (!target?.avatar_url) return res.status(404).end();
    const avatarPath = path.join(avatarsDir, `user-${userId}.webp`);
    if (!fs.existsSync(avatarPath)) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.type('image/webp').sendFile(avatarPath);
  });
  
  app.put('/api/profile/status', ensureAuthenticated, friendActionLimiter, (req, res) => {
    const allowed = new Set(['online', 'idle', 'dnd', 'invisible']);
    const nextStatus = typeof req.body?.status === 'string' ? req.body.status : '';
    const customStatus = typeof req.body?.customStatus === 'string' ? req.body.customStatus.trim().slice(0, 60) : '';
    if (!allowed.has(nextStatus)) return res.status(400).json({ message: 'Недопустимый статус.' });
    db.prepare('UPDATE users SET status = ?, custom_status = ? WHERE id = ?').run(nextStatus, customStatus, req.user.id);
    const updated = sanitizeUser(selectUserById.get(req.user.id));
    req.user = updated;
    broadcastUserUpdate(updated);
    return res.json({ user: updated });
  });
  
  app.get('/api/profile/me', ensureAuthenticated, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
  });
  
  app.get('/api/settings/me', ensureAuthenticated, (req, res) => {
    const settings = getUserSettings(req.user.id);
    res.json({ settings });
  });
  
  app.put('/api/settings/me', ensureAuthenticated, (req, res) => {
    try {
      const next = updateUserSettingsRecord(req.user.id, req.body || {});
      res.json({ settings: next });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Failed to update settings.' });
    }
  });
}

module.exports = { registerProfileRoutes };
