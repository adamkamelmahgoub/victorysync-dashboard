-- 006_add_org_invites.sql
-- Create a lightweight `org_invites` table to record pending invitations
create table if not exists public.org_invites (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('agent', 'org_manager', 'org_admin')),
  invited_by uuid,
  invited_at timestamptz default now(),
  unique(org_id, email)
);

-- Index for lookup
create index if not exists idx_org_invites_org_id on public.org_invites(org_id);
