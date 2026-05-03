-- Build Console action catalog seed.
-- Safe to run multiple times.

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
    'ops.profile-a.ao-infrastructure-check',
    'Profile A AO infrastructure check',
    'medium',
    'staging_and_production',
    true,
    '{"requires_approval_for_production": true, "source": "0021_seed_build_console_actions"}'::jsonb
  ),
  (
    'ops.profile-b.create-wp-site',
    'Profile B create new WordPress site',
    'medium',
    'staging_and_production',
    true,
    '{"requires_approval_for_production": true, "workflow_id": "create_wp_site", "source": "0021_seed_build_console_actions"}'::jsonb
  ),
  (
    'ops.profile-c.adopt-client-os',
    'Profile C adopt existing WordPress site',
    'high',
    'staging_and_production',
    true,
    '{"requires_approval": true, "workflow_id": "adopt_client_os", "apply_mode": "adopt_delta", "source": "0021_seed_build_console_actions"}'::jsonb
  )
on conflict (action_key) do update
set
  display_name = excluded.display_name,
  risk_level = excluded.risk_level,
  environment_scope = excluded.environment_scope,
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();
