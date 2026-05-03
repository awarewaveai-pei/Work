-- Migration 0023: dispatcher + catalog seeds
-- 1. Extend ops_action_runs status CHECK to cover dispatcher lifecycle values
-- 2. Add trigger_run_id column to ops_action_runs
-- 3. Seed wp-basic and wp-business packages/versions/manifests
-- 4. Seed adopt-client-os and ao-infrastructure-check workflow versions
-- Safe to run multiple times (idempotent).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend ops_action_runs status CHECK constraint
--    Old:  ('pending','running','completed','failed','blocked','cancelled')
--    New:  adds 'dispatched', 'dispatch_failed'
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  -- Drop the old constraint only if it does not already include 'dispatched'
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'ops_action_runs'
      and c.contype = 'c'
      and c.conname = 'ops_action_runs_status_check'
      and not (pg_get_constraintdef(c.oid) ilike '%dispatched%')
  ) then
    alter table public.ops_action_runs drop constraint ops_action_runs_status_check;
    alter table public.ops_action_runs add constraint ops_action_runs_status_check
      check (status in (
        'pending', 'running', 'completed', 'failed',
        'blocked', 'cancelled', 'dispatched', 'dispatch_failed'
      ));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add trigger_run_id column (Trigger.dev handle.id written back by dispatcher)
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'ops_action_runs'
      and column_name  = 'trigger_run_id'
  ) then
    alter table public.ops_action_runs add column trigger_run_id text;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wp-basic package + version + manifest
--    Fixed UUIDs (must match catalogIds.ts):
--      packageVersionId: a1b2c3d4-0001-4000-8000-000000000001
--      manifestId:       a1b2c3d4-0002-4000-8000-000000000002
-- ─────────────────────────────────────────────────────────────────────────────
insert into packages (
  id, scope_type, scope_id, name, slug, package_type,
  description, status, default_version, metadata
) values (
  'a1b2c3d4-0010-4000-8000-000000000010',
  'global', NULL,
  'wp-basic', 'wp-basic', 'wordpress',
  'Basic WordPress site: Kadence + Rank Math + Fluent Forms + SMTP + MainWP Child',
  'active', '1.0.0', '{}'::jsonb
) on conflict do nothing;

insert into package_versions (
  id, package_id, version, changelog, compatibility,
  status, artifact_ref, created_by, metadata
) values (
  'a1b2c3d4-0001-4000-8000-000000000001',
  'a1b2c3d4-0010-4000-8000-000000000010',
  '1.0.0', NULL, '{}'::jsonb,
  'active', NULL, NULL, '{}'::jsonb
) on conflict do nothing;

insert into manifests (
  id, package_version_id, schema_version, manifest_json,
  install_guardrails, dependencies, conflicts, rollback_hints, status
) values (
  'a1b2c3d4-0002-4000-8000-000000000002',
  'a1b2c3d4-0001-4000-8000-000000000001',
  '1.0.0',
  $manifest_wpbasic${
    "name": "wp-basic",
    "version": "1.0.0",
    "schemaVersion": "1.0.0",
    "target": "wordpress",
    "applyMode": "full_install",
    "description": "Basic WordPress site: Kadence theme + essential plugins",
    "guardrails": {
      "allowEnvironments": ["staging", "production"],
      "requireBackup": false,
      "blockIfProduction": false
    },
    "dependencies": [],
    "conflicts": [],
    "steps": [
      { "id": "theme-kadence",        "type": "install_theme",  "slug": "kadence" },
      { "id": "plugin-kadence-blocks","type": "install_plugin", "slug": "kadence-blocks" },
      { "id": "plugin-rank-math",     "type": "install_plugin", "slug": "seo-by-rank-math" },
      { "id": "plugin-fluent-forms",  "type": "install_plugin", "slug": "fluentform" },
      { "id": "plugin-fluent-smtp",   "type": "install_plugin", "slug": "fluent-smtp" },
      { "id": "plugin-mainwp-child",  "type": "install_plugin", "slug": "mainwp-child" },
      {
        "id": "plugin-litespeed",
        "type": "conditional_plugin",
        "condition": "is_litespeed",
        "slug": "litespeed-cache"
      }
    ],
    "postInstall": [
      { "type": "activate_theme",   "slug": "kadence" },
      { "type": "flush_permalinks" },
      { "type": "set_option", "key": "timezone_string", "value": "Asia/Taipei" },
      { "type": "configure_fluent_smtp_via_env" },
      { "type": "configure_rank_math_defaults" }
    ],
    "verification": [
      { "type": "check_homepage" },
      { "type": "check_admin_login" },
      { "type": "check_plugin_active", "slug": "fluentform" },
      { "type": "check_plugin_active", "slug": "mainwp-child" }
    ],
    "smokeProfile": "basic",
    "rollback": { "strategy": "restore_backup_snapshot" }
  }$manifest_wpbasic$::jsonb,
  $guardrails_wpbasic${"allowEnvironments": ["staging", "production"], "requireBackup": false, "blockIfProduction": false}$guardrails_wpbasic$::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  $rollback_wpbasic${"strategy": "restore_backup_snapshot"}$rollback_wpbasic$::jsonb,
  'active'
) on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wp-business package + version + manifest
--    Fixed UUIDs:
--      packageVersionId: a1b2c3d4-0003-4000-8000-000000000003
--      manifestId:       a1b2c3d4-0004-4000-8000-000000000004
-- ─────────────────────────────────────────────────────────────────────────────
insert into packages (
  id, scope_type, scope_id, name, slug, package_type,
  description, status, default_version, metadata
) values (
  'a1b2c3d4-0020-4000-8000-000000000020',
  'global', NULL,
  'wp-business', 'wp-business', 'wordpress',
  'Business WordPress: wp-basic + Google Site Kit + FluentCRM + business maintenance',
  'active', '1.0.0', '{}'::jsonb
) on conflict do nothing;

insert into package_versions (
  id, package_id, version, changelog, compatibility,
  status, artifact_ref, created_by, metadata
) values (
  'a1b2c3d4-0003-4000-8000-000000000003',
  'a1b2c3d4-0020-4000-8000-000000000020',
  '1.0.0', NULL, '{}'::jsonb,
  'active', NULL, NULL, '{}'::jsonb
) on conflict do nothing;

insert into manifests (
  id, package_version_id, schema_version, manifest_json,
  install_guardrails, dependencies, conflicts, rollback_hints, status
) values (
  'a1b2c3d4-0004-4000-8000-000000000004',
  'a1b2c3d4-0003-4000-8000-000000000003',
  '1.0.0',
  $manifest_wpbiz${
    "name": "wp-business",
    "version": "1.0.0",
    "schemaVersion": "1.0.0",
    "target": "wordpress",
    "applyMode": "full_install",
    "description": "Business WordPress: all wp-basic plugins plus CRM and analytics",
    "guardrails": {
      "allowEnvironments": ["staging", "production"],
      "requireBackup": false,
      "blockIfProduction": false
    },
    "dependencies": [],
    "conflicts": [],
    "steps": [
      { "id": "theme-kadence",        "type": "install_theme",  "slug": "kadence" },
      { "id": "plugin-kadence-blocks","type": "install_plugin", "slug": "kadence-blocks" },
      { "id": "plugin-rank-math",     "type": "install_plugin", "slug": "seo-by-rank-math" },
      { "id": "plugin-fluent-forms",  "type": "install_plugin", "slug": "fluentform" },
      { "id": "plugin-fluent-smtp",   "type": "install_plugin", "slug": "fluent-smtp" },
      { "id": "plugin-fluent-crm",    "type": "install_plugin", "slug": "fluent-crm" },
      { "id": "plugin-site-kit",      "type": "install_plugin", "slug": "google-site-kit" },
      { "id": "plugin-mainwp-child",  "type": "install_plugin", "slug": "mainwp-child" },
      {
        "id": "plugin-litespeed",
        "type": "conditional_plugin",
        "condition": "is_litespeed",
        "slug": "litespeed-cache"
      }
    ],
    "postInstall": [
      { "type": "activate_theme",   "slug": "kadence" },
      { "type": "flush_permalinks" },
      { "type": "set_option", "key": "timezone_string", "value": "Asia/Taipei" },
      { "type": "configure_fluent_smtp_via_env" },
      { "type": "configure_rank_math_defaults" }
    ],
    "verification": [
      { "type": "check_homepage" },
      { "type": "check_admin_login" },
      { "type": "check_plugin_active", "slug": "fluent-crm" },
      { "type": "check_plugin_active", "slug": "google-site-kit" },
      { "type": "check_plugin_active", "slug": "mainwp-child" }
    ],
    "smokeProfile": "business",
    "rollback": { "strategy": "restore_backup_snapshot" }
  }$manifest_wpbiz$::jsonb,
  $guardrails_wpbiz${"allowEnvironments": ["staging", "production"], "requireBackup": false, "blockIfProduction": false}$guardrails_wpbiz$::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  $rollback_wpbiz${"strategy": "restore_backup_snapshot"}$rollback_wpbiz$::jsonb,
  'active'
) on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. adopt-client-os workflow + version
--    Fixed UUIDs (must match catalogIds.ts):
--      workflowVersionId: b2c3d4e5-0001-4000-8000-000000000001
-- ─────────────────────────────────────────────────────────────────────────────
insert into workflows (
  id, scope_type, scope_id, name, slug, domain,
  orchestrator_type, risk_level, status, default_version,
  input_schema, output_schema, rollback_strategy, metadata
) values (
  'b2c3d4e5-0010-4000-8000-000000000010',
  'global', NULL,
  'adopt-client-os', 'adopt-client-os', 'wp-factory',
  'durable', 'high', 'active', '1.0.0',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
) on conflict do nothing;

insert into workflow_versions (
  id, workflow_id, version, definition_ref,
  routing_config, trigger_config, guardrails, status, metadata
) values (
  'b2c3d4e5-0001-4000-8000-000000000001',
  'b2c3d4e5-0010-4000-8000-000000000010',
  '1.0.0',
  'packages/workflows/src/trigger/adopt-client-os.ts',
  '{}'::jsonb, '{}'::jsonb,
  '{"requiresBackup": true, "adoptDeltaOnly": true}'::jsonb,
  'active', '{}'::jsonb
) on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ao-infrastructure-check workflow + version
--    Fixed UUIDs (must match catalogIds.ts):
--      workflowVersionId: b2c3d4e5-0002-4000-8000-000000000002
-- ─────────────────────────────────────────────────────────────────────────────
insert into workflows (
  id, scope_type, scope_id, name, slug, domain,
  orchestrator_type, risk_level, status, default_version,
  input_schema, output_schema, rollback_strategy, metadata
) values (
  'b2c3d4e5-0020-4000-8000-000000000020',
  'global', NULL,
  'ao-infrastructure-check', 'ao-infrastructure-check', 'agency-ops',
  'durable', 'medium', 'active', '1.0.0',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
) on conflict do nothing;

insert into workflow_versions (
  id, workflow_id, version, definition_ref,
  routing_config, trigger_config, guardrails, status, metadata
) values (
  'b2c3d4e5-0002-4000-8000-000000000002',
  'b2c3d4e5-0020-4000-8000-000000000020',
  '1.0.0',
  'packages/workflows/src/trigger/ao-infrastructure-check.ts',
  '{}'::jsonb, '{}'::jsonb,
  '{"internalOnly": true}'::jsonb,
  'active', '{}'::jsonb
) on conflict do nothing;
