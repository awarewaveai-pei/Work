-- Down migration for 0096_social_manager.sql. Withdraw the next-admin social code first (plan C4+). Drops every
-- social_* table 0096 created, with their rows (posts, schedule, audit log): export them first if any are real.
-- social_postiz_connections (0011) is untouched — the mappings 0096 copied are still there.
-- Removes 0096's ledger row in the same transaction so `apply-db-migration.mjs --status` stays true.
--
-- Dropping tables that reference organizations takes an ACCESS EXCLUSIVE lock on organizations for the drop; run at
-- low traffic. lock_timeout is 1s so a busy organizations table makes this fail fast (re-run) instead of queueing
-- every organizations read behind it.
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0096_social_manager_down.sql

begin;
set local lock_timeout = '1s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0096_social_manager.sql';
  end if;
end $$;

drop table if exists public.social_audit_log;
drop table if exists public.social_brand_members;
drop table if exists public.social_saved_texts;
drop table if exists public.social_post_media;
drop table if exists public.social_media;
drop table if exists public.social_post_targets;
drop table if exists public.social_posts;
drop table if exists public.social_list_accounts;
drop table if exists public.social_lists;
drop table if exists public.social_accounts;

drop function if exists public.social_audit_log_append_only();
drop function if exists public.social_children_guard();
drop function if exists public.social_posts_guard();
drop function if exists public.social_touch_row();

notify pgrst, 'reload schema';

commit;
