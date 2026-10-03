-- ==========================================================
-- Migration 0001: Initial Relational Schema for Aestific
-- Cloudflare D1 Relational SQLite Schema
-- Idempotent and non-destructive
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

-- 4. FILES TABLE
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

-- 5. DAILY USAGE TELEMETRY TABLE
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

-- 6. ACCOUNT MEMORIES TABLE
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

-- 7. SUPPORT TICKETS TABLE
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

-- 8. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_name TEXT NOT NULL,
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL
);

-- 9. BANNED ADMINS TABLE
CREATE TABLE IF NOT EXISTS banned_admins (
  admin_name TEXT PRIMARY KEY,
  banned_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  banned_by TEXT
);
