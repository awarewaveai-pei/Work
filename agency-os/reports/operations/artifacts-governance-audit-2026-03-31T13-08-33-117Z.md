# Artifacts Governance Audit - 2026-03-31T13-08-33-117Z

## Scope
- repoRoot: `D:\Work\lobster-factory`
- workRoot: `D:\Work`
- artifactsBaseDir: `D:\Work\agency-os\reports\artifacts\lobster`
- applyManifestDir: `D:\Work\agency-os\reports\artifacts\lobster\apply-manifest`

## Policy snapshot
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
