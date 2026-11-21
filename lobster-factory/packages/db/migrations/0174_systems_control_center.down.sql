-- Back to 0173. Revert next-admin first (it reads and writes these tables). Refuses while any system_updates row
-- exists: user and migration events are the only record of reviews and status changes (git events can be replayed,
-- those cannot). The three definition tables are a projection of registry.json and are dropped with it.
begin;
set local lock_timeout = '5s';
do $$
declare n bigint;
begin
  if to_regclass('public.system_updates') is not null then
    select count(*) into n from public.system_updates;
    if n > 0 then
      raise exception '0174 down: % system_updates row(s) exist; back them up and get the operator''s consent first', n;
    end if;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0174_systems_control_center.sql';
  end if;
end $$;

drop table if exists public.system_updates;
drop function if exists public.system_updates_append_only();
drop function if exists public.systems_apply_registry(jsonb, jsonb, jsonb);
drop table if exists public.system_features;
drop table if exists public.system_phases;
drop table if exists public.systems;

notify pgrst, 'reload schema';
commit;
