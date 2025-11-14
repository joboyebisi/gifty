-- Add Circle wallet ID to users table for balance checking
alter table users add column if not exists circle_wallet_id text;

create index if not exists idx_users_circle_wallet on users(circle_wallet_id);

