-- 0176: client site flow records (agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/SITE-FLOW-COMPLETION-PLAN.md §1-4, card SF-B).
-- 1) environments: at most one live (non-archived) environment per site and type. next-admin lib/site-flow/records.ts
--    ensureEnvironment selects first and reads a 23505 back as the existing row, so the app does not need this index to
--    be idempotent; the index closes the concurrent-insert race. Refuses to run if duplicates already exist.
-- 2) ops_action_catalog: the site.* step actions, all enabled=false (I6: steps open one at a time by the operator).
--    ON CONFLICT DO NOTHING: a re-run never resets an operator's switch (unlike 0021's `enabled = excluded.enabled`).
-- Write access unchanged, service role only: environments by 0136, ops_action_catalog by 0016 (RLS, SELECT-only policy).
-- One live row per type for all four types (local/staging/production/preview) on purpose (card SF-B); several previews
-- per site would need this index narrowed first.
-- Rollback: 0176_site_flow.down.sql.
begin;
set local lock_timeout = '5s';

do $$
declare n bigint;
begin
  select count(*) into n from (
    select site_id, environment_type from public.environments
    where status <> 'archived'
    group by site_id, environment_type having count(*) > 1
  ) d;
  if n > 0 then
    raise exception '0176: % (site_id, environment_type) pair(s) have more than one non-archived environment; archive the extras first', n;
  end if;
end $$;

create unique index if not exists uq_environments_site_type_live
  on public.environments (site_id, environment_type)
  where status <> 'archived';

insert into public.ops_action_catalog (action_key, display_name, risk_level, environment_scope, enabled, metadata)
values
  ('site.preflight',  'Site flow: address check',                 'low',    'staging_and_production', false, '{"requires_approval": false, "source": "0176_site_flow"}'::jsonb),
  ('site.create',     'Site flow: create site container',         'high',   'staging_and_production', false, '{"requires_approval": true, "source": "0176_site_flow"}'::jsonb),
  ('site.wp_install', 'Site flow: install WordPress, theme, plugins', 'high', 'staging_and_production', false, '{"requires_approval": true, "source": "0176_site_flow"}'::jsonb),
  ('site.vhost',      'Site flow: attach address (vhost)',        'high',   'staging_and_production', false, '{"requires_approval": true, "source": "0176_site_flow"}'::jsonb),
  ('site.mainwp',     'Site flow: register in MainWP',            'medium', 'staging_and_production', false, '{"requires_approval": true, "source": "0176_site_flow"}'::jsonb),
  ('site.bridge',     'Site flow: wp-bridge key and connection',  'high',   'staging_and_production', false, '{"requires_approval": true, "source": "0176_site_flow"}'::jsonb),
  ('site.open',       'Site flow: open site to the public',       'high',   'staging_and_production', false, '{"requires_approval": true, "source": "0176_site_flow"}'::jsonb)
on conflict (action_key) do nothing;

-- A pre-existing site.* row (not seeded here) that is enabled would skip the conflict above and stay open: refuse.
do $$
declare k text;
begin
  select string_agg(action_key, ', ') into k from public.ops_action_catalog
  where action_key in ('site.preflight', 'site.create', 'site.wp_install', 'site.vhost', 'site.mainwp', 'site.bridge', 'site.open')
    and coalesce(metadata->>'source', '') <> '0176_site_flow' and enabled;
  if k is not null then
    raise exception '0176: pre-existing enabled site.* action(s) %; disable them or get the operator''s decision first', k;
  end if;
end $$;

commit;
