-- Users table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique,
  telegram_handle text,
  email text,
  telegram_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_wallet on users(wallet_address);
create index if not exists idx_users_telegram_handle on users(telegram_handle);
create index if not exists idx_users_telegram_user_id on users(telegram_user_id);
create index if not exists idx_users_email on users(email);

