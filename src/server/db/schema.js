'use strict';

function createDatabase({ Database, path, dataDir, env = process.env }) {
  const db = new Database(env.DB_PATH || path.join(dataDir, 'hearth.db'));
  db.pragma('journal_mode = WAL');
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS http_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `).run();
  
  if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_sessions'").get()) {
    db.prepare('INSERT OR IGNORE INTO http_sessions (sid, sess, expires_at) SELECT sid, sess, expires_at FROM app_sessions').run();
  }
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT,
      avatar_url TEXT DEFAULT '',
      email_verified INTEGER DEFAULT 0,
      twofa_secret TEXT,
      twofa_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  
  const ensureUserColumn = (name, definition) => {
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const exists = columns.some((column) => column.name === name);
    if (!exists) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${definition}`).run();
    }
  };
  
  const ensureChannelColumn = (name, definition) => {
    const columns = db.prepare('PRAGMA table_info(channels)').all();
    const exists = columns.some((column) => column.name === name);
    if (!exists) {
      db.prepare(`ALTER TABLE channels ADD COLUMN ${definition}`).run();
    }
  };
  
  ensureUserColumn('display_name', `display_name TEXT DEFAULT ''`);
  ensureUserColumn('discriminator', `discriminator TEXT DEFAULT '0001'`);
  ensureUserColumn('profile_complete', `profile_complete INTEGER DEFAULT 0`);
  ensureUserColumn('bio', `bio TEXT DEFAULT ''`);
  ensureUserColumn('avatar_color', `avatar_color TEXT DEFAULT '#D97757'`);
  const hadAvatarPresetColumn = db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'avatar_preset');
  ensureUserColumn('avatar_preset', 'avatar_preset INTEGER');
  if (!hadAvatarPresetColumn) {
    db.prepare('UPDATE users SET avatar_preset = ((id * 7 + 3) % 12)').run();
  }
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS users_assign_avatar_preset
    AFTER INSERT ON users
    WHEN NEW.avatar_preset IS NULL
    BEGIN
      UPDATE users SET avatar_preset = ((NEW.id * 7 + 3) % 12) WHERE id = NEW.id;
    END
  `).run();
  ensureUserColumn('username_changed_at', 'username_changed_at DATETIME');
  ensureUserColumn('display_name_changed_at', 'display_name_changed_at DATETIME');
  ensureUserColumn('status', "status TEXT DEFAULT 'online'");
  ensureUserColumn('custom_status', "custom_status TEXT DEFAULT ''");
  db.prepare("UPDATE users SET avatar_color = '#D97757' WHERE avatar_color IS NULL OR avatar_color = ''").run();
  ensureUserColumn('email_verified', `email_verified INTEGER DEFAULT 0`);
  ensureUserColumn('twofa_secret', `twofa_secret TEXT`);
  ensureUserColumn('twofa_enabled', `twofa_enabled INTEGER DEFAULT 0`);
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, provider_user_id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'dm',
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS conversation_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_read_message_id INTEGER,
      UNIQUE(conversation_id, user_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      content TEXT,
      attachment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id),
      FOREIGN KEY(author_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  if (!db.prepare('PRAGMA table_info(messages)').all().some((column) => column.name === 'edited_at')) {
    db.prepare('ALTER TABLE messages ADD COLUMN edited_at DATETIME').run();
  }
  if (!db.prepare('PRAGMA table_info(messages)').all().some((column) => column.name === 'reply_to_message_id')) {
    db.prepare('ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER').run();
  }
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id INTEGER NOT NULL,
      conversation_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(message_id) REFERENCES messages(id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(owner_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS server_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      nickname TEXT DEFAULT '',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(server_id, user_id),
      FOREIGN KEY(server_id) REFERENCES servers(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      name TEXT NOT NULL,
      topic TEXT DEFAULT '',
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(server_id) REFERENCES servers(id)
    )
  `).run();
  
  ensureChannelColumn('slow_mode_seconds', 'slow_mode_seconds INTEGER DEFAULT 0');
  ensureChannelColumn('is_nsfw', 'is_nsfw INTEGER DEFAULT 0');
  ensureChannelColumn('bitrate', 'bitrate INTEGER DEFAULT 64000');
  ensureChannelColumn('user_limit', 'user_limit INTEGER DEFAULT 8');
  db.prepare('UPDATE channels SET user_limit = 8 WHERE user_limit IS NULL OR user_limit = 0').run();
  ensureChannelColumn('soundscape', "soundscape TEXT DEFAULT ''");
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS server_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      content TEXT,
      attachment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(server_id) REFERENCES servers(id),
      FOREIGN KEY(channel_id) REFERENCES channels(id),
      FOREIGN KEY(author_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK (scope IN ('dm', 'channel')),
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(scope, message_id, user_id, emoji),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK (scope IN ('dm', 'channel')),
      message_id INTEGER NOT NULL,
      conversation_id INTEGER,
      server_id INTEGER,
      channel_id INTEGER,
      pinned_by INTEGER NOT NULL,
      pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(scope, message_id),
      FOREIGN KEY(pinned_by) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS channel_read_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id, user_id),
      FOREIGN KEY(channel_id) REFERENCES channels(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  if (!db.prepare('PRAGMA table_info(server_messages)').all().some((column) => column.name === 'edited_at')) {
    db.prepare('ALTER TABLE server_messages ADD COLUMN edited_at DATETIME').run();
  }
  if (!db.prepare('PRAGMA table_info(server_messages)').all().some((column) => column.name === 'reply_to_message_id')) {
    db.prepare('ALTER TABLE server_messages ADD COLUMN reply_to_message_id INTEGER').run();
  }
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS server_attachments (
      id TEXT PRIMARY KEY,
      server_message_id INTEGER NOT NULL,
      server_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(server_message_id) REFERENCES server_messages(id),
      FOREIGN KEY(server_id) REFERENCES servers(id),
      FOREIGN KEY(channel_id) REFERENCES channels(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      addressee_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requester_id, addressee_id),
      FOREIGN KEY(requester_id) REFERENCES users(id),
      FOREIGN KEY(addressee_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      theme TEXT DEFAULT 'system',
      accent TEXT DEFAULT 'terracotta',
      background_url TEXT DEFAULT '',
      reduce_motion INTEGER DEFAULT 0,
      badges TEXT DEFAULT '[]',
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  // Миграция старых цветных тем (nebula/midnight/lilac/onyx/solstice) и акцентов:
  // прежний интерфейс был тёмным, поэтому всё сводим к 'dark'; новые значения — light/dark/system.
  db.prepare(`
    UPDATE user_settings
    SET theme = 'dark'
    WHERE theme NOT IN ('light', 'dark', 'system')
  `).run();
  db.prepare(`
    UPDATE user_settings
    SET accent = 'terracotta'
    WHERE accent != 'terracotta'
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS server_settings (
      server_id INTEGER PRIMARY KEY,
      default_notifications TEXT DEFAULT 'all',
      verification_level TEXT DEFAULT 'low',
      system_channel_id INTEGER,
      banner_url TEXT DEFAULT '',
      premium_theme TEXT DEFAULT '',
      FOREIGN KEY(server_id) REFERENCES servers(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS premium_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      perks TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS premium_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      renews_at DATETIME,
      metadata TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(plan_id) REFERENCES premium_plans(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS premium_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending',
      payment_intent TEXT,
      client_secret TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(plan_id) REFERENCES premium_plans(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS server_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#ffffff',
      position INTEGER DEFAULT 0,
      permissions INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(server_id) REFERENCES servers(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS server_member_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE(server_id, role_id, user_id),
      FOREIGN KEY(server_id) REFERENCES servers(id),
      FOREIGN KEY(role_id) REFERENCES server_roles(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS channel_permission_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('role', 'member')),
      target_id INTEGER NOT NULL,
      allow INTEGER NOT NULL DEFAULT 0,
      deny INTEGER NOT NULL DEFAULT 0,
      UNIQUE(channel_id, target_type, target_id),
      FOREIGN KEY(channel_id) REFERENCES channels(id)
    )
  `).run();
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      muted INTEGER DEFAULT 0,
      deafened INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id, user_id),
      FOREIGN KEY(server_id) REFERENCES servers(id),
      FOREIGN KEY(channel_id) REFERENCES channels(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  
  // Voice sessions are ephemeral: never restore ghost participants after a process restart.
  db.prepare('DELETE FROM voice_sessions').run();
  
  
  return db;
}

module.exports = { createDatabase };
