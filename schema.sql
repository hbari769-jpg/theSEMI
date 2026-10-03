-- ==========================================================
-- AESTIFIC CLOUDFLARE D1 RELATIONAL DATABASE SCHEMA (ALTERNATIVE EDGE TARGET)
-- Stack: Cloudflare Workers + Cloudflare D1 + Supabase Storage + Groq AI
-- Note: Authoritative Production database runs on Node.js / Cloud Run (server/db.ts)
-- Safe & Idempotent
-- ==========================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  system_prompt TEXT,
  preferred_model TEXT,
  memory_enabled INTEGER DEFAULT 1,
  language_preference TEXT,
  is_email_verified INTEGER DEFAULT 0,
  verification_code_hash TEXT,
  verification_code_expires_at INTEGER,
  verification_attempts INTEGER DEFAULT 0,
  last_verification_sent_at INTEGER,
  reset_password_code_hash TEXT,
  reset_password_expires_at INTEGER,
  reset_password_attempts INTEGER DEFAULT 0,
  last_password_reset_sent_at INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
  created_at TEXT NOT NULL,
  last_active_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2. CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  model TEXT DEFAULT 'openai/gpt-oss-120b',
  last_message_preview TEXT,
  is_pinned INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned ON conversations(user_id, is_pinned);
CREATE INDEX IF NOT EXISTS idx_conversations_user_archived ON conversations(user_id, is_archived, is_pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_id_user ON conversations(id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- 3. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  file_ids TEXT,
  liked INTEGER DEFAULT 0,
  disliked INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- 4. FILES TABLE (Supabase Storage references)
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  message_id TEXT,
  storage_provider TEXT DEFAULT 'supabase',
  bucket_name TEXT DEFAULT 'aestific-files',
  storage_path TEXT NOT NULL,
  unique_file_id TEXT,
  filename TEXT,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  url TEXT,
  extracted_text TEXT,
  chunks TEXT,
  is_scanned INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,
  duration REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_user_created ON files(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_files_conversation_id ON files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_files_storage_path ON files(storage_path);
CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename);
CREATE INDEX IF NOT EXISTS idx_files_unique_file_id ON files(unique_file_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);

-- 5. USAGE DAILY (Analytics and usage tracking ONLY - strictly NO quota or restriction)
CREATE TABLE IF NOT EXISTS usage_daily (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  chat_count INTEGER DEFAULT 0,
  photo_count INTEGER DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(usage_date);

-- 6. ACCOUNT MEMORIES
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  category TEXT DEFAULT 'general',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_updated ON memories(user_id, updated_at);

-- 7. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'replied', 'closed')),
  admin_reply TEXT,
  replied_at TEXT,
  replied_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created ON support_tickets(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- 8. ADMIN AUDIT LOGS
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_name TEXT NOT NULL,
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_timestamp ON admin_logs(timestamp);

-- 9. BANNED ADMINS
CREATE TABLE IF NOT EXISTS banned_admins (
  admin_name TEXT PRIMARY KEY,
  banned_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  banned_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_banned_admins_expires ON banned_admins(expires_at);

-- 10. SYSTEM LOCKS (Concurrency protection for background jobs and retention cleanup)
CREATE TABLE IF NOT EXISTS system_locks (
  lock_name TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_locks_expires ON system_locks(expires_at);
