-- ============================================
-- COMPLETE DATABASE MIGRATION FOR GIFTY
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- This will create all required tables

-- ============================================
-- Migration 1: Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE,
  telegram_handle TEXT,
  email TEXT,
  telegram_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_telegram_handle ON users(telegram_handle);
CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- Migration 2: Add Circle Wallet ID to Users
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS circle_wallet_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_circle_wallet ON users(circle_wallet_id);

-- ============================================
-- Migration 3: Persona Snapshots (AI)
-- ============================================
CREATE TABLE IF NOT EXISTS persona_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_handle TEXT NOT NULL,
  provider TEXT NOT NULL,
  persona_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Migration 4: Generated Messages
-- ============================================
CREATE TABLE IF NOT EXISTS generated_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id TEXT NOT NULL,
  idx INT NOT NULL,
  provider TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Migration 5: Gifts Table
-- ============================================
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_code TEXT UNIQUE NOT NULL,
  sender_user_id TEXT,
  recipient_handle TEXT,
  recipient_email TEXT,
  amount_usdc TEXT NOT NULL,
  src_chain TEXT DEFAULT 'ethereum',
  dst_chain TEXT DEFAULT 'arc',
  message TEXT,
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  claimer_wallet_address TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gifts_claim_code ON gifts(claim_code);
CREATE INDEX IF NOT EXISTS idx_gifts_status ON gifts(status);

-- ============================================
-- Migration 6: Add Gift Secret and Circle Wallet Columns
-- ============================================
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS claim_secret TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS claim_secret_hash TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS circle_wallet_id TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS circle_transfer_id TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS transfer_status TEXT DEFAULT 'pending';
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS sender_wallet_address TEXT;

CREATE INDEX IF NOT EXISTS idx_gifts_circle_wallet ON gifts(circle_wallet_id);
CREATE INDEX IF NOT EXISTS idx_gifts_transfer_status ON gifts(transfer_status);
CREATE INDEX IF NOT EXISTS idx_gifts_sender_wallet ON gifts(sender_wallet_address);
CREATE INDEX IF NOT EXISTS idx_gifts_secret_hash ON gifts(claim_secret_hash) WHERE claim_secret_hash IS NOT NULL;

-- ============================================
-- Migration 7: Birthdays Table
-- ============================================
CREATE TABLE IF NOT EXISTS birthdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  telegram_handle TEXT,
  email TEXT,
  month INT NOT NULL,
  day INT NOT NULL,
  year INT,
  visibility TEXT DEFAULT 'public',
  source TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_birthdays_month_day ON birthdays(month, day);
CREATE INDEX IF NOT EXISTS idx_birthdays_telegram_handle ON birthdays(telegram_handle);

-- ============================================
-- Migration 8: Email Verifications
-- ============================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(code);

-- ============================================
-- Migration 9: Bulk Gifts
-- ============================================
CREATE TABLE IF NOT EXISTS bulk_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_gift_code VARCHAR(50) UNIQUE NOT NULL,
  sender_user_id VARCHAR(255) NOT NULL,
  sender_wallet_address VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  sender_name VARCHAR(255) NOT NULL,
  gift_type VARCHAR(20) NOT NULL CHECK (gift_type IN ('goody', 'usdc', 'mixed')),
  product_id VARCHAR(255),
  amount_usdc VARCHAR(50),
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  goody_batch_id VARCHAR(255),
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_gifts_code ON bulk_gifts(bulk_gift_code);
CREATE INDEX IF NOT EXISTS idx_bulk_gifts_sender ON bulk_gifts(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_gifts_status ON bulk_gifts(status);

CREATE TABLE IF NOT EXISTS bulk_gift_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_gift_id UUID NOT NULL REFERENCES bulk_gifts(id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255),
  email VARCHAR(255),
  telegram_handle VARCHAR(255),
  phone_number VARCHAR(50),
  country VARCHAR(100),
  gift_id UUID,
  goody_order_id VARCHAR(255),
  claim_code VARCHAR(255),
  claim_secret VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
  claimed_at TIMESTAMP,
  claimer_wallet_address VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_recipients_bulk_gift_id ON bulk_gift_recipients(bulk_gift_id);
CREATE INDEX IF NOT EXISTS idx_bulk_recipients_email ON bulk_gift_recipients(email);
CREATE INDEX IF NOT EXISTS idx_bulk_recipients_phone ON bulk_gift_recipients(phone_number);
CREATE INDEX IF NOT EXISTS idx_bulk_recipients_status ON bulk_gift_recipients(status);
CREATE INDEX IF NOT EXISTS idx_bulk_recipients_claim_code ON bulk_gift_recipients(claim_code);

-- ============================================
-- Migration 10: Group Messages (for analysis)
-- ============================================
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  text TEXT,
  message_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_chat ON group_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_user ON group_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_date ON group_messages(message_date);

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify all tables were created:
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Expected tables:
-- birthdays
-- bulk_gift_recipients
-- bulk_gifts
-- email_verifications
-- generated_messages
-- gifts
-- group_messages
-- persona_snapshots
-- users

