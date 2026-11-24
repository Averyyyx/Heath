require('dotenv').config();

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient: createRedisClient } = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const Database = require('better-sqlite3');
const sharp = require('sharp');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { fileTypeFromFile } = require('file-type');
const NodeClam = require('clamscan');
const multer = require('multer');
const { Server } = require('socket.io');
const { registerSocketHandlers } = require('./realtime/socket');
const { randomUUID, randomBytes } = require('crypto');
const { SQLiteSessionStore } = require('./middleware/sqlite-session-store');
const { isValidEmail } = require('../shared/email-validation');

const { createServerConfig } = require('./config');
const {
  isDesktop,
  PORT,
  dataDir,
  publicDir,
  uploadsDir,
  tempUploadsDir,
  avatarsDir,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  PASSWORD_MIN_SCORE,
  REQUIRE_HTTPS,
  isProduction,
  PREMIUM_BRAND,
  PREMIUM_BALANCE_TOKEN,
  useMemorySession,
  useSQLiteSession
} = createServerConfig(process.env, __dirname);

const app = express();
const server = http.createServer(app);

console.log('Public directory path:', publicDir);
console.log('Public directory exists:', fs.existsSync(publicDir));

if (!fs.existsSync(publicDir)) {
  console.error('ERROR: Public directory does not exist:', publicDir);
  console.error('Current working directory:', process.cwd());
  console.error('__dirname:', __dirname);
}

let redisClient = null;

if (!useSQLiteSession) {
  redisClient = createRedisClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  });
  redisClient.on('error', (err) => {
    console.error('Redis error', err);
  });
  redisClient.connect().catch((err) => {
    console.error('Redis connection failed', err);
  });
}

const { createAttachmentService } = require('./services/attachments');
const {
  removeFileSafe,
  processDmAttachment,
  processServerAttachment
} = createAttachmentService({
  fsp,
  path,
  fileTypeFromFile,
  NodeClam,
  env: process.env,
  allowedMimeTypes: ALLOWED_MIME_TYPES,
  allowedExtensions: ALLOWED_EXTENSIONS,
  uploadsDir,
  randomUUID
});

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const { createDatabase } = require('./db/schema');
const { createQueries } = require('./db/queries');
const db = createDatabase({ Database, path, dataDir, env: process.env });
const {
  selectUserByEmail,
  selectUserById,
  insertUser,
  selectUserByUsername,
  updateTwoFactor,
  updatePasswordHash,
  markProfile,
  selectOAuthAccount,
  insertOAuthAccount,
  insertConversation,
  updateConversationTimestamp,
  selectConversationById,
  selectConversationBetween,
  insertParticipant,
  selectParticipants,
  selectParticipant,
  updateConversationRead,
  listConversationsForUser,
  insertMessageDelivery,
  selectMessageDeliverySummary,
  insertMessage,
  selectMessageById,
  selectMessageWithAuthor,
  selectMessagePin,
  insertMessagePin,
  deleteMessagePin,
  listDmPins,
  listChannelPins,
  listMessageReactions,
  insertMessageReaction,
  deleteMessageReaction,
  listMessages,
  selectLastMessageForConversation,
  listFriendships,
  insertAttachmentRecord,
  selectAttachmentById,
  selectFriendshipBetween,
  selectFriendshipById,
  insertFriendRequest,
  updateFriendStatus,
  deleteFriendship,
  insertServer,
  selectServerById,
  listServersForUser,
  insertServerMember,
  selectServerMember,
  listServerMembers,
  selectChannelReadState,
  upsertChannelReadState,
  selectChannelMessageReadReceipt,
  listServerMembersDetailed,
  insertChannel,
  selectChannelById,
  listChannelsForServer,
  insertServerMessage,
  selectServerMessageById,
  selectServerMessageWithAuthor,
  listChannelMessages,
  insertServerAttachmentRecord,
  selectServerAttachmentById,
  updateServerProfile,
  selectUserSettings,
  insertUserSettings,
  updateUserSettings,
  selectServerSettings,
  insertServerSettings,
  updateServerSettings,
  selectPremiumPlans,
  selectPremiumPlanById,
  selectPremiumPlanBySlug,
  insertPremiumPlan,
  insertPremiumTransaction,
  selectPremiumTransactionById,
  updatePremiumTransactionStatus,
  insertPremiumSubscription,
  selectPremiumBalance,
  selectRolesForServer,
  selectRoleById,
  insertRole,
  updateRole,
  deleteRole,
  assignRoleToMember,
  removeRoleFromMember,
  selectMemberRoles,
  selectDefaultRole,
  selectOverride,
  upsertOverride,
  deleteOverride,
  selectOverridesForChannel,
  selectVoiceSessionsByChannel,
  upsertVoiceSession,
  deleteVoiceSession,
  deleteVoiceSessionsForUser,
  PERMISSIONS
} = createQueries(db);

const { serializeAttachment, normalizeBadges } = require('./utils/serialization');
const { createPermissionService } = require('./services/permissions');
const { computeBasePermissions, hasPermission } = createPermissionService({
  selectServerMember,
  selectMemberRoles,
  selectDefaultRole,
  PERMISSIONS
});

const defaultPlan = selectPremiumPlanBySlug.get('pulse-monthly');
if (!defaultPlan) {
  insertPremiumPlan.run(
    'pulse-monthly',
    `${PREMIUM_BRAND} Monthly`,
    'Разблокируйте расширенные темы, динамические фоны и значки сообщества.',
    999,
    'USD',
    JSON.stringify([
      'Динамические фоновые сцены',
      'Набор премиальных значков',
      'Буст одного сервера',
      'Расширенные лимиты загрузки'
    ])
  );
}

const selectActiveSubscription = db.prepare(`
  SELECT s.id, s.renews_at, p.id AS plan_id, p.name AS plan_name
  FROM premium_subscriptions s
  JOIN premium_plans p ON p.id = s.plan_id
  WHERE s.user_id = ?
    AND s.status = 'active'
    AND (s.renews_at IS NULL OR s.renews_at > CURRENT_TIMESTAMP)
  ORDER BY s.renews_at DESC
  LIMIT 1
`);

// ---------------------------------------------------------------------------
// Тестовый аккаунт разработчика.
// Нужен, чтобы заходить в приложение с премиум-подпиской без оплаты и проверять
// интерфейс. Это обычный пользователь: админских прав (баны, модерация, доступ
// к чужим данным) он НЕ получает — в проекте такого понятия нет, и мы его не добавляем.
// Включается только флагом HEARTH_DEV_ACCOUNT=true (десктоп-сборка из исходников
// включает его сама) и никогда — на боевом веб-деплое (HTTPS), чтобы не создать
// аккаунт с известным паролем на публичном сервере.
// ---------------------------------------------------------------------------
const { createIdentityService } = require('./services/identity');
const {
  normalizeHandle,
  defaultAvatarColor,
  randomDiscriminator,
  generateUniqueHandle,
  generateHandleFromEmail
} = createIdentityService({ selectUserByUsername });

function seedDevAccount() {
  const flag = String(process.env.HEARTH_DEV_ACCOUNT || '').toLowerCase();
  if (flag !== 'true' && flag !== '1') return;

  const looksLikePublicDeployment =
    REQUIRE_HTTPS || String(process.env.CLIENT_ORIGIN || '').startsWith('https://');
  if (!isDesktop && looksLikePublicDeployment) {
    console.warn('HEARTH_DEV_ACCOUNT ignored: the dev account is never created on a public HTTPS deployment.');
    return;
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
      console.log(`Dev account created: ${email} (password from HEARTH_DEV_PASSWORD)`);
    } else {
      // Сгенерированный пароль в логи не пишем — только в файл, доступный владельцу.
      const credentialsFile = path.join(dataDir, 'dev-account.txt');
      fs.writeFileSync(credentialsFile, `email: ${email}\npassword: ${password}\n`, { mode: 0o600 });
      console.log(`Dev account created: ${email} (password saved to ${credentialsFile})`);
    }
  } else if (configuredPassword && !bcrypt.compareSync(configuredPassword, user.password_hash || '')) {
    // Пароль из окружения — источник истины: меняем его в аккаунте, если он поменялся
    updatePasswordHash.run(bcrypt.hashSync(configuredPassword, 12), user.id);
    console.log('Dev account password updated from HEARTH_DEV_PASSWORD.');
  }

  // Значки профиля
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

  // Бессрочная премиум-подписка без записей об оплате (баланс и транзакции не затрагиваются)
  const plan = selectPremiumPlanBySlug.get('pulse-monthly');
  if (plan) {
    const hasDevSubscription = db
      .prepare(`SELECT id FROM premium_subscriptions WHERE user_id = ? AND status = 'active' AND metadata LIKE '%"dev":true%'`)
      .get(user.id);
    if (!hasDevSubscription) {
      db.prepare(`
        INSERT INTO premium_subscriptions (user_id, plan_id, status, started_at, renews_at, metadata)
        VALUES (?, ?, 'active', CURRENT_TIMESTAMP, DATETIME('now', '+100 years'), ?)
      `).run(user.id, plan.id, JSON.stringify({ dev: true }));
    }
  }
}

const allowedOrigins = (process.env.CLIENT_ORIGIN || process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Добавляем localhost и 127.0.0.1 для Electron приложения
if (!allowedOrigins.includes('http://localhost:4000')) {
  allowedOrigins.push('http://localhost:4000');
}
if (!allowedOrigins.includes('http://127.0.0.1:4000')) {
  allowedOrigins.push('http://127.0.0.1:4000');
}

// Десктопный сервер никогда не стоит за прокси: иначе X-Forwarded-For подделывается клиентом
// и обходит лимиты по IP. Для веб-деплоя число доверенных прокси задаётся TRUST_PROXY (по умолчанию 1).
app.set('trust proxy', isDesktop ? false : Number(process.env.TRUST_PROXY ?? 1));

if (REQUIRE_HTTPS) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    const host = req.headers.host || '';
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: { policy: 'credentialless' }
  })
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(mongoSanitize());
app.use(hpp());

// Rate limiting configuration
const createRateLimiter = (
  windowMs,
  max,
  message,
  keyGen = (req) => req.ip,
  skipFailedRequests = true
) => rateLimit({
  windowMs,
  max,
  message: { message },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests,
  keyGenerator: keyGen
});

// Rate limiters for different endpoints
// Для входа/регистрации считаем и неудачные попытки, иначе брутфорс пароля не ограничивается.
const authLimiter = createRateLimiter(
  15 * 60 * 1000,
  20,
  'Too many login attempts, please try again later',
  undefined,
  false
);

const apiLimiter = createRateLimiter(
  15 * 60 * 1000, 
  100, 
  'Too many requests, please try again later'
);

const strictLimiter = createRateLimiter(
  60 * 1000, 
  10, 
  'Too many requests, please slow down'
);

const userScopedKey = (req) => (req.user?.id ? `user:${req.user.id}` : req.ip);

const messageLimiter = createRateLimiter(
  15 * 1000, 
  40, 
  'You are sending messages too quickly',
  userScopedKey
);

const friendActionLimiter = createRateLimiter(
  15 * 60 * 1000,
  30,
  'Too many friend actions, please try again later',
  userScopedKey
);

app.use(['/api/auth/login', '/api/auth/register', '/api/auth/github'], authLimiter);

const clientIsHttps = String(process.env.CLIENT_ORIGIN || '').startsWith('https://');

const sessionConfig = {
  store: useSQLiteSession
    ? new SQLiteSessionStore(db)
    : new RedisStore({
        client: redisClient,
        prefix: process.env.SESSION_PREFIX || 'hearth:sess:'
      }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    // Раньше secure=true ставился всегда в production. По http (десктоп на 127.0.0.1 и локальный
    // `npm run dev`) express-session такую cookie не отправляет вообще, и сессия не сохранялась.
    // 'auto' ставит Secure только на HTTPS-соединении (за прокси — по X-Forwarded-Proto).
    // sameSite=none нужен только для боевого деплоя с HTTPS-клиентом, иначе используем lax.
    sameSite: isDesktop ? 'lax' : isProduction && clientIsHttps ? 'none' : 'lax',
    secure: isDesktop ? false : 'auto',
    maxAge: Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7)
  }
};

const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

const csrfProtection = csrf({
  cookie: false,
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

// Применяем CSRF middleware, но делаем исключение для API в разработке и Electron
app.use((req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  const isElectron = process.env.ELECTRON_DESKTOP === '1';
  
  if ((isDev || isElectron) && req.path.startsWith('/api/')) {
    // В разработке и Electron csurf пропускаем, но состояние-меняющие запросы всё равно
    // защищаем проверкой Origin: чужой сайт не сможет отправить форму на локальный сервер.
    const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const requestOrigin = req.headers.origin;
    if (!isSafeMethod && requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      return res.status(403).json({ message: 'Origin not allowed.' });
    }
    req.csrfToken = () => isElectron ? 'electron-csrf-token' : 'dev-csrf-token';
    return next();
  }
  return csrfProtection(req, res, next);
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, tempUploadsDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname)?.toLowerCase() || '';
      cb(null, `${uniqueSuffix}${ext}`);
    }
  }),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024)
  }
});

// Initialize Socket.IO with CORS
// Initialize Socket.IO after session middleware
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? process.env.CLIENT_ORIGIN
      : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4000', 'http://127.0.0.1:4000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectionStateRecovery: {
    // Enable connection state recovery with 2 minutes timeout
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, () => {
    const userId = socket.request.session?.passport?.user;
    if (!userId) {
      return next(new Error('Unauthorized'));
    }
    socket.user = sanitizeUser(selectUserById.get(userId));
    if (!socket.user) {
      return next(new Error('Unauthorized'));
    }
    return next();
  });
});

const activeCallParticipants = new Map();



const { sanitizeUser } = require('./utils/users');

function broadcastUserUpdate(updatedUser) {
  if (!updatedUser || !io) return;
  const links = listFriendships.all(updatedUser.id, updatedUser.id)
    .filter((friendship) => friendship.status === 'accepted');
  const recipients = new Set();
  for (const link of links) {
    recipients.add(link.requester_id === updatedUser.id ? link.addressee_id : link.requester_id);
  }
  for (const recipientId of recipients) {
    io.to(getUserRoom(recipientId)).emit('user:update', { user: updatedUser });
  }
  io.to(getUserRoom(updatedUser.id)).emit('user:update', { user: updatedUser });
}

const { ensureAuthenticated } = require('./middleware/auth');

app.post('/api/servers/:serverId/roles', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  if (!Number.isFinite(serverId)) {
    return res.status(400).json({ message: 'Invalid server id.' });
  }
  const { name, color, permissions } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Role name is required.' });
  }
  try {
    ensureServerOwnership(serverId, req.user.id);
    const position = selectRolesForServer.all(serverId).length + 1;
    insertRole.run(
      serverId,
      name.slice(0, 48),
      (color || '#ffffff').slice(0, 7),
      position,
      Number.isFinite(permissions) ? permissions : 0,
      0
    );
    broadcastServerUpdate(serverId);
    const server = selectServerById.get(serverId);
    return res.status(201).json({ server: serializeServerEntity(server, req.user.id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.put('/api/servers/:serverId/roles/:roleId', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const roleId = Number(req.params.roleId);
  if (!Number.isFinite(serverId) || !Number.isFinite(roleId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  const role = selectRoleById.get(roleId);
  if (!role || role.server_id !== serverId) {
    return res.status(404).json({ message: 'Role not found.' });
  }
  try {
    ensureServerOwnership(serverId, req.user.id);
    const payload = req.body || {};
    updateRole.run(
      payload.name ? payload.name.slice(0, 48) : role.name,
      payload.color ? payload.color.slice(0, 7) : role.color,
      Number.isFinite(payload.position) ? payload.position : role.position,
      Number.isFinite(payload.permissions) ? payload.permissions : role.permissions,
      payload.is_default ? 1 : role.is_default,
      roleId
    );
    broadcastServerUpdate(serverId);
    const server = selectServerById.get(serverId);
    return res.json({ server: serializeServerEntity(server, req.user.id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.delete('/api/servers/:serverId/roles/:roleId', ensureAuthenticated, (req, res) => {
  const serverId = Number(req.params.serverId);
  const roleId = Number(req.params.roleId);
  if (!Number.isFinite(serverId) || !Number.isFinite(roleId)) {
    return res.status(400).json({ message: 'Invalid identifiers.' });
  }
  const role = selectRoleById.get(roleId);
  if (!role || role.server_id !== serverId) {
    return res.status(404).json({ message: 'Role not found.' });
  }
  if (role.is_default) {
    return res.status(400).json({ message: 'Cannot delete the default role.' });
  }
  try {
    ensureServerOwnership(serverId, req.user.id);
    deleteRole.run(roleId, serverId);
    broadcastServerUpdate(serverId);
    const server = selectServerById.get(serverId);
    return res.json({ server: serializeServerEntity(server, req.user.id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});



// Run only after identity helpers are initialized (the dev account uses generateHandleFromEmail).
seedDevAccount();

function hydrateFriendship(record, currentUserId) {
  if (!record) return null;
  const direction = record.requester_id === currentUserId ? 'outgoing' : 'incoming';
  const counterpartId = direction === 'outgoing' ? record.addressee_id : record.requester_id;
  const counterpart = sanitizeUser(selectUserById.get(counterpartId));

  return {
    id: record.id,
    status: record.status,
    direction,
    created_at: record.created_at,
    user: counterpart
  };
}

const { createMessageSerializers } = require('./services/message-serializers');
const {
  getMessagePin,
  getMessageReactions,
  getMessageDelivery,
  serializeMessage,
  serializeServerMessage,
  serializeConversation,
  getConversationParticipants
} = createMessageSerializers({
  db,
  selectMessagePin,
  listMessageReactions,
  selectMessageDeliverySummary,
  selectChannelMessageReadReceipt,
  selectParticipants,
  selectLastMessageForConversation,
  sanitizeUser,
  serializeAttachment
});

function ensureServerMembership(serverId, userId) {
  const server = selectServerById.get(serverId);
  if (!server) {
    const error = new Error('Server not found');
    error.statusCode = 404;
    throw error;
  }
  const membership = selectServerMember.get(serverId, userId);
  if (!membership) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
  return { server, membership };
}

function ensureServerOwnership(serverId, userId) {
  const { server } = ensureServerMembership(serverId, userId);
  if (server.owner_id !== userId) {
    const permissions = computeBasePermissions(serverId, userId);
    if (!hasPermission(permissions, PERMISSIONS.ADMIN | PERMISSIONS.MANAGE_SERVER)) {
      const error = new Error('Insufficient permissions.');
      error.statusCode = 403;
      throw error;
    }
  }
  return server;
}

function ensurePermission(serverId, userId, required) {
  const permissions = computeBasePermissions(serverId, userId);
  if (!hasPermission(permissions, required)) {
    const error = new Error('Insufficient permissions.');
    error.statusCode = 403;
    throw error;
  }
  return permissions;
}

function ensureChannelAccess(serverId, channelId, userId) {
  const channel = selectChannelById.get(channelId);
  if (!channel || channel.server_id !== serverId) {
    const error = new Error('Channel not found');
    error.statusCode = 404;
    throw error;
  }
  const { server, membership } = ensureServerMembership(serverId, userId);
  const memberRoles = selectMemberRoles.all(server.id, userId);
  const basePermissions = computeBasePermissions(server.id, userId, memberRoles);
  const overrides = selectOverridesForChannel.all(channel.id);
  let permissions = basePermissions;

  overrides.forEach((override) => {
    if (override.target_type === 'role') {
      const hasRole = memberRoles.some((role) => role.id === override.target_id);
      if (hasRole) {
        permissions &= ~override.deny;
        permissions |= override.allow;
      }
    } else if (override.target_type === 'member' && override.target_id === userId) {
      permissions &= ~override.deny;
      permissions |= override.allow;
    }
  });

  return { server, membership, channel, permissions };
}

function serializeChannel(channel, currentUserId = null) {
  if (!channel) return null;
  const overrides = selectOverridesForChannel.all(channel.id).map((override) => ({
    target_type: override.target_type,
    target_id: override.target_id,
    allow: override.allow,
    deny: override.deny
  }));
  return {
    id: channel.id,
    server_id: channel.server_id,
    type: channel.type,
    name: channel.name,
    topic: channel.topic,
    position: channel.position,
    slow_mode_seconds: channel.slow_mode_seconds || 0,
    is_nsfw: Boolean(channel.is_nsfw),
    bitrate: channel.bitrate || 64000,
    user_limit: channel.user_limit || 0,
    soundscape: channel.soundscape || '',
    ...(channel.type === 'voice' && Number.isInteger(currentUserId) ? (() => {
      try {
        const access = ensureChannelAccess(channel.server_id, channel.id, currentUserId);
        return {
          canConnect: hasPermission(access.permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.CONNECT_VOICE),
          canSpeak: hasPermission(access.permissions, PERMISSIONS.SPEAK_VOICE),
          canStream: hasPermission(access.permissions, PERMISSIONS.STREAM)
        };
      } catch { return { canConnect: false, canSpeak: false, canStream: false }; }
    })() : {}),
    overrides,
    created_at: channel.created_at
  };
}

function serializeServerEntity(server, currentUserId) {
  if (!server) return null;
  const channels = listChannelsForServer.all(server.id).map((channel) => serializeChannel(channel, currentUserId));
  const roles = selectRolesForServer.all(server.id).map((role) => ({
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    permissions: role.permissions,
    is_default: Boolean(role.is_default)
  }));
  const membership = selectServerMember.get(server.id, currentUserId);
  return {
    id: server.id,
    name: server.name,
    icon: server.icon,
    description: server.description,
    owner_id: server.owner_id,
    role: membership?.role || 'member',
    roles,
    channels,
    created_at: server.created_at
  };
}

function listServerMembersSerialized(serverId) {
  return listServerMembersDetailed.all(serverId).map((member) => ({
    id: member.id,
    user: {
      id: member.user_id,
      username: member.username,
      display_name: member.display_name,
      avatar_url: member.avatar_url,
      avatar_color: member.avatar_color || '#D97757'
    },
    role: member.role,
    nickname: member.nickname,
    joined_at: member.joined_at,
    roles: selectMemberRoles.all(serverId, member.user_id).map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position
    }))
  }));
}

function getUserSettings(userId) {
  let settings = selectUserSettings.get(userId);
  if (!settings) {
    insertUserSettings.run(userId);
    settings = selectUserSettings.get(userId);
  }
  return {
    theme: settings.theme,
    accent: settings.accent,
    background_url: settings.background_url,
    reduce_motion: Boolean(settings.reduce_motion),
    badges: normalizeBadges(settings.badges)
  };
}

function updateUserSettingsRecord(userId, payload) {
  const allowedThemes = ['light', 'dark', 'system'];
  const allowedAccents = ['terracotta'];
  const theme = allowedThemes.includes(payload.theme) ? payload.theme : 'system';
  const accent = allowedAccents.includes(payload.accent) ? payload.accent : 'terracotta';
  const background = (payload.background_url || '').trim().slice(0, 512);
  const reduceMotion = payload.reduce_motion ? 1 : 0;
  const badges = JSON.stringify(payload.badges || []);
  updateUserSettings.run(theme, accent, background, reduceMotion, badges, userId);
  return getUserSettings(userId);
}

function getServerSettings(serverId) {
  let settings = selectServerSettings.get(serverId);
  if (!settings) {
    insertServerSettings.run(serverId);
    settings = selectServerSettings.get(serverId);
  }
  return {
    default_notifications: settings.default_notifications,
    verification_level: settings.verification_level,
    system_channel_id: settings.system_channel_id,
    banner_url: settings.banner_url,
    premium_theme: settings.premium_theme
  };
}

function updateServerSettingsRecord(serverId, payload) {
  const notifications = ['all', 'mentions'].includes(payload.default_notifications)
    ? payload.default_notifications
    : 'all';
  const verificationLevels = ['none', 'low', 'medium', 'high'];
  const verification = verificationLevels.includes(payload.verification_level)
    ? payload.verification_level
    : 'low';
  let systemChannelId = null;
  if (Number.isFinite(payload.system_channel_id)) {
    const channel = selectChannelById.get(payload.system_channel_id);
    if (channel && channel.server_id === serverId) {
      systemChannelId = channel.id;
    }
  }
  const banner = (payload.banner_url || '').trim().slice(0, 512);
  const premiumTheme = (payload.premium_theme || '').trim().slice(0, 120);
  updateServerSettings.run(
    notifications,
    verification,
    systemChannelId,
    banner,
    premiumTheme,
    serverId
  );
  return getServerSettings(serverId);
}

function listVoiceParticipants(channelId) {
  return selectVoiceSessionsByChannel.all(channelId).map((session) => {
    let canSpeak = false;
    let canStream = false;
    try {
      const access = ensureChannelAccess(session.server_id, channelId, session.user_id);
      canSpeak = hasPermission(access.permissions, PERMISSIONS.SPEAK_VOICE);
      canStream = hasPermission(access.permissions, PERMISSIONS.STREAM);
    } catch {}
    return {
      user: {
        id: session.user_id,
        username: session.username,
        display_name: session.display_name,
        avatar_url: session.avatar_url,
        avatar_color: session.avatar_color || '#D97757'
      },
      muted: Boolean(session.muted),
      deafened: Boolean(session.deafened),
      canSpeak,
      canStream,
      joined_at: session.joined_at
    };
  });
}

function broadcastVoiceState(channelId) {
  const participants = listVoiceParticipants(channelId);
  io.to(getChannelRoom(channelId)).emit('voice:state', {
    channelId,
    participants
  });
}

app.get('/api/security/csrf-token', (req, res) => {
  // В режиме разработки CSRF отключен для API, возвращаем фиктивный токен
  if (process.env.NODE_ENV === 'development') {
    return res.json({ token: 'dev-csrf-token-disabled' });
  }
  // В production используем реальный CSRF токен
  if (typeof req.csrfToken === 'function') {
    res.json({ token: req.csrfToken() });
  } else {
    res.json({ token: 'csrf-not-available' });
  }
});

function ensureConversationAccess(conversationId, userId) {
  const conversation = selectConversationById.get(conversationId);
  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }
  const participant = selectParticipant.get(conversationId, userId);
  if (!participant) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
  return conversation;
}

function getConversationRoom(conversationId) {
  return `conversation:${conversationId}`;
}

function getUserRoom(userId) {
  return `user:${userId}`;
}

function broadcastConversationUpdate(conversationId) {
  const conversation = selectConversationById.get(conversationId);
  if (!conversation) return;
  const participants = selectParticipants.all(conversationId);
  participants.forEach((participant) => {
    const sanitized = sanitizeUser(participant);
    io.to(getUserRoom(sanitized.id)).emit('conversation:upsert', {
      conversation: serializeConversation(conversation, sanitized.id)
    });
  });
}

function getServerRoom(serverId) {
  return `server:${serverId}`;
}

function getChannelRoom(channelId) {
  return `channel:${channelId}`;
}

function broadcastServerUpdate(serverId) {
  const server = selectServerById.get(serverId);
  if (!server) return;
  const members = listServerMembers.all(serverId);
  members.forEach((member) => {
    io.to(getUserRoom(member.user_id)).emit('server:upsert', {
      server: serializeServerEntity(server, member.user_id)
    });
  });
}

function emitChannelMessage(message) {
  if (!message) return;
  io.to(getChannelRoom(message.channel_id)).emit('channel:message:new', {
    serverId: message.server_id,
    channelId: message.channel_id,
    message
  });
  listServerMembers.all(message.server_id).forEach((member) => {
    io.to(getUserRoom(member.user_id)).emit('channel:message:notify', {
      serverId: message.server_id,
      channelId: message.channel_id,
      message
    });
  });
}

function createMessage(conversationId, authorId, content, attachmentPayload = null, replyToMessageId = null) {
  const conversation = ensureConversationAccess(conversationId, authorId);
  const replyId = replyToMessageId ? Number(replyToMessageId) : null;
  if (replyId !== null && (!Number.isInteger(replyId) || !db.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ?').get(replyId, conversationId))) {
    const error = new Error('Сообщение для ответа не найдено в этом диалоге.');
    error.statusCode = 400;
    throw error;
  }
  const trimmed = (content || '').trim();
  if (!trimmed && !attachmentPayload) {
    const error = new Error('Message must include text or attachment.');
    error.statusCode = 400;
    throw error;
  }

  const attachmentForClient = attachmentPayload ? attachmentPayload.public : null;
  const result = insertMessage.run(
    conversation.id,
    authorId,
    trimmed || null,
    attachmentForClient ? JSON.stringify(attachmentForClient) : null,
    replyId
  );
  const messageId = result.lastInsertRowid;
  if (attachmentPayload) {
    insertAttachmentRecord.run(
      attachmentForClient.id,
      messageId,
      conversation.id,
      attachmentForClient.name,
      attachmentForClient.mime,
      attachmentForClient.size,
      attachmentPayload.storagePath
    );
  }
  updateConversationTimestamp.run(conversation.id);
  const row = selectMessageWithAuthor.get(messageId);
  const message = serializeMessage(row);
  broadcastConversationUpdate(conversation.id);
  io.to(getConversationRoom(conversation.id)).emit('message:new', {
    conversationId: conversation.id,
    message
  });
  getConversationParticipants(conversation.id).forEach((participant) => {
    io.to(getUserRoom(participant.id)).emit('message:notify', {
      conversationId: conversation.id,
      message
    });
  });
  return message;
}

function createChannelMessage(serverId, channelId, authorId, content, attachmentPayload = null, replyToMessageId = null) {
  const { channel, permissions } = ensureChannelAccess(serverId, channelId, authorId);
  if (!hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES)) {
    const error = new Error('Missing permission to send messages in this channel.');
    error.statusCode = 403;
    throw error;
  }
  if (channel.type !== 'text') {
    const error = new Error('Messages can only be sent to text channels.');
    error.statusCode = 400;
    throw error;
  }

  const replyId = replyToMessageId ? Number(replyToMessageId) : null;
  if (replyId !== null && (!Number.isInteger(replyId) || !db.prepare('SELECT id FROM server_messages WHERE id = ? AND server_id = ? AND channel_id = ?').get(replyId, serverId, channelId))) {
    const error = new Error('Сообщение для ответа не найдено в этом канале.');
    error.statusCode = 400;
    throw error;
  }
  const trimmed = (content || '').trim();
  if (!trimmed && !attachmentPayload) {
    const error = new Error('Message must include text or attachment.');
    error.statusCode = 400;
    throw error;
  }
  const attachmentForClient = attachmentPayload ? attachmentPayload.public : null;
  const result = insertServerMessage.run(
    channel.server_id,
    channel.id,
    authorId,
    trimmed || null,
    attachmentForClient ? JSON.stringify(attachmentForClient) : null,
    replyId
  );
  const messageId = result.lastInsertRowid;
  if (attachmentPayload) {
    insertServerAttachmentRecord.run(
      attachmentForClient.id,
      messageId,
      channel.server_id,
      channel.id,
      attachmentForClient.name,
      attachmentForClient.mime,
      attachmentForClient.size,
      attachmentPayload.storagePath
    );
  }
  const row = selectServerMessageWithAuthor.get(messageId);
  const message = serializeServerMessage(row);
  emitChannelMessage(message);
  return message;
}

function ensureFriends(userA, userB) {
  const existing = selectFriendshipBetween.get(userA, userB, userB, userA);
  return existing && existing.status === 'accepted';
}

const { createPasswordPolicy } = require('./services/password-policy');
const { validatePasswordStrength } = createPasswordPolicy({ minimumScore: PASSWORD_MIN_SCORE });

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  try {
    const user = selectUserById.get(id);
    done(null, sanitizeUser(user));
  } catch (error) {
    done(error);
  }
});

passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true
    },
    (req, email, password, done) => {
      try {
        if (typeof email !== 'string' || typeof password !== 'string') {
          return done(null, false, { message: 'Неверный email или пароль.' });
        }
        const user = selectUserByEmail.get(email.toLowerCase());
        if (!user || !user.password_hash) {
          return done(null, false, { message: 'Invalid credentials' });
        }
        const isMatch = bcrypt.compareSync(password, user.password_hash);
        if (!isMatch) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        if (user.twofa_enabled) {
          const token = req.body?.totp || req.body?.token;
          if (!token) {
            return done(null, false, {
              message: 'Two-factor code required.',
              twoFactorRequired: true
            });
          }
          const verified = speakeasy.totp.verify({
            secret: user.twofa_secret,
            encoding: 'base32',
            token,
            window: 1
          });
          if (!verified) {
            return done(null, false, {
              message: 'Invalid two-factor code.',
              twoFactorRequired: true
            });
          }
        }

        return done(null, sanitizeUser(user));
      } catch (error) {
        return done(error);
      }
    }
  )
);

const githubReady = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

if (githubReady) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/github/callback',
        scope: ['user:email']
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const existingAccount = selectOAuthAccount.get('github', profile.id);
          if (existingAccount) {
            const user = selectUserById.get(existingAccount.user_id);
            return done(null, sanitizeUser(user));
          }

          // Привязываем вход к существующему аккаунту только по ПОДТВЕРЖДЁННОМУ email GitHub.
          // Иначе можно добавить в GitHub чужой неподтверждённый email и войти в чужой аккаунт.
          const emails = Array.isArray(profile.emails) ? profile.emails : [];
          const verifiedEmail = (
            emails.find((item) => item?.verified === true && item?.primary) ||
            emails.find((item) => item?.verified === true)
          )?.value;
          const primaryEmail = verifiedEmail || `${profile.username || profile.id}@github.local`;

          let user = selectUserByEmail.get(primaryEmail.toLowerCase());
          if (user && !verifiedEmail) {
            // Совпадение найдено только по неподтверждённому/подставному адресу — не привязываем.
            return done(null, false, { message: 'GitHub account has no verified email.' });
          }
          if (!user) {
            const result = insertUser.run(
              primaryEmail.toLowerCase(),
              generateHandleFromEmail(primaryEmail),
              null,
              (profile.photos && profile.photos[0]?.value) || '',
              1,
              0,
              null
            );
            user = selectUserById.get(result.lastInsertRowid);
          }

          if (!user.profile_complete) {
            const desiredHandle = profile.username
              ? generateUniqueHandle(profile.username)
              : user.username;
            const preferredName = profile.displayName || profile.username || user.email.split('@')[0];
            markProfile.run(preferredName, desiredHandle, randomDiscriminator(), user.bio || '', user.avatar_color && user.avatar_color !== '#D97757' ? user.avatar_color : defaultAvatarColor(desiredHandle), Number.isInteger(user.avatar_preset) ? user.avatar_preset : 0, Number.isInteger(user.avatar_preset) ? user.avatar_preset : 0, preferredName, desiredHandle, user.id);
            user = selectUserById.get(user.id);
          }

          insertOAuthAccount.run(
            user.id,
            'github',
            profile.id,
            accessToken,
            refreshToken
          );

          return done(null, sanitizeUser(user));
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

const { registerAuthRoutes } = require('./routes/auth');
registerAuthRoutes({ app, authLimiter, isValidEmail, selectUserByEmail, validatePasswordStrength, bcrypt, generateHandleFromEmail, insertUser, db, defaultAvatarColor, selectUserById, sanitizeUser, ensureAuthenticated, speakeasy, QRCode, updateTwoFactor, updatePasswordHash, passport });

const { registerProfileRoutes } = require('./routes/profile');
registerProfileRoutes({ app, selectUserByUsername, ensureAuthenticated, friendActionLimiter, selectUserById, markProfile, randomDiscriminator, sanitizeUser, broadcastUserUpdate, upload, removeFileSafe, fileTypeFromFile, path, avatarsDir, sharp, db, fs, getUserSettings, updateUserSettingsRecord });

const { registerFriendRoutes } = require('./routes/friends');
registerFriendRoutes({ app, ensureAuthenticated, friendActionLimiter, listFriendships, hydrateFriendship, normalizeHandle, selectUserByUsername, selectFriendshipBetween, insertFriendRequest, selectFriendshipById, updateFriendStatus, deleteFriendship });

const { registerConversationRoutes } = require('./routes/conversations');
registerConversationRoutes({ app, ensureAuthenticated, listConversationsForUser, serializeConversation, normalizeHandle, selectUserByUsername, ensureFriends, selectConversationBetween, insertConversation, insertParticipant, selectConversationById, broadcastConversationUpdate });

const routeContext = {
  PERMISSIONS, PREMIUM_BALANCE_TOKEN, PREMIUM_BRAND, Server, app,
  assignRoleToMember, broadcastConversationUpdate, broadcastServerUpdate, broadcastVoiceState, computeBasePermissions,
  createChannelMessage, createMessage, db, deleteMessagePin, deleteMessageReaction,
  deleteOverride, deleteVoiceSession, ensureAuthenticated, ensureChannelAccess, ensureConversationAccess,
  ensurePermission, ensureServerMembership, ensureServerOwnership, friendActionLimiter, fs,
  getChannelRoom, getConversationRoom, getMessageDelivery, getMessagePin, getMessageReactions,
  getServerSettings, getUserRoom, githubReady, hasPermission, insertChannel,
  insertMessageDelivery, insertMessagePin, insertMessageReaction, insertPremiumSubscription, insertPremiumTransaction,
  insertRole, insertServer, insertServerMember, io, listChannelMessages,
  listChannelPins, listChannelsForServer, listDmPins, listMessages, listServerMembersSerialized,
  listServersForUser, listVoiceParticipants, messageLimiter, normalizeBadges, passport,
  path, processDmAttachment, processServerAttachment, randomBytes, randomUUID,
  removeFileSafe, removeRoleFromMember, sanitizeUser, selectActiveSubscription, selectAttachmentById,
  selectChannelById, selectChannelReadState, selectMessageWithAuthor, selectPremiumBalance, selectPremiumPlanById,
  selectPremiumPlans, selectPremiumTransactionById, selectRoleById, selectServerAttachmentById, selectServerById,
  selectServerMember, selectServerMessageWithAuthor, serializeChannel, serializeMessage, serializeServerEntity,
  serializeServerMessage, server, session, updateConversationRead, updatePremiumTransactionStatus,
  updateServerProfile, updateServerSettingsRecord, upload, uploadsDir, upsertChannelReadState,
  upsertOverride, upsertVoiceSession
};

require('./routes/server-management').register(routeContext);
require('./routes/server-messages').register(routeContext);
require('./routes/server-voice').register(routeContext);
require('./routes/premium').register(routeContext);
require('./routes/server-message-moderation').register(routeContext);
require('./routes/conversation-messages').register(routeContext);
require('./routes/auth-session').register(routeContext);

app.use(express.static(publicDir));

app.use((err, _req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ message: 'Invalid or missing CSRF token.' });
  }
  return next(err);
});

// Неизвестные API-маршруты — честный 404 в JSON, а не index.html со статусом 200
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Not found.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

registerSocketHandlers({
  io,
  activeCallParticipants,
  getUserRoom,
  sanitizeUser,
  ensureConversationAccess,
  getConversationRoom,
  createMessage,
  getConversationParticipants,
  ensureServerMembership,
  getServerRoom,
  ensureChannelAccess,
  hasPermission,
  PERMISSIONS,
  db,
  listVoiceParticipants,
  selectServerMember,
  broadcastVoiceState,
  deleteVoiceSessionsForUser,
  getChannelRoom
});

// Десктопный сервер слушает только loopback, чтобы он не был виден из локальной сети.
const HOST = process.env.HOST || (isDesktop ? '127.0.0.1' : '0.0.0.0');

server.listen(PORT, HOST, () => {
  console.log(`Auth service listening on http://${HOST}:${PORT}`);
  console.log(`Public directory: ${publicDir}`);
  console.log(`Data directory: ${dataDir}`);
  if (!githubReady) {
    console.warn('GitHub OAuth is disabled. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable it.');
  }
});

// Обработка ошибок сервера
server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Обработка неперехваченных ошибок
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Необработанный rejection (например, обрыв Redis или сбой одного запроса) не должен
// убивать весь сервер и все активные чаты — только логируем.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
