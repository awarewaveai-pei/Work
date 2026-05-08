-- seed-soulful-ssh-config-2026-05-08.sql
-- Add SSH + wave config to Soulful Expression so the web UI "一鍵更新外掛" buttons work.
--
-- BEFORE RUNNING:
--   1. Confirm SSH access:  ssh -p 65002 <your_user>@<hostinger_ip>  (test with key auth)
--   2. Confirm WP path:     ls /home/<user>/public_html/wp-config.php
--   3. Store SSH key on SG server (one-time, see below)
--   4. Fill in the placeholders marked with <FILL_IN_...>
--   5. Run in Supabase SQL editor
--
-- ─── SSH key setup on SG server (one-time) ───────────────────────────────────
-- On your local machine, run once to base64-encode the private key:
--
--   $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\.ssh\hostinger_soulful"))
--   docker exec lobster-next-admin sh -c "echo SSH_KEY_HOSTINGER_SOULFUL=$b64 >> /etc/environment"
--
-- Then restart the container so Next.js picks up the env var:
--   docker compose -f /opt/lobster-factory/docker-compose.yml restart next-admin
--
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: preview current config
SELECT slug, name, metadata->'client_config' AS client_config
FROM   organizations
WHERE  slug = 'soulful-expression';

-- Step 2: merge SSH + wave fields into existing client_config
-- ⚠️ Replace <FILL_IN_...> with real values before running.
UPDATE organizations
SET    metadata = jsonb_set(
         metadata,
         '{client_config}',
         (COALESCE(metadata->'client_config', '{}'::jsonb)) || jsonb_build_object(
           -- SSH connection (Hostinger shared hosting uses port 65002)
           'ssh_host',     '<FILL_IN_HOSTINGER_IP_OR_HOSTNAME>',
           'ssh_port',     65002,
           'ssh_user',     '<FILL_IN_CPANEL_USERNAME>',
           'ssh_key_name', 'HOSTINGER_SOULFUL',
           'wp_path',      '<FILL_IN_WP_ROOT_PATH>',  -- e.g. /home/soulful12/public_html

           -- Wave assignments: plug in the actual WP plugin slugs.
           -- Run: wp plugin list --update=available --format=json  to get the current list.
           -- wave1 = high risk (security, payment, WooCommerce core)
           -- wave2 = medium risk (forms, SEO, caching)
           -- wave3 = low risk (utilities, helpers, small plugins)
           'waves', jsonb_build_object(
             'wave1', '[]'::jsonb,   -- e.g. '["woocommerce","contact-form-7"]'::jsonb
             'wave2', '[]'::jsonb,   -- e.g. '["yoast-seo","wp-super-cache"]'::jsonb
             'wave3', '[]'::jsonb    -- e.g. '["akismet","hello-dolly"]'::jsonb
           )
         ),
         true
       )
WHERE  slug = 'soulful-expression';

-- Step 3: verify result
SELECT slug, name,
       metadata->'client_config' AS client_config
FROM   organizations
WHERE  slug = 'soulful-expression';
