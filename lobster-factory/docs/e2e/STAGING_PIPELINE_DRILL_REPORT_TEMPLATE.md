# Staging pipeline drill report

- **Generated (UTC)**: {{GENERATED_AT_UTC}}
- **Repo**: lobster-factory + agency-os (monorepo)
- **Regression**: `npm run regression:staging-pipeline` → exit **{{REGRESSION_EXIT_CODE}}**
- **Bootstrap (optional)**: `npm run validate` → **{{BOOTSTRAP_EXIT_CODE}}**

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
{{FREE_TEXT}}
