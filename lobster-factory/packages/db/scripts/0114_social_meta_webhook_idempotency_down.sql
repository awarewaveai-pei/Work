begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0114_social_meta_webhook_idempotency.sql';
  end if;
end $$;
drop index if exists public.social_post_targets_meta_idx;
drop table if exists public.social_auto_rule_events;
alter table public.social_post_targets drop column if exists meta_post_id;
commit;
