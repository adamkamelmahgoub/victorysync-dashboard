-- Helper RPC to get orgs with member/phone counts
create or replace function public.get_organizations_with_counts()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  member_count integer,
  phone_count integer
) as $$
begin
  return query
    select o.id, o.name, o.created_at,
      (select count(*) from public.organization_members m where m.org_id = o.id) as member_count,
      (select count(*) from public.org_phone_numbers p where p.org_id = o.id) as phone_count
    from public.organizations o;
end;
$$ language plpgsql stable;
