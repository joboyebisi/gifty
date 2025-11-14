-- Persona snapshots for recipients
create table if not exists persona_snapshots (
  id uuid primary key default gen_random_uuid(),
  recipient_handle text not null,
  provider text not null,
  persona_summary text not null,
  created_at timestamptz not null default now()
);

-- Generated birthday messages tied to a gift id (string id from app)
create table if not exists generated_messages (
  id uuid primary key default gen_random_uuid(),
  gift_id text not null,
  idx int not null,
  provider text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Gifts table
create table if not exists gifts (
  id uuid primary key default gen_random_uuid(),
  claim_code text unique not null,
  sender_user_id text,
  recipient_handle text,
  recipient_email text,
  amount_usdc text not null,
  src_chain text default 'ethereum',
  dst_chain text default 'arc',
  message text,
  status text default 'pending',
  expires_at timestamptz,
  claimer_wallet_address text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_gifts_claim_code on gifts(claim_code);
create index if not exists idx_gifts_status on gifts(status);


