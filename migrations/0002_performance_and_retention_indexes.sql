-- ==========================================================
-- Migration 0002: Performance & 30-Day Retention Indexes
-- Optimizes query execution, filtering, foreign keys, and TTL retention
-- Safe & Idempotent (CREATE INDEX IF NOT EXISTS)
-- ==========================================================

-- 1. USERS INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2. CONVERSATIONS INDEXES (Including 30-Day Retention query optimization)
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_pinned ON conversations(user_id, is_pinned);
CREATE INDEX IF NOT EXISTS idx_conversations_user_archived ON conversations(user_id, is_archived, is_pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_id_user ON conversations(id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- 3. MESSAGES INDEXES (Including 30-Day Retention query optimization)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- 4. FILES INDEXES (Fast lookup by filename/ID & 30-Day Retention cleanup)
CREATE INDEX IF NOT EXISTS idx_files_user_created ON files(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_files_conversation_id ON files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_files_storage_path ON files(storage_path);
CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename);
CREATE INDEX IF NOT EXISTS idx_files_unique_file_id ON files(unique_file_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);

-- 5. USAGE DAILY INDEXES
CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(usage_date);

-- 6. ACCOUNT MEMORIES INDEXES
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_updated ON memories(user_id, updated_at);

-- 7. SUPPORT TICKETS INDEXES
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created ON support_tickets(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- 8. ADMIN AUDIT LOGS INDEXES
CREATE INDEX IF NOT EXISTS idx_admin_logs_timestamp ON admin_logs(timestamp);

-- 9. BANNED ADMINS INDEXES
CREATE INDEX IF NOT EXISTS idx_banned_admins_expires ON banned_admins(expires_at);
