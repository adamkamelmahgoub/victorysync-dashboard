create table if not exists public.org_billing_locks (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  locked boolean not null default false,
  reason text null,
  locked_by uuid null,
  locked_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_billing_locks_locked_idx
  on public.org_billing_locks (locked, locked_until);

alter table public.org_billing_locks enable row level security;

create table if not exists public.invite_verification_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  invite_id uuid null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invite_verification_codes_lookup_idx
  on public.invite_verification_codes (org_id, lower(email), expires_at desc);

alter table public.invite_verification_codes enable row level security;
