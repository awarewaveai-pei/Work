-- Phase 1 catalog seed (deterministic IDs)
-- Enables workflow_runs / package_install_runs to reference known workflow_versions and wc-core artifacts.

-- Fixed UUIDs (must match code constants)
-- wc-core
--   package_version_id: 9819a867-36b9-4470-bdb9-611a0751dba6
--   manifest_id:        8760d0ba-35ae-483a-8fa6-abd19f5c6d4d
-- create-wp-site workflow version
--   workflow_version_id: d6d3cfe2-5aba-4458-84a6-37237d6df347
-- apply-manifest workflow version
--   workflow_version_id: 0161fdd2-2381-4ab5-bcf9-fe247507ac05

-- wc-core package + version
insert into packages (
  id,
  scope_type,
  scope_id,
  name,
  slug,
  package_type,
  description,
  status,
  default_version,
  metadata
)
values (
  '86b1831a-5f97-4a25-84a3-4429bf3408c1',
  'global',
  NULL,
  'wc-core',
  'wc-core',
  'wordpress',
  'Base WooCommerce + Kadence + FluentCRM stack',
  'active',
  '1.0.0',
  '{}'::jsonb
)
on conflict do nothing;

insert into package_versions (
  id,
  package_id,
  version,
  changelog,
  compatibility,
  status,
  artifact_ref,
  created_by,
  metadata
)
values (
  '9819a867-36b9-4470-bdb9-611a0751dba6',
  '86b1831a-5f97-4a25-84a3-4429bf3408c1',
  '1.0.0',
  NULL,
  '{}'::jsonb,
  'active',
  NULL,
  NULL,
  '{}'::jsonb
)
on conflict do nothing;

insert into manifests (
  id,
  package_version_id,
  schema_version,
  manifest_json,
  install_guardrails,
  dependencies,
  conflicts,
  rollback_hints,
  status
)
values (
  '8760d0ba-35ae-483a-8fa6-abd19f5c6d4d',
  '9819a867-36b9-4470-bdb9-611a0751dba6',
  '1.0.0',
  $manifest$
  {
    "name": "wc-core",
    "version": "1.0.0",
    "schemaVersion": "1.0.0",
    "target": "staging-only",
    "description": "Base WooCommerce + Kadence + FluentCRM stack",
    "guardrails": {
      "allowEnvironments": ["staging"],
      "requireBackup": true,
      "blockIfProduction": true
    },
    "dependencies": [],
    "conflicts": [],
    "steps": [
      { "id": "theme-kadence", "type": "install_theme", "slug": "kadence" },
      { "id": "plugin-kadence-blocks", "type": "install_plugin", "slug": "kadence-blocks" },
      { "id": "plugin-woocommerce", "type": "install_plugin", "slug": "woocommerce" },
      { "id": "plugin-cartflows", "type": "install_plugin", "slug": "cartflows" },
      { "id": "plugin-rank-math", "type": "install_plugin", "slug": "seo-by-rank-math" },
      { "id": "plugin-fluent-crm", "type": "install_plugin", "slug": "fluent-crm" },
      { "id": "plugin-fluent-forms", "type": "install_plugin", "slug": "fluentform" },
      { "id": "plugin-fluent-smtp", "type": "install_plugin", "slug": "fluent-smtp" },
      { "id": "plugin-site-kit", "type": "install_plugin", "slug": "google-site-kit" },
      {
        "id": "plugin-litespeed",
        "type": "conditional_plugin",
        "condition": "is_litespeed",
        "slug": "litespeed-cache"
      }
    ],
    "postInstall": [
      { "type": "activate_theme", "slug": "kadence" },
      { "type": "flush_permalinks" },
      { "type": "set_option", "key": "timezone_string", "value": "Asia/Taipei" }
    ],
    "verification": [
      { "type": "check_homepage" },
      { "type": "check_admin_login" },
      { "type": "check_plugin_active", "slug": "woocommerce" },
      { "type": "check_plugin_active", "slug": "fluent-crm" }
    ],
    "rollback": { "strategy": "restore_backup_snapshot" }
  }
  $manifest$::jsonb,
  $guardrails${
    "allowEnvironments": ["staging"],
    "requireBackup": true,
    "blockIfProduction": true
  }$guardrails$::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  $rollbackHints${
    "strategy": "restore_backup_snapshot"
  }$rollbackHints$::jsonb,
  'active'
)
on conflict do nothing;

-- Workflows
-- workflow ids are not required for workflow_runs templates, but still seeded for consistency.
insert into workflows (
  id,
  scope_type,
  scope_id,
  name,
  slug,
  domain,
  orchestrator_type,
  risk_level,
  status,
  default_version,
  input_schema,
  output_schema,
  rollback_strategy,
  metadata
)
values (
  '77b3abe4-056d-4ea5-a537-b44bb89d63d0',
  'global',
  NULL,
  'apply-manifest',
  'apply-manifest',
  'wp-factory',
  'durable',
  'medium',
  'active',
  '1.0.0',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into workflow_versions (
  id,
  workflow_id,
  version,
  definition_ref,
  routing_config,
  trigger_config,
  guardrails,
  status,
  metadata
)
values (
  '0161fdd2-2381-4ab5-bcf9-fe247507ac05',
  '77b3abe4-056d-4ea5-a537-b44bb89d63d0',
  '1.0.0',
  'packages/workflows/src/trigger/apply-manifest.ts',
  '{}'::jsonb,
  '{}'::jsonb,
  '{"stagingOnly": true}'::jsonb,
  'active',
  '{}'::jsonb
)
on conflict do nothing;

insert into workflows (
  id,
  scope_type,
  scope_id,
  name,
  slug,
  domain,
  orchestrator_type,
  risk_level,
  status,
  default_version,
  input_schema,
  output_schema,
  rollback_strategy,
  metadata
)
values (
  '7a279eda-2e49-4043-b362-9a155122f0b2',
  'global',
  NULL,
  'create-wp-site',
  'create-wp-site',
  'wp-factory',
  'durable',
  'medium',
  'active',
  '1.0.0',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb
)
on conflict do nothing;

insert into workflow_versions (
  id,
  workflow_id,
  version,
  definition_ref,
  routing_config,
  trigger_config,
  guardrails,
  status,
  metadata
)
values (
  'd6d3cfe2-5aba-4458-84a6-37237d6df347',
  '7a279eda-2e49-4043-b362-9a155122f0b2',
  '1.0.0',
  'packages/workflows/src/trigger/create-wp-site.ts',
  '{}'::jsonb,
  '{}'::jsonb,
  '{"stagingOnly": true}'::jsonb,
  'active',
  '{}'::jsonb
)
on conflict do nothing;

