-- Migration: Create group_messages table for storing Telegram group messages
-- This enables AI analysis of group member personalities

CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  message_text TEXT,
  message_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(chat_id, message_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_group_messages_chat_id ON group_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_user_id ON group_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_date ON group_messages(message_date);
CREATE INDEX IF NOT EXISTS idx_group_messages_chat_user ON group_messages(chat_id, user_id);

-- Composite index for common queries (get messages by chat and user)
CREATE INDEX IF NOT EXISTS idx_group_messages_chat_user_date ON group_messages(chat_id, user_id, message_date DESC);

