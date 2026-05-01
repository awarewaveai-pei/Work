-- Supabase security lint: function_search_path_mutable (warnings).
--
-- Locks search_path for SQL helpers used by RLS policies (0004 / ADR 006).
-- Pattern matches 0015_fix_function_search_path_ops_inbox.sql.
--
-- Bodies reference auth.uid() / auth.jwt() schema-qualified; public tables unqualified.

do $$
begin
  if to_regprocedure('public.current_user_id()') is not null then
    execute 'alter function public.current_user_id() set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.user_has_workspace_access(uuid)') is not null then
    execute 'alter function public.user_has_workspace_access(uuid) set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.current_clerk_org_id_from_jwt()') is not null then
    execute 'alter function public.current_clerk_org_id_from_jwt() set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.user_has_org_membership(uuid)') is not null then
    execute 'alter function public.user_has_org_membership(uuid) set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.user_has_org_access(uuid)') is not null then
    execute 'alter function public.user_has_org_access(uuid) set search_path = public, pg_temp';
  end if;
end
$$;
