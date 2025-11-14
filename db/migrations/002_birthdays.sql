-- Birthdays table
create table if not exists birthdays (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  telegram_handle text,
  email text,
  month int not null,
  day int not null,
  year int,
  visibility text default 'public',
  source text default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_birthdays_month_day on birthdays(month, day);
create index if not exists idx_birthdays_telegram_handle on birthdays(telegram_handle);

