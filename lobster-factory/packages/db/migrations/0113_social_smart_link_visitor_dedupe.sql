-- 0113 — C26 smart-link visitor-day dedupe.
-- The visitor address is hashed in next-admin with SMARTLINK_VISITOR_HASH_SALT; this database stores no raw IP or UA.
-- Dedupe rows retain three brand calendar days: enough for the current day, a 25-hour DST day, and delayed retries,
-- while limiting the lifetime of an otherwise useless visitor identifier.
-- APPLY WITH (High: production schema; operator go-ahead first): node scripts/apply-db-migration.mjs 0113
-- DOWN: packages/db/migrations/0113_social_smart_link_visitor_dedupe.down.sql

begin;
set local lock_timeout = '5s';

create table if not exists public.social_smart_link_click_dedupe (
  item_id      uuid not null references public.social_smart_link_items(id) on delete cascade,
  day          date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  primary key (item_id, day, visitor_hash)
);

alter table public.social_smart_link_click_dedupe enable row level security;
drop policy if exists "service_role only" on public.social_smart_link_click_dedupe;
create policy "service_role only" on public.social_smart_link_click_dedupe
  to service_role using (true) with check (true);
revoke all on public.social_smart_link_click_dedupe from public, anon, authenticated;
grant all on public.social_smart_link_click_dedupe to service_role;

drop function if exists public.social_smart_link_click(text, uuid);
drop function if exists public.social_smart_link_click(text, uuid, text);
create function public.social_smart_link_click(p_slug text, p_item uuid, p_visitor_hash text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_tz text;
  v_day date;
  v_counted boolean := false;
begin
  select i.url, o.default_timezone into v_url, v_tz
  from public.social_smart_links l
  join public.social_smart_link_items i on i.organization_id = l.organization_id and i.id = p_item and i.active
  join public.organizations o on o.id = l.organization_id
  where l.slug = p_slug and l.published;
  if v_url is null then
    return jsonb_build_object('url', null, 'counted', false);
  end if;
  if p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('url', v_url, 'counted', false);
  end if;
  v_day := (now() at time zone coalesce(v_tz, 'UTC'))::date;

  -- Keep only a short privacy window; the unique key needs only the current brand day.
  delete from public.social_smart_link_click_dedupe
  where item_id = p_item and day < v_day - 2;

  insert into public.social_smart_link_click_dedupe (item_id, day, visitor_hash)
  values (p_item, v_day, p_visitor_hash)
  on conflict (item_id, day, visitor_hash) do nothing
  returning true into v_counted;
  v_counted := coalesce(v_counted, false);
  if v_counted then
    insert into public.social_smart_link_clicks (item_id, day, n) values (p_item, v_day, 1)
    on conflict (item_id, day) do update set n = social_smart_link_clicks.n + 1;
  end if;
  return jsonb_build_object('url', v_url, 'counted', v_counted);
end $$;

revoke all on function public.social_smart_link_click(text, uuid, text) from public, anon, authenticated;
grant execute on function public.social_smart_link_click(text, uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
