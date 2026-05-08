-- seed-org-client-config-2026-05-08.sql
-- Run in Supabase SQL editor (or psql) to set metadata.client_config for each org.
-- Safe to re-run: uses jsonb_build_object merge, preserves wp_update_latest and other keys.
-- No new tables — just sets sub-keys in the existing organizations.metadata JSONB column.
--
-- BEFORE RUNNING: confirm slugs with:
--   SELECT id, slug, name FROM organizations ORDER BY created_at;

-- ─── Step 1: Verify which orgs exist ─────────────────────────────────────────
SELECT id, slug, name, status,
       metadata->'client_config' AS client_config_current
FROM   organizations
ORDER  BY created_at;

-- ─── Step 2: AwareWave — platform: saas (the operator's own platform) ─────────
-- Change the WHERE clause if your awarewave org slug differs from 'awarewave-ops'.
UPDATE organizations
SET    metadata = jsonb_set(
         metadata,
         '{client_config}',
         jsonb_build_object(
           'platform',      'saas',
           'hosting_type',  'hetzner',
           'site_url',      'https://app.aware-wave.com',
           'notes',         'Platform itself — AwareWave ops console'
         ),
         true  -- create key if absent
       )
WHERE  slug = 'awarewave-ops';

-- ─── Step 3: Soulful Expression — platform: wordpress ────────────────────────
-- Change the WHERE clause if the org slug differs.
-- wp_slug must match clientSlug in agency-os/tenants/company-soulful-expression/core/wp-update-config.json
UPDATE organizations
SET    metadata = jsonb_set(
         metadata,
         '{client_config}',
         jsonb_build_object(
           'platform',       'wordpress',
           'hosting_type',   'hostinger',
           'site_url',       'https://soulfulexpression.org',
           'wp_slug',        'soulful',
           'tenant_folder',  'company-soulful-expression',
           'notes',          'Hostinger shared hosting — port 65002'
         ),
         true
       )
WHERE  slug = 'soulful-expression';

-- ─── Step 4: Verify result ────────────────────────────────────────────────────
SELECT slug, name,
       metadata->'client_config' AS client_config
FROM   organizations
ORDER  BY created_at;
