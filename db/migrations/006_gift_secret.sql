-- Add secret field to gifts for secure claiming
-- Secret is a one-time password that only the recipient should know
alter table gifts add column if not exists claim_secret text;
alter table gifts add column if not exists claim_secret_hash text;

-- Index for faster lookups (though we'll primarily use claim_code)
create index if not exists idx_gifts_secret_hash on gifts(claim_secret_hash) where claim_secret_hash is not null;

