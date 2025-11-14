-- Email verifications table
create table if not exists email_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  verified boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_verifications_email on email_verifications(email);
create index if not exists idx_email_verifications_code on email_verifications(code);

