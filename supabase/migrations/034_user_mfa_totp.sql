create table if not exists public.user_mfa_totp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_tag text not null,
  verified boolean not null default false,
  enabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_mfa_totp_user_idx
  on public.user_mfa_totp (user_id, verified);

alter table public.user_mfa_totp enable row level security;
