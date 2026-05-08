-- seed-soulful-ssh-config-FINAL-2026-05-08.sql
-- Fills in real SSH + wave values for Soulful Expression
-- from agency-os/tenants/company-soulful-expression/core/wp-update-config.json
-- Safe to re-run: merges into existing client_config, preserves all other keys.

-- Step 1: verify current state
SELECT slug, name, metadata->'client_config' AS client_config
FROM organizations
WHERE slug = 'soulful-expression';

-- Step 2: merge SSH + wave fields (real values — no placeholders)
UPDATE organizations
SET metadata = jsonb_set(
  metadata,
  '{client_config}',
  (COALESCE(metadata->'client_config', '{}'::jsonb)) || jsonb_build_object(
    'ssh_host',     '191.101.230.176',
    'ssh_port',     65002,
    'ssh_user',     'u942075013',
    'ssh_key_name', 'HOSTINGER_SOULFUL',
    'wp_path',      '/home/u942075013/domains/soulfulexpression.org/public_html',
    'waves', jsonb_build_object(
      'wave1', '["advanced-custom-fields-pro","ultimate-member","woocommerce","woocommerce-points-and-rewards"]'::jsonb,
      'wave2', '["fluentform","kadence-blocks-pro","litespeed-cache","permalink-manager-pro"]'::jsonb,
      'wave3', '["akismet","astra-portfolio","cartflows","code-snippets","google-site-kit","hostinger","kadence-blocks","seo-by-rank-math"]'::jsonb
    )
  ),
  true
)
WHERE slug = 'soulful-expression';

-- Step 3: verify result
SELECT slug, name,
       metadata->'client_config'->>'ssh_host'     AS ssh_host,
       metadata->'client_config'->>'ssh_port'     AS ssh_port,
       metadata->'client_config'->>'ssh_user'     AS ssh_user,
       metadata->'client_config'->>'wp_path'      AS wp_path,
       jsonb_array_length(metadata->'client_config'->'waves'->'wave1') AS wave1_count,
       jsonb_array_length(metadata->'client_config'->'waves'->'wave2') AS wave2_count,
       jsonb_array_length(metadata->'client_config'->'waves'->'wave3') AS wave3_count
FROM organizations
WHERE slug = 'soulful-expression';
