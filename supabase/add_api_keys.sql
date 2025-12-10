-- Add API keys tables for platform and org-scoped keys

create table if not exists public.platform_api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null,
  label text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  last_used_at timestamptz
);

create table if not exists public.org_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  key_hash text not null,
  label text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  last_used_at timestamptz
);

-- Indexes
create index if not exists idx_platform_api_keys_created_by on public.platform_api_keys(created_by);
create index if not exists idx_org_api_keys_org_id on public.org_api_keys(org_id);

-- Note: store only hashes in DB. Use a strong hash function when generating tokens in server code.
