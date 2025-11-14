-- Points and Rewards System
-- This table tracks points earned by users for sending gifts and receiving appreciation

CREATE TABLE IF NOT EXISTS user_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  total_sent INTEGER NOT NULL DEFAULT 0, -- Total gifts sent
  total_received INTEGER NOT NULL DEFAULT 0, -- Total gifts received
  total_appreciated INTEGER NOT NULL DEFAULT 0, -- Times recipient appreciated
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Points transactions log
CREATE TABLE IF NOT EXISTS points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_id UUID REFERENCES gifts(id) ON DELETE SET NULL,
  points INTEGER NOT NULL, -- Can be positive (earned) or negative (spent)
  reason TEXT NOT NULL, -- e.g., "gift_sent", "gift_appreciated", "bonus"
  metadata JSONB, -- Additional context
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appreciation messages
CREATE TABLE IF NOT EXISTS gift_appreciations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id UUID NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  points_awarded INTEGER NOT NULL DEFAULT 10, -- Points given to sender
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_user_id ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_gift_id ON points_transactions(gift_id);
CREATE INDEX IF NOT EXISTS idx_gift_appreciations_gift_id ON gift_appreciations(gift_id);
CREATE INDEX IF NOT EXISTS idx_gift_appreciations_sender_id ON gift_appreciations(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_gift_appreciations_recipient_id ON gift_appreciations(recipient_user_id);

-- Function to update user points
CREATE OR REPLACE FUNCTION update_user_points()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_points (user_id, points, total_sent, total_received, total_appreciated)
  VALUES (NEW.user_id, NEW.points, 0, 0, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    points = user_points.points + NEW.points,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update points when transaction is created
CREATE TRIGGER trigger_update_user_points
AFTER INSERT ON points_transactions
FOR EACH ROW
EXECUTE FUNCTION update_user_points();

