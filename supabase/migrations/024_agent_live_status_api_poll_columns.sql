begin;

alter table if exists public.agent_live_status
  add column if not exists agent_name text,
  add column if not exists business_number text;

commit;
