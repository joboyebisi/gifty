-- Migration: Add phone_number to birthdays table
-- Run this in Supabase SQL Editor

ALTER TABLE birthdays ADD COLUMN IF NOT EXISTS phone_number TEXT;
CREATE INDEX IF NOT EXISTS idx_birthdays_phone ON birthdays(phone_number);

