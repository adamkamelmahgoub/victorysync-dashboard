-- 007_extend_org_schema_and_add_modules.sql
-- Extend organizations table and add new tables for billing, support, numbers, audit logs

-- Extend organizations table with additional fields
alter table public.organizations
add column if not exists timezone text default 'America/New_York',
add column if not exists sla_target_percent int default 90,
add column if not exists sla_target_seconds int default 30,
add column if not exists business_hours jsonb default '{
  "monday": {"open": "09:00", "close": "17:00"},
  "tuesday": {"open": "09:00", "close": "17:00"},
  "wednesday": {"open": "09:00", "close": "17:00"},
  "thursday": {"open": "09:00", "close": "17:00"},
  "friday": {"open": "09:00", "close": "17:00"},
  "saturday": null,
  "sunday": null
}'::jsonb,
add column if not exists escalation_email text;

-- Update org_members roles to match new enum: owner, admin, member
-- Note: existing roles are agent, org_manager, org_admin; we'll map them
-- For now, assume migration: org_admin -> admin, org_manager -> admin, agent -> member
-- But to be safe, we'll add a new column and update later if needed
-- Actually, let's update the check constraint
alter table public.org_members drop constraint if exists org_members_role_check;
alter table public.org_members add constraint org_members_role_check check (role in ('owner', 'admin', 'member'));

-- Update existing roles (this is a one-time migration)
update public.org_members set role = 'admin' where role in ('org_admin', 'org_manager');
update public.org_members set role = 'member' where role = 'agent';

-- Adjust phone_numbers table to match new schema
-- Existing: id, number, external_id, org_id, label, created_at, updated_at
-- New: id, org_id, e164, label, status, metadata, created_at
alter table public.phone_numbers
drop column if exists number,
drop column if exists external_id,
drop column if exists updated_at,
add column if not exists e164 text unique,
add column if not exists status text default 'active' check (status in ('active', 'pending', 'archived')),
add column if not exists metadata jsonb default '{}'::jsonb;

-- Migrate existing data if any (assuming number is e164)
update public.phone_numbers set e164 = number where e164 is null and number is not null;

-- Drop old unique on number, add on e164
alter table public.phone_numbers drop constraint if exists phone_numbers_number_key;
alter table public.phone_numbers add constraint phone_numbers_e164_key unique (e164);

-- Create number_requests table
create table if not exists public.number_requests (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('add', 'remove', 'replace', 'routing_change')),
  details jsonb default '{}'::jsonb,
  status text default 'open' check (status in ('open', 'in_progress', 'done', 'rejected')),
  created_at timestamptz default now()
);

-- Create subscriptions table
create table if not exists public.subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'scale')),
  seat_count int default 1,
  status text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

-- Create support_tickets table
create table if not exists public.support_tickets (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text default 'open' check (status in ('open', 'in_progress', 'waiting', 'closed')),
  created_at timestamptz default now()
);

-- Create support_ticket_messages table
create table if not exists public.support_ticket_messages (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);

-- Create audit_logs table
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_number_requests_org_id on public.number_requests(org_id);
create index if not exists idx_number_requests_requested_by on public.number_requests(requested_by);
create index if not exists idx_support_tickets_org_id on public.support_tickets(org_id);
create index if not exists idx_support_tickets_created_by on public.support_tickets(created_by);
create index if not exists idx_support_ticket_messages_ticket_id on public.support_ticket_messages(ticket_id);
create index if not exists idx_audit_logs_org_id on public.audit_logs(org_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

-- Enable RLS on new tables
alter table public.number_requests enable row level security;
alter table public.subscriptions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.audit_logs enable row level security;

-- Also enable on existing if not already
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.org_invites enable row level security;

-- Helper functions
create or replace function public.is_org_member(org_id uuid)
returns boolean as $$
begin
  -- Check org_users table (primary membership table)
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_org_admin(org_id uuid)
returns boolean as $$
begin
  -- Check org_users table (primary membership table)
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid() and role in ('org_owner', 'org_admin', 'admin')
  );
end;
$$ language plpgsql security definer;

-- RLS Policies

-- organizations: members can read, admins can update
drop policy if exists "organizations_member_read" on public.organizations;
drop policy if exists "organizations_admin_update" on public.organizations;

create policy "organizations_member_read"
on public.organizations
for select
using (public.is_org_member(id));

create policy "organizations_admin_update"
on public.organizations
for update
using (public.is_org_admin(id))
with check (public.is_org_admin(id));

-- org_members: members can read, admins can manage
drop policy if exists "org_members_member_read" on public.org_members;
drop policy if exists "org_members_admin_all" on public.org_members;

create policy "org_members_member_read"
on public.org_members
for select
using (public.is_org_member(org_id));

create policy "org_members_admin_all"
on public.org_members
for all
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));

-- phone_numbers: members can read, admins can manage
drop policy if exists "phone_numbers_member_read" on public.phone_numbers;
drop policy if exists "phone_numbers_admin_all" on public.phone_numbers;

create policy "phone_numbers_member_read"
on public.phone_numbers
for select
using (public.is_org_member(org_id));

create policy "phone_numbers_admin_all"
on public.phone_numbers
for all
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));

-- number_requests: members can read/insert, admins can update
drop policy if exists "number_requests_member_read_insert" on public.number_requests;
drop policy if exists "number_requests_admin_update" on public.number_requests;

create policy "number_requests_member_read_insert"
on public.number_requests
for select
using (public.is_org_member(org_id));

create policy "number_requests_member_insert"
on public.number_requests
for insert
with check (public.is_org_member(org_id) and requested_by = auth.uid());

create policy "number_requests_admin_update"
on public.number_requests
for update
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));

-- subscriptions: admins can read/update
drop policy if exists "subscriptions_admin_all" on public.subscriptions;

create policy "subscriptions_admin_all"
on public.subscriptions
for all
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));

-- support_tickets: members can read/insert, admins can update
drop policy if exists "support_tickets_member_read_insert" on public.support_tickets;
drop policy if exists "support_tickets_admin_update" on public.support_tickets;

create policy "support_tickets_member_read_insert"
on public.support_tickets
for select
using (public.is_org_member(org_id));

create policy "support_tickets_member_insert"
on public.support_tickets
for insert
with check (public.is_org_member(org_id) and created_by = auth.uid());

create policy "support_tickets_admin_update"
on public.support_tickets
for update
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));

-- support_ticket_messages: members can read/insert
drop policy if exists "support_ticket_messages_member_read_insert" on public.support_ticket_messages;

create policy "support_ticket_messages_member_read_insert"
on public.support_ticket_messages
for select
using (
  exists (
    select 1 from public.support_tickets
    where id = ticket_id and public.is_org_member(org_id)
  )
);

create policy "support_ticket_messages_member_insert"
on public.support_ticket_messages
for insert
with check (
  exists (
    select 1 from public.support_tickets
    where id = ticket_id and public.is_org_member(org_id)
  ) and sender_user_id = auth.uid()
);

-- audit_logs: members can read, system can insert
drop policy if exists "audit_logs_member_read" on public.audit_logs;
drop policy if exists "audit_logs_insert" on public.audit_logs;

create policy "audit_logs_member_read"
on public.audit_logs
for select
using (public.is_org_member(org_id));

create policy "audit_logs_insert"
on public.audit_logs
for insert
with check (public.is_org_member(org_id) and user_id = auth.uid());

-- org_invites: admins can manage, invited can view?
drop policy if exists "org_invites_admin_all" on public.org_invites;

create policy "org_invites_admin_all"
on public.org_invites
for all
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));