-- Down for 0113_social_smart_link_visitor_dedupe.sql.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0113_social_smart_link_visitor_dedupe.sql';
  end if;
end $$;

drop function if exists public.social_smart_link_click(text, uuid, text);
create or replace function public.social_smart_link_click(p_slug text, p_item uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_tz text;
begin
  select i.url, o.default_timezone into v_url, v_tz
  from public.social_smart_links l
  join public.social_smart_link_items i on i.organization_id = l.organization_id and i.id = p_item and i.active
  join public.organizations o on o.id = l.organization_id
  where l.slug = p_slug and l.published;
  if v_url is null then
    return null;
  end if;
  insert into public.social_smart_link_clicks (item_id, day, n) values (p_item, (now() at time zone coalesce(v_tz, 'UTC'))::date, 1)
  on conflict (item_id, day) do update set n = social_smart_link_clicks.n + 1;
  return v_url;
end $$;

revoke all on function public.social_smart_link_click(text, uuid) from public, anon, authenticated;
grant execute on function public.social_smart_link_click(text, uuid) to service_role;
drop table if exists public.social_smart_link_click_dedupe;

notify pgrst, 'reload schema';
commit;
