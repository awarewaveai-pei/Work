-- 0134: an organizations row is written only by the control plane (service role, security-definer functions).
-- 0010 gave members organizations_update / organizations_delete (user_has_org_access(id)), and Supabase's default
-- privileges give authenticated/anon every table privilege (UPDATE, DELETE, ... TRIGGER): a customer member's own JWT could PATCH
-- /rest/v1/organizations?id=eq.<own> and set kind='internal' (free back office, lib/entitlements/can.ts),
-- parent_organization_id/org_level (billing subject = coalesce(parent, id), ADR 017 §3), status, slug, metadata, or
-- DELETE the row. No app path writes organizations with a user session (all writers use getSupabaseWriteClient,
-- WORKLOG 2026-10-25), so members keep SELECT (organizations_select, 0004) and lose every write.
-- 0133's organizations_sold_by_control_plane_only trigger stays: harmless, and it still guards that column if a write
-- grant ever comes back. Security-definer functions (portal_complete_signup) run as their owner and are unaffected.
begin;
set local lock_timeout = '5s';
drop policy if exists organizations_update on public.organizations;
drop policy if exists organizations_delete on public.organizations;
revoke insert, update, delete, truncate, references, trigger on public.organizations from anon, authenticated;
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'organizations' and cmd <> 'SELECT') then
    raise exception '0134: organizations still has a non-SELECT policy';
  end if;
  if has_table_privilege('authenticated', 'public.organizations', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.organizations', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('authenticated', 'public.organizations', 'INSERT,UPDATE,REFERENCES')
     or has_any_column_privilege('anon', 'public.organizations', 'INSERT,UPDATE,REFERENCES') then
    raise exception '0134: anon/authenticated can still write organizations';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
