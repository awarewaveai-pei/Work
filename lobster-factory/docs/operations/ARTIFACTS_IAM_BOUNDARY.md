# Artifacts IAM boundary (A9 baseline)

## Purpose
Define minimum-access boundaries for artifact write/read/delete so Lobster workflows can persist evidence without opening cross-tenant or broad bucket access.

## Scope
- Applies to `LOBSTER_ARTIFACTS_MODE=remote_put` and any future cloud object storage mode.
- Complements `ARTIFACTS_LIFECYCLE_POLICY.md` (retention) and `REMOTE_PUT_ARTIFACTS.md` (integration contract).
- Current strategy: **portable single provider** (`cloudflare_r2` primary, `aws_s3` compatible) via the same presigned PUT contract.

## Baseline principles
- Least privilege: signer can mint short-lived PUT URLs only for approved object keys.
- Tenant isolation: object key prefix must be scoped per tenant/workspace context.
- No list-all in runtime role: workflow runtime should not have bucket `List` on broad prefixes.
- Separation of duties: presign broker principal and bucket admin principal are distinct.
- Short-lived credentials: presigned URLs should expire quickly (recommended <= 15 minutes).

## Required key schema
Recommended object key layout:

`<orgId>/<workspaceId>/<trigger>/<workflowRunId>/<fileName>`

Minimum accepted fallback for current baseline:

`apply-manifest/<workflowRunId>/<fileName>`

If fallback is used, migration to tenant-scoped prefix is required before production rollout.

## Required controls
- Presign endpoint must validate:
  - caller identity (token/service auth)
  - allowed trigger values
  - allowed file names (`stdout.log`, `stderr.log`, `meta.json`, failure variants)
  - key prefix policy (no `../`, no arbitrary bucket path injection)
- Bucket policy must deny:
  - public write
  - wildcard delete from runtime principal
  - cross-prefix write outside approved namespace

## Portability guardrails (R2 <-> S3)
- Do not hardcode vendor SDK in workflow path; keep upload path as HTTP PUT + presign descriptor.
- Vendor-specific headers are allowed only inside broker-returned `headers` (`x-amz-*`, `cf-*`), not as workflow constants.
- Provider switch should require only:
  - presign broker implementation swap
  - IaC/policy update for bucket
  - no workflow payload schema change

## Audit checklist
- Confirm presign service logs: actor, trigger, workflowRunId, key prefix, ttl.
- Confirm object writes are attributable to run id.
- Confirm retention jobs remove expired objects.
- Confirm no credentials or secrets are stored in artifacts.
