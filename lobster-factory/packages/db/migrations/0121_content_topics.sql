-- 0121: trends are kept, topics are queued (agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md P3).
--   content_trends  every trending item next-admin fetched (lib/content/trending-sources.ts), one row per item per UTC day.
--                   Public data, not tenant data: no organization_id. hash = sha256 of geo|source|normalized title.
--                   Kept 90 days: lib/content/topics/trends.ts saveTrends deletes older rows of the geo it writes.
--   content_trends_top(geo, since, n)  the plan's input: titles ranked by how many days they were hot since `since`.
--   content_topics  one row = one piece of content a brand will make (article / social / video / youtube), moving
--                   through the states below one step at a time (lib/content/topics/store.ts). version is the claim:
--                   a step updates WHERE version = the one it read, so two firings never move the same row twice.
--   content_topics_start(org, id, version, day, cap)  approved -> generating under a per-organization advisory lock,
--                   so two starters (the sweep and 「核准並開始」) cannot both pass the daily cap.
--   client_schedules.frequency gains 'every_5m' (P4: the host cron drives the existing run-due sweep every 5 minutes).
-- RLS: service_role only, like 0097. Down: packages/db/migrations/0121_content_topics.down.sql (refuses once topics exist).
begin;
set local lock_timeout = '5s';

create table if not exists public.content_trends (
  id               uuid        primary key default gen_random_uuid(),
  geo              text        not null check (geo ~ '^[A-Z]{2}$'),
  source           text        not null check (length(source) between 1 and 120),
  title            text        not null check (length(title) between 1 and 500),
  traffic          text        check (traffic is null or length(traffic) <= 60),
  category         text        check (category is null or length(category) <= 120),
  related_queries  jsonb       not null default '[]'::jsonb check (jsonb_typeof(related_queries) = 'array'),
  hash             text        not null check (hash ~ '^[0-9a-f]{64}$'),
  fetched_on       date        not null default ((now() at time zone 'utc')::date),
  created_at       timestamptz not null default now(),
  unique (hash, fetched_on)
);
create index if not exists content_trends_geo_day on public.content_trends (geo, fetched_on desc);

create table if not exists public.content_topics (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  site_id          uuid        references public.wp_sites(id) on delete set null,
  title            text        not null check (length(title) between 1 and 300),
  keyword          text        not null check (length(keyword) between 1 and 200),
  angle            text        check (angle is null or length(angle) <= 1000),
  source           text        not null check (source in ('trending', 'kb', 'plan', 'manual')),
  source_ref       jsonb       not null default '{}'::jsonb check (jsonb_typeof(source_ref) = 'object'),
  month            date        not null check (extract(day from month) = 1),
  scheduled_for    timestamptz,
  formats          text[]      not null default array['article', 'social']
                               check (cardinality(formats) >= 1 and formats <@ array['article', 'social', 'video', 'youtube']),
  status           text        not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'generating',
                               'drafted', 'waiting_video', 'embedded', 'reviewed', 'scheduled', 'published', 'failed')),
  artifacts        jsonb       not null default '{}'::jsonb check (jsonb_typeof(artifacts) = 'object'),
  review           jsonb       check (review is null or jsonb_typeof(review) = 'object'),
  version          integer     not null default 1 check (version >= 1),
  last_error       text        check (last_error is null or length(last_error) <= 500),
  started_on       date,       -- UTC day the topic left 'approved' (the daily cap counts these)
  created_by       text        not null check (length(created_by) between 1 and 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, month, keyword)          -- also serves "an organization's topics of a month"
);
-- the sweep, per organization: approved and due / in progress
create index if not exists content_topics_org_status on public.content_topics (organization_id, status, scheduled_for);
create index if not exists content_topics_org_started on public.content_topics (organization_id, started_on) where started_on is not null;
create index if not exists content_topics_site on public.content_topics (site_id) where site_id is not null;   -- wp_sites delete

create or replace function public.content_trends_top(p_geo text, p_since date, p_limit integer)
returns table (title text, source text, days bigint, last_seen date)
language sql stable set search_path = public, pg_temp as $$
  select min(t.title), min(t.source), count(distinct t.fetched_on), max(t.fetched_on)
  from public.content_trends t
  where t.geo = p_geo and t.fetched_on >= p_since
  group by lower(regexp_replace(t.title, '\s+', ' ', 'g'))
  order by 3 desc, 4 desc
  limit greatest(p_limit, 0);
$$;

create or replace function public.content_topics_start(p_org uuid, p_id uuid, p_version integer, p_day date, p_cap integer)
returns setof public.content_topics
language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('content_topics_start:' || p_org::text, 0));
  if (select count(*) from public.content_topics where organization_id = p_org and started_on = p_day) >= p_cap then
    return;
  end if;
  return query
    update public.content_topics
       set status = 'generating', version = version + 1, started_on = p_day, last_error = null, updated_at = now()
     where id = p_id and organization_id = p_org and status = 'approved' and version = p_version
    returning *;
end $$;

alter table public.content_trends enable row level security;
alter table public.content_topics enable row level security;
drop policy if exists "service_role only" on public.content_trends;
create policy "service_role only" on public.content_trends to service_role using (true) with check (true);
drop policy if exists "service_role only" on public.content_topics;
create policy "service_role only" on public.content_topics to service_role using (true) with check (true);
revoke all on public.content_trends, public.content_topics from public, anon, authenticated;
grant all on public.content_trends, public.content_topics to service_role;
revoke all on function public.content_trends_top(text, date, integer) from public, anon, authenticated;
revoke all on function public.content_topics_start(uuid, uuid, integer, date, integer) from public, anon, authenticated;
grant execute on function public.content_trends_top(text, date, integer) to service_role;
grant execute on function public.content_topics_start(uuid, uuid, integer, date, integer) to service_role;

-- current value is 0097's
alter table public.client_schedules drop constraint if exists client_schedules_frequency_check;
alter table public.client_schedules
  add constraint client_schedules_frequency_check check (frequency in ('daily', 'weekly', 'every_5m'));

notify pgrst, 'reload schema';
commit;
