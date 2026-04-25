-- Minimal seed for Ops Console v1 smoke.
-- Safe to run multiple times.

insert into organizations (
  type,
  name,
  slug,
  status,
  default_locale,
  default_timezone
)
values (
  'agency',
  'AwareWave Ops',
  'awarewave-ops',
  'active',
  'en',
  'UTC'
)
on conflict (slug) do update
set
  name = excluded.name,
  status = excluded.status,
  default_locale = excluded.default_locale,
  default_timezone = excluded.default_timezone;

insert into ops_action_catalog (
  action_key,
  display_name,
  risk_level,
  environment_scope,
  enabled,
  metadata
)
values
  (
    'ops.staging.ai-image.generate',
    'Generate AI image (staging)',
    'medium',
    'staging_only',
    true,
    '{"requires_approval": false, "source": "0012_seed_ops_console_minimal"}'::jsonb
  ),
  (
    'ops.staging.workflow.retry',
    'Retry workflow run (staging)',
    'low',
    'staging_only',
    true,
    '{"requires_approval": false, "source": "0012_seed_ops_console_minimal"}'::jsonb
  )
on conflict (action_key) do update
set
  display_name = excluded.display_name,
  risk_level = excluded.risk_level,
  environment_scope = excluded.environment_scope,
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();
