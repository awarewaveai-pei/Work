# Artifacts Governance Audit - 2026-03-31T13-18-44-885Z

## Scope
- repoRoot: `D:\Work\lobster-factory`
- workRoot: `D:\Work`
- artifactsBaseDir: `D:\Work\agency-os\reports\artifacts\lobster`
- applyManifestDir: `D:\Work\agency-os\reports\artifacts\lobster\apply-manifest`

## Policy snapshot
- provider_strategy.mode: `portable_single_provider`
- provider_strategy.primary: `cloudflare_r2`
- provider_strategy.supported: `cloudflare_r2, aws_s3`
- provider_strategy.contract: `presigned_put_http`
- retention.staging_days: `30`
- iam.enforce_tenant_prefix: `true`
- iam.allow_runtime_bucket_list: `false`
- iam.presign_ttl_minutes_max: `15`
- iam.required_prefix_template: `<orgId>/<workspaceId>/<trigger>/<workflowRunId>/`

## Local artifacts findings
- workflow run directories found: `0`
- stale directories (>30d): `0`

## Result
- PASS: no stale local artifact directories over retention baseline.
