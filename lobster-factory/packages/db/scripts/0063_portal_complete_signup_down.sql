-- DOWN for 0063_portal_complete_signup.sql.
-- Function-only drop -- no data. Safe to run any time signup traffic is paused
-- (the signup route will start failing loudly with "function does not exist" rather
-- than silently degrading, which is the desired fail-closed behavior).
--
-- POST-APPLY CHECK for the UP migration (run after 0063, before opening PORTAL_SIGNUP_ENABLED):
--   docker exec supabase-db psql -U supabase_admin -d postgres -Atc \
--     "select proacl from pg_proc where proname='portal_complete_signup';"
-- Expected: only supabase_admin/postgres/service_role entries -- NO anon, NO authenticated.
-- If either appears, the C1 revoke did not take effect; do not enable signup until it does.

drop function if exists public.portal_complete_signup(uuid, uuid, text, text, text, text);
drop index if exists public.organizations_portal_signup_rl_idx;

notify pgrst, 'reload schema';
