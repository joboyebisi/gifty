-- Migration: Create bulk_gifts and bulk_gift_recipients tables
-- For bulk holiday gift campaigns (HR/CEO team gifting)

-- Bulk gifts table
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

-- Bulk gift recipients table
CREATE TABLE IF NOT EXISTS bulk_gift_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_gift_id UUID NOT NULL REFERENCES bulk_gifts(id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255),
  email VARCHAR(255),
  telegram_handle VARCHAR(255),
  phone_number VARCHAR(50),
  country VARCHAR(100),
  gift_id UUID, -- Reference to individual gift (if USDC)
  goody_order_id VARCHAR(255), -- Goody order ID (if Goody gift)
  claim_code VARCHAR(255), -- Individual claim code (if USDC)
  claim_secret VARCHAR(255), -- Individual secret (if USDC)
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
  claimed_at TIMESTAMP,
  claimer_wallet_address VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_gifts_code ON bulk_gifts(bulk_gift_code);
CREATE INDEX IF NOT EXISTS idx_bulk_gifts_sender ON bulk_gifts(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_gifts_status ON bulk_gifts(status);
CREATE INDEX IF NOT EXISTS idx_bulk_gift_recipients_bulk_gift_id ON bulk_gift_recipients(bulk_gift_id);
CREATE INDEX IF NOT EXISTS idx_bulk_gift_recipients_email ON bulk_gift_recipients(email);
CREATE INDEX IF NOT EXISTS idx_bulk_gift_recipients_phone ON bulk_gift_recipients(phone_number);
CREATE INDEX IF NOT EXISTS idx_bulk_gift_recipients_status ON bulk_gift_recipients(status);
CREATE INDEX IF NOT EXISTS idx_bulk_gift_recipients_claim_code ON bulk_gift_recipients(claim_code);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bulk_gifts_updated_at BEFORE UPDATE ON bulk_gifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bulk_gift_recipients_updated_at BEFORE UPDATE ON bulk_gift_recipients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

