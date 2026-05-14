-- lobster-factory/packages/db/migrations/0029_repair_os_integration_slots.sql
-- Productize Integration slots without storing raw credentials.
--
-- tenant_integration_bindings stores references and health state only. Secrets
-- stay in the vault/provider systems and are referenced by stable names.

-- 1) AwareWave internal client: seed the integrations already operated by the
-- platform so Repair OS is not blank after the 0028 foundation migration.
with org as (
  select id from public.organizations where slug = 'awarewave-ops'
), rows as (
  select * from (values
    ('sentry', 'vault:SENTRY_AUTH_TOKEN', 'https://sentry.io/api/0', 'active'),
    ('uptime_kuma', 'vault:UPTIME_KUMA_API_KEY', 'https://uptime.aware-wave.com', 'active'),
    ('grafana', 'vault:GRAFANA_SERVICE_ACCOUNT_TOKEN', 'http://127.0.0.1:3009', 'active'),
    ('netdata', 'vault:NETDATA_BEARER_TOKEN', 'https://app.netdata.cloud', 'active'),
    ('posthog', 'vault:POSTHOG_PERSONAL_API_KEY', 'https://us.i.posthog.com/api', 'active'),
    ('slack', 'vault:SLACK_BOT_TOKEN', 'Slack Web API', 'active'),
    ('n8n', 'vault:N8N_AUTH_BEARER_TOKEN', 'https://n8n.aware-wave.com/api/v1', 'active'),
    ('trigger', 'vault:TRIGGER_ACCESS_TOKEN', 'https://trigger.aware-wave.com', 'active'),
    ('supabase', 'vault:SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY', 'https://supabase.aware-wave.com', 'active'),
    ('cloudflare', 'vault:CLOUDFLARE_API_TOKEN', 'Cloudflare account API', 'active')
  ) as r(provider, secret_ref, external_hint, status)
)
insert into public.tenant_integration_bindings (
  organization_id,
  provider,
  secret_ref,
  external_hint,
  provisioning_source,
  status,
  last_seen_at,
  api_metadata
)
select
  org.id,
  rows.provider,
  rows.secret_ref,
  rows.external_hint,
  'manual',
  rows.status,
  now(),
  jsonb_build_object(
    'seeded_by', '0029_repair_os_integration_slots',
    'client_scope', 'internal_first_party',
    'secret_policy', 'reference_only'
  )
from org cross join rows
on conflict (organization_id, provider) do update
set
  secret_ref = coalesce(public.tenant_integration_bindings.secret_ref, excluded.secret_ref),
  external_hint = coalesce(public.tenant_integration_bindings.external_hint, excluded.external_hint),
  provisioning_source = public.tenant_integration_bindings.provisioning_source,
  status = case
    when public.tenant_integration_bindings.status = 'revoked' then 'revoked'
    else excluded.status
  end,
  last_seen_at = coalesce(public.tenant_integration_bindings.last_seen_at, excluded.last_seen_at),
  api_metadata = public.tenant_integration_bindings.api_metadata || excluded.api_metadata,
  updated_at = now();

-- 2) Soulful Expression is an external customer. Seed only the known Supabase
-- relationship and leave other providers for customer setup.
with org as (
  select id from public.organizations where slug = 'soulful-expression'
)
insert into public.tenant_integration_bindings (
  organization_id,
  provider,
  secret_ref,
  external_hint,
  provisioning_source,
  status,
  last_seen_at,
  api_metadata
)
select
  org.id,
  'supabase',
  'vault:SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY',
  'https://mffjqjiidbeibilmxzef.supabase.co',
  'manual',
  'active',
  now(),
  jsonb_build_object(
    'seeded_by', '0029_repair_os_integration_slots',
    'client_scope', 'external_customer',
    'secret_policy', 'reference_only'
  )
from org
on conflict (organization_id, provider) do update
set
  secret_ref = coalesce(public.tenant_integration_bindings.secret_ref, excluded.secret_ref),
  external_hint = coalesce(public.tenant_integration_bindings.external_hint, excluded.external_hint),
  status = case
    when public.tenant_integration_bindings.status = 'revoked' then 'revoked'
    else excluded.status
  end,
  last_seen_at = coalesce(public.tenant_integration_bindings.last_seen_at, excluded.last_seen_at),
  api_metadata = public.tenant_integration_bindings.api_metadata || excluded.api_metadata,
  updated_at = now();

notify pgrst, 'reload schema';
