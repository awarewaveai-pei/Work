begin;
set local lock_timeout = '5s';
drop index if exists public.social_post_targets_meta_idx;
drop table if exists public.social_auto_rule_events;
alter table public.social_post_targets drop column if exists meta_post_id;
commit;
