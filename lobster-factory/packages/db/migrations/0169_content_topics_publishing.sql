-- 0169: content_topics gets the status 'publishing' (N5a, NEXT-PHASE-PLAN-20261119 §8): auto publish goes in steps --
-- YouTube first, the article once YouTube's public link is back, the other social posts last -- and a topic sits in
-- 'publishing' between them (next-admin lib/content/topics/publish-steps.ts; each step is kept in artifacts.publish).
-- Additive: every row allowed before is allowed after; old code never writes 'publishing'.
-- Lock: the whole swap holds ACCESS EXCLUSIVE until commit (the re-check scans a small table, milliseconds);
-- lock_timeout: a busy sweep makes this fail, not queue.
-- The check is 0121's inline one, named content_topics_status_check; the guard below refuses to run if that name is not
-- the table's only status check, so a wrong name can never leave the old check beside the new one.
-- APPLY:  node scripts/apply-db-migration.mjs 0169
-- Down:   packages/db/migrations/0169_content_topics_publishing.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

do $$
declare
  names text[];
begin
  select array_agg(conname order by conname) into names from pg_constraint
   where conrelid = 'public.content_topics'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%';
  if names is distinct from array['content_topics_status_check']::text[] then
    raise exception '0169: expected one status check named content_topics_status_check, found %', names;
  end if;
end $$;

alter table public.content_topics drop constraint content_topics_status_check;
alter table public.content_topics add constraint content_topics_status_check
  check (status in ('proposed', 'approved', 'rejected', 'generating', 'drafted', 'waiting_video', 'embedded',
                    'reviewed', 'scheduled', 'publishing', 'published', 'failed'));

notify pgrst, 'reload schema';
commit;
