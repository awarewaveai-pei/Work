# R2 -> S3 Migration Runbook (A9 artifacts)

## Purpose
Switch artifact storage provider from Cloudflare R2 to AWS S3 without changing Lobster workflow payload contract.

## Scope
- Applies to `LOBSTER_ARTIFACTS_MODE=remote_put`.
- Assumes `presigned_put_http` remains the single contract.
- Target: migration by swapping broker + IaC, not workflow code.

## Definition of done
- Presign broker returns valid descriptor for S3.
- `validate-artifacts-governance` PASS.
- `audit-artifacts-governance` report generated.
- One staging `apply-manifest` run writes `stdout.log/stderr.log/meta.json` to S3.
- `logs_ref` and DB fields remain unchanged in shape.

## 0) Pre-flight checks
1. Confirm policy is portable:
   - `policies/artifacts/artifacts-governance-baseline.json`
   - `provider_strategy.mode = portable_single_provider`
   - `provider_strategy.contract = presigned_put_http`
2. Run baseline checks:
   - `node scripts/validate-artifacts-governance.mjs`
   - `node scripts/bootstrap-validate.mjs`
3. Freeze A9 schema:
   - Do not change descriptor JSON keys (`puts`, `logsRef`).

## 1) Prepare S3 side (IaC / policy)
1. Create bucket (staging first).
2. Apply lifecycle rules based on policy retention.
3. Apply least-privilege IAM:
   - Presign principal: can sign `PutObject` for approved key prefixes only.
   - Runtime principal: no broad `ListBucket`, no wildcard deletes.
4. Enforce key prefix template:
   - `<orgId>/<workspaceId>/<trigger>/<workflowRunId>/<fileName>`

## 2) Cutover presign broker
1. Keep the same broker response schema:
   - `puts.<file>.url`
   - `puts.<file>.headers`
   - `puts.<file>.contentType`
   - optional `logsRef`
2. Change broker internals from R2 signing to S3 signing.
3. Keep `LOBSTER_ARTIFACTS_PRESIGN_URL` endpoint unchanged if possible.
4. Keep auth contract unchanged (`LOBSTER_ARTIFACTS_PRESIGN_TOKEN`).

## 3) Staging validation
1. Run:
   - `node scripts/validate-artifacts-governance.mjs`
   - `node scripts/audit-artifacts-governance.mjs`
2. Execute one staging manifest run (`dry_run` then `apply` if allowed).
3. Verify:
   - S3 object keys follow prefix template.
   - `stdout.log`, `stderr.log`, `meta.json` exist.
   - DB `logs_ref` is populated and usable by operators.

## 4) Rollback plan
If S3 cutover fails:
1. Point broker back to R2 signing immediately.
2. Re-run one staging manifest to confirm artifact write path restored.
3. Keep failed S3 attempt logs for audit.
4. Record rollback in `agency-os/WORKLOG.md` and daily memory.

## 5) Post-cutover hardening
1. Rotate signing credentials used during migration window.
2. Run one more `audit-artifacts-governance` and archive report.
3. Update `provider_strategy.primary` if migration is permanent.
4. Keep R2 fallback window until two consecutive closeouts pass.

## Related
- `docs/operations/REMOTE_PUT_ARTIFACTS.md`
- `docs/operations/ARTIFACTS_IAM_BOUNDARY.md`
- `docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md`
- `policies/artifacts/artifacts-governance-baseline.json`
