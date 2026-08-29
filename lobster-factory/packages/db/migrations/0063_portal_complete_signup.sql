-- Migration 0063: portal_complete_signup() — atomic 4-table write for portal customer signup.
--
-- WHY: db-expert review of 0062 (Major finding #5, see
-- agency-os/docs/operations/PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §9) flagged that a hand-rolled
-- 4-insert signup sequence from application code is not atomic: a mid-sequence failure leaves
-- a customer with (e.g.) an organizations row but no organization_memberships row, and no DB
-- constraint catches that shape of inconsistency. Postgres function bodies are atomic as a
-- whole (any raised exception rolls back every statement in the function) — this replaces
-- four separate JS round-trips with one RPC call.
--
-- DISTRIBUTED-TRANSACTION CAVEAT (cannot be fixed in SQL, documented so it is not silently
-- assumed away): the Supabase Auth user (auth.users row) is created via the GoTrue admin API
-- (auth.admin.createUser()), a SEPARATE service from this Postgres transaction. This function
-- must be called AFTER that call succeeds, and the caller (app/portal/api/signup/route.ts)
-- MUST call auth.admin.deleteUser(p_user_id) to compensate if this function raises — otherwise
-- a signup failure leaves an orphaned auth user that can log in but has no organization.
-- p_org_id / p_user_id are caller-generated UUIDs (not DB defaults) specifically so the
-- auth user's app_metadata.org_id can be set at createUser() time, before any row here exists.
--
-- SECURITY: SECURITY DEFINER (house pattern: 0035_upsert_incident_atomic.sql) + explicit
-- REVOKE ALL FROM PUBLIC, ANON, AUTHENTICATED / GRANT ... TO service_role. This function is
-- signup-critical (it is what lets a new customer become an organization owner) — it must
-- never be callable by `authenticated` or `anon` via PostgREST, only by the service-role
-- backend route.
--
-- ⚠ CRITIC FINDING C1 (2026-08-29, verified live against ks-aw-01): `revoke all ... from public`
-- alone is NOT sufficient on Supabase. Supabase's own `ALTER DEFAULT PRIVILEGES` grants EXECUTE
-- on new functions to `anon` and `authenticated` EXPLICITLY -- that is a separate grant from
-- PUBLIC, and revoking PUBLIC does not touch it. Confirmed live: `select proacl from pg_proc`
-- on an existing function using only the PUBLIC-revoke pattern (0030:44) still shows
-- `anon=X/…,authenticated=X/…` after the revoke. Without the explicit revoke below, ANY caller
-- holding the public anon key (shipped in the browser bundle as NEXT_PUBLIC_SUPABASE_ANON_KEY)
-- could `POST /rest/v1/rpc/portal_complete_signup` directly and run all four inserts as
-- supabase_admin, bypassing Turnstile/rate-limit/env-gate/route.ts entirely. The two revokes
-- below (PUBLIC and anon+authenticated) are BOTH required; neither alone is sufficient.

set lock_timeout = '3s';

-- Supports the signup route's rate-limit count query (WHERE metadata->>'source'='portal_signup'
-- AND metadata->>'rl_key'=... AND created_at >= window_start). Partial so it costs nothing for
-- the far more common non-portal organizations rows (existing WP-agency clients etc).
create index if not exists organizations_portal_signup_rl_idx
  on public.organizations ((metadata->>'rl_key'), created_at)
  where metadata->>'source' = 'portal_signup';

create or replace function public.portal_complete_signup(
  p_org_id            uuid,
  p_user_id           uuid,
  p_org_name          text,
  p_email             text,
  p_product_key       text,
  p_rate_limit_key    text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := lower(regexp_replace(p_org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(p_org_id::text, 1, 8);
begin
  -- p_rate_limit_key is opaque to this function (a salted per-caller hash, see
  -- app/portal/api/signup/route.ts rateLimitKey()) -- stored so the rate-limit count query can
  -- scope by it atomically at insert time, instead of a separate post-hoc UPDATE whose failure
  -- would silently leave a signup untagged (undercounting, a real correctness gap fixed by
  -- folding this into the single atomic write instead).
  insert into public.organizations (id, type, name, slug, status, metadata)
  values (p_org_id, 'client', p_org_name, v_slug, 'active',
    jsonb_build_object('source', 'portal_signup', 'rl_key', p_rate_limit_key));

  insert into public.profiles (id, email, default_organization_id)
  values (p_user_id, p_email, p_org_id);

  insert into public.organization_memberships (organization_id, user_id, membership_type, status)
  values (p_org_id, p_user_id, 'owner', 'active');

  insert into public.organization_product_subscriptions (organization_id, product_key, status, started_at)
  values (p_org_id, p_product_key, 'trial', now());
end;
$$;

reset lock_timeout;

revoke all on function public.portal_complete_signup(uuid, uuid, text, text, text, text) from public;
-- C1 fix: PUBLIC-revoke alone leaves Supabase's default anon/authenticated grants intact.
revoke all on function public.portal_complete_signup(uuid, uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.portal_complete_signup(uuid, uuid, text, text, text, text) to service_role;

comment on function public.portal_complete_signup is
  'Atomic 4-table write for portal customer signup (organizations+profiles+organization_memberships+organization_product_subscriptions). Called ONLY by the service-role signup API route AFTER auth.admin.createUser() has already created the auth.users row (GoTrue is a separate service and cannot participate in this Postgres transaction -- the caller must compensate with auth.admin.deleteUser(p_user_id) if this function raises). p_org_id/p_user_id are caller-generated UUIDs, not DB defaults, so the auth user app_metadata.org_id can be set before this function ever runs. service_role EXECUTE only -- revoked from public AND anon/authenticated explicitly (Supabase grants those by default; see C1 note above).';

notify pgrst, 'reload schema';
