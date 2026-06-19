create table if not exists public.user_mfa_email (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  code_hash text null,
  code_expires_at timestamptz null,
  verified boolean not null default false,
  enabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_mfa_email_user_unique unique (user_id)
);

create index if not exists user_mfa_email_user_verified_idx
  on public.user_mfa_email (user_id, verified);

alter table public.user_mfa_email enable row level security;
