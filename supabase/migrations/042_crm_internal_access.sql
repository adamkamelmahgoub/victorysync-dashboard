begin;

-- The CRM is a Victory Sync staff workspace. Keep organization_id as an
-- internal ownership key, but never grant CRM access through org membership.
create or replace function public.crm_user_in_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() and target_org_id is not null;
$$;

-- Recreate the existing policies so deployments that already applied 041
-- immediately pick up the platform-only access rule above.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'crm_companies', 'crm_contacts', 'crm_pipeline_stages', 'crm_deals',
    'crm_activities', 'crm_tasks', 'call_outcome_stage_mappings'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', table_name || '_org_access', table_name);
      execute format(
        'create policy %I on public.%I for all using (public.crm_user_in_org(organization_id)) with check (public.crm_user_in_org(organization_id))',
        table_name || '_org_access', table_name
      );
    end if;
  end loop;
end $$;

commit;
