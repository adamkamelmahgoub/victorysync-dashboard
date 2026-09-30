begin;
alter table public.wf_settings add column mightycall_import_enabled boolean not null default false;
grant select on public.wf_settings,public.wf_assignments to service_role;
create table public.wf_transfer_sync_state (
 id uuid primary key default gen_random_uuid(), client_id uuid not null unique references wf_clients(id),
 window_start timestamptz not null default now()-interval '1 day', window_end timestamptz not null default now(),
 phase text not null default 'calls' check(phase in ('calls','journal')), page_offset integer not null default 0 check(page_offset>=0),
 lease_token uuid, lease_until timestamptz, last_attempt_at timestamptz, last_success_at timestamptz,
 last_error text, imported_count integer not null default 0, queued_count integer not null default 0
);
alter table wf_transfer_sync_state enable row level security;
grant select on wf_transfer_sync_state to authenticated;
create policy transfer_sync_staff on wf_transfer_sync_state for select to authenticated using(wf_role()='admin');
grant all on wf_transfer_sync_state to service_role;
create function wf_claim_transfer_sync(cid uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job wf_transfer_sync_state;
begin
 insert into wf_transfer_sync_state(client_id) values(cid) on conflict(client_id) do nothing;
 update wf_transfer_sync_state set lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',last_attempt_at=now()
 where client_id=cid and (lease_until is null or lease_until<now()) returning * into job;
 return case when job.id is null then null else to_jsonb(job) end;
end; $$;
revoke all on function wf_claim_transfer_sync(uuid) from public,anon,authenticated;
grant execute on function wf_claim_transfer_sync(uuid) to service_role;
commit;
