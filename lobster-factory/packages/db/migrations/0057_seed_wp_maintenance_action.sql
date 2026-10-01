-- WP maintenance action catalog seed (2026-07-03).
-- Backs the ops_action_runs audit trail written by
-- apps/next-admin/app/api/ops/clients/[slug]/wp-update/route.ts.
-- The route self-seeds the same row (same values) if this migration has not
-- been applied yet — keep both in sync.
-- Safe to run multiple times. BEGIN/COMMIT added 2026-10-01 (runner requires it).

begin;

insert into public.ops_action_catalog (
  action_key,
  display_name,
  risk_level,
  environment_scope,
  enabled,
  metadata
)
values (
  'ops.maintenance.wp-plugin-update',
  'WP plugin update (maintenance)',
  'medium',
  'staging_and_production',
  true,
  '{"requires_approval": false, "source": "0057_seed_wp_maintenance_action"}'::jsonb
)
on conflict (action_key) do update
set
  display_name = excluded.display_name,
  risk_level = excluded.risk_level,
  environment_scope = excluded.environment_scope,
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();

commit;
