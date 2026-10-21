-- Down for 0111_social_rule_post_guard.sql: the two new functions go, social_touch_post_rules back to 0105's text.
-- ORDER: deploy code that calls social_save_auto_rule / social_delete_auto_rule (store.ts before the 0111 change) first.
-- Run by hand (psql as supabase_admin): apply-db-migration.mjs skips .down files, so this file clears its own ledger row
-- and reloads PostgREST.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0111_social_rule_post_guard.sql';
  end if;
end $$;

drop function if exists public.social_save_post_rule(uuid, uuid, jsonb, text);
drop function if exists public.social_delete_post_rule(uuid, uuid, text);

create or replace function public.social_touch_post_rules(p_org uuid, p_post uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_post is null then
    return;
  end if;
  update public.social_posts set updated_at = now() where id = p_post and organization_id = p_org;
  perform public.social_withdraw_repeat(p_org, p_post, 'template_rule', p_actor);
end $$;

notify pgrst, 'reload schema';

commit;
