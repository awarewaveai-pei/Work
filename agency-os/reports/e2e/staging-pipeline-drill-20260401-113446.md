# Staging pipeline drill report

- **Generated (UTC)**: 2026-04-01T03:34:46.944Z
- **Repo**: lobster-factory + agency-os (monorepo)
- **Regression**: `npm run regression:staging-pipeline` → exit **0**
- **Bootstrap (optional)**: `npm run validate` → **skipped**

## Payload source of truth
- `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`

## Manual checklist
- [ ] Regression with real WP: `node scripts/run-staging-pipeline-regression.mjs --mode=fast --wpRootPath="<WP_ROOT>"`
- [ ] Mock hosting: `LOBSTER_HOSTING_ADAPTER=mock` + Trigger/local `create-wp-site` → `mock_staging_provisioned`
- [ ] HTTP JSON hosting (optional): `LOBSTER_HOSTING_ADAPTER=http_json` + control plane + `create-wp-site` → `vendor_staging_provisioned`
- [ ] DB writes (optional): `LOBSTER_ENABLE_DB_WRITES=true` + Supabase env

## Evidence
- Commit / branch:
- Health / guard report paths:
- Screenshots / Supabase row ids:

## Notes
A10-2 desktop run: preflight PASS; regression 4/4 with Git bash + DRY_RUN wp-cli optional (2026-04-01).
