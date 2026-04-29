-- Supabase security lint: function_search_path_mutable.
--
-- Goal:
-- - Lock down function-level search_path for Ops Inbox functions created in 0013.
-- - Keep migration idempotent/safe across environments where objects may already
--   exist (or be partially provisioned).
--
-- Why:
-- - Without an explicit function search_path, name resolution depends on caller
--   session settings, which can cause drift and security findings.

do $$
begin
  if to_regprocedure('public.ops_incidents_touch_updated_at()') is not null then
    execute 'alter function public.ops_incidents_touch_updated_at() set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.ops_inbox_gemini_quota_increment(integer)') is not null then
    execute 'alter function public.ops_inbox_gemini_quota_increment(integer) set search_path = public, pg_temp';
  end if;
end
$$;

