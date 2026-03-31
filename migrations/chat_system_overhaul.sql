-- ===================================================================
-- VEX CHAT SYSTEM OVERHAUL MIGRATION
-- Date: 2026-03-04
-- Purpose: Fix all chat DB gaps, add missing tables/columns/indexes
-- ===================================================================

BEGIN;

-- ==================== 1. SUPPORT CHAT TABLES (Missing from production) ====================

-- Support ticket status enum
DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('open', 'active', 'waiting', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Support Tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id character varying NOT NULL REFERENCES users(id),
  subject text,
  status support_ticket_status DEFAULT 'open' NOT NULL,
  assigned_admin_id character varying,
  last_message_at timestamp without time zone DEFAULT now() NOT NULL,
  closed_at timestamp without time zone,
  closed_by character varying,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_msg ON support_tickets(last_message_at);
-- Composite for admin listing (status + last_message_at DESC) - avoids sort
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_last_msg ON support_tickets(status, last_message_at DESC);
-- User active ticket lookup (user_id + status) - fast "find open ticket"
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(user_id, status);

-- Support Messages table
CREATE TABLE IF NOT EXISTS support_messages (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ticket_id character varying NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id character varying NOT NULL,
  sender_type text DEFAULT 'user' NOT NULL,
  content text NOT NULL,
  media_url text,
  media_type text,
  media_name text,
  is_auto_reply boolean DEFAULT false NOT NULL,
  is_read boolean DEFAULT false NOT NULL,
  read_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(created_at);
-- Composite for unread count queries (ticket_id + is_read + sender_type)
CREATE INDEX IF NOT EXISTS idx_support_messages_unread ON support_messages(ticket_id, is_read, sender_type) WHERE is_read = false;
-- For admin global unread count
CREATE INDEX IF NOT EXISTS idx_support_messages_admin_unread ON support_messages(sender_type, is_read) WHERE is_read = false AND sender_type = 'user';

-- Support Auto-Replies table
CREATE TABLE IF NOT EXISTS support_auto_replies (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  trigger text NOT NULL,
  response text NOT NULL,
  response_ar text,
  is_enabled boolean DEFAULT true NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- ==================== 2. CHAT MESSAGES - Add missing production columns ====================

-- E2EE fields (schema has them, production doesn't)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS encrypted_content text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_public_key text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS nonce text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_encrypted boolean DEFAULT false NOT NULL;

-- Media fields (schema has them, production doesn't)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_thumbnail_url text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_size integer;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_mime_type text;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_original_name text;

-- Reply/Edit/Reactions (schema has them, production doesn't)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id character varying;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false NOT NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamp without time zone;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions jsonb;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_for_users text[] DEFAULT ARRAY[]::text[];

-- Auto-delete field (schema has it, production doesn't)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS auto_delete_at timestamp without time zone;

-- ==================== 3. CHAT MESSAGES - Performance Indexes ====================

-- Conversation index (the most critical - used in every chat load)
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(sender_id, receiver_id, created_at DESC);

-- Auto-delete cleanup cron
CREATE INDEX IF NOT EXISTS idx_chat_messages_auto_delete ON chat_messages(auto_delete_at) WHERE auto_delete_at IS NOT NULL;

-- Soft-delete filter (deletedAt IS NULL used in almost every query)
CREATE INDEX IF NOT EXISTS idx_chat_messages_active ON chat_messages(created_at DESC) WHERE deleted_at IS NULL;

-- Unread messages per user (used for badge counts)
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(receiver_id, sender_id, is_read) WHERE is_read = false AND deleted_at IS NULL;

-- Full-text search on content (for search_messages)
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm ON chat_messages USING gin (content gin_trgm_ops);

-- ==================== 4. CHAT MEDIA PERMISSIONS TABLE ====================

CREATE TABLE IF NOT EXISTS chat_media_permissions (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id character varying NOT NULL REFERENCES users(id) UNIQUE,
  media_enabled boolean DEFAULT false NOT NULL,
  granted_by text DEFAULT 'purchase' NOT NULL,
  granted_at timestamp without time zone DEFAULT now() NOT NULL,
  expires_at timestamp without time zone,
  price_paid numeric(15,2) DEFAULT 0.00,
  revoked_at timestamp without time zone,
  revoked_by character varying,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_media_perm_user ON chat_media_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_media_perm_enabled ON chat_media_permissions(media_enabled);

-- ==================== 5. CHAT AUTO-DELETE PERMISSIONS TABLE ====================

CREATE TABLE IF NOT EXISTS chat_auto_delete_permissions (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id character varying NOT NULL REFERENCES users(id) UNIQUE,
  auto_delete_enabled boolean DEFAULT false NOT NULL,
  delete_after_minutes integer DEFAULT 60 NOT NULL,
  granted_by text DEFAULT 'purchase' NOT NULL,
  granted_at timestamp without time zone DEFAULT now() NOT NULL,
  expires_at timestamp without time zone,
  price_paid numeric(15,2) DEFAULT 0.00,
  revoked_at timestamp without time zone,
  revoked_by character varying,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_auto_del_perm_user ON chat_auto_delete_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_auto_del_perm_enabled ON chat_auto_delete_permissions(auto_delete_enabled);

-- ==================== 6. NOTIFICATIONS - Performance Indexes ====================

-- Composite for user unread listing (the most common notification query)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;

-- For cleanup of old read notifications
CREATE INDEX IF NOT EXISTS idx_notifications_cleanup ON notifications(is_read, created_at) WHERE is_read = true;

-- ==================== 7. CHALLENGE CHAT - Performance Indexes ====================

CREATE INDEX IF NOT EXISTS idx_challenge_chat_session_time ON challenge_chat_messages(session_id, created_at DESC);

-- ==================== 8. GAME CHAT - Performance Indexes ====================

CREATE INDEX IF NOT EXISTS idx_game_chat_session_time ON game_chat_messages(session_id, created_at DESC);

-- ==================== 9. COMPLAINT MESSAGES - Performance Indexes ====================

CREATE INDEX IF NOT EXISTS idx_complaint_messages_time ON complaint_messages(complaint_id, created_at DESC);

-- ==================== 10. BROADCAST NOTIFICATIONS - Expiry Index ====================

CREATE INDEX IF NOT EXISTS idx_broadcast_expires ON broadcast_notifications(expires_at) WHERE expires_at IS NOT NULL;

-- ==================== 11. TRIGRAM EXTENSION (for ILIKE search performance) ====================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==================== 12. CHAT SETTINGS - Ensure unique constraint ====================

-- The key column should already be UNIQUE, but enforce it
DO $$ BEGIN
  ALTER TABLE chat_settings ADD CONSTRAINT chat_settings_key_unique UNIQUE (key);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

COMMIT;
