# WordPress Factory Execution Spec

## Purpose
Define one fixed execution channel for WordPress Factory delivery so provisioning is staging-first, approval-gated for production, rollback-aware, and fully auditable.

## Execution Channel (single path)
1. Trigger workflow receives `site_provisioning` request.
2. Create `workflow_run` in Supabase with tenant scope.
3. Provision/update staging environment only.
4. Apply `wc-core` manifest via Trigger workflow step.
5. Run smoke tests and write artifacts.
6. If failure: open incident + run compensation/rollback.
7. If production requested: create approval record and block until approved.
8. On approval: run production rollout with mandatory precheck/postcheck.
9. Write final status, artifacts, and decision log to Supabase.

## Required Tenant Context
- `organization_id`
- `workspace_id`
- `project_id`
- `site_id`
- `environment`
- `actor_id`
- `run_id`

Any missing field must fail fast before side effects.

## Workflow Contract
### Input (minimum)
```json
{
  "organization_id": "uuid",
  "workspace_id": "uuid",
  "project_id": "uuid",
  "site_id": "uuid",
  "target_environment": "staging|production",
  "manifest_slug": "wc-core",
  "requested_by": "user_or_agent_id"
}
```

### Output (minimum)
```json
{
  "run_id": "uuid",
  "status": "completed|failed|blocked_for_approval|rolled_back",
  "artifacts": [
    "manifest_apply_report.json",
    "smoke_test_report.json"
  ],
  "incident_id": "uuid|null",
  "approval_id": "uuid|null"
}
```

## Stage Definitions
### Stage A: Precheck
- Validate tenant context and policy.
- Validate manifest integrity (`wc-core` only for current baseline).
- Validate environment guardrails (`production` forbidden without approval record).

### Stage B: Staging Provision
- Ensure staging environment record exists.
- Prepare WP root/runtime channel (adapter execution).
- Record all side effects in `workflow_runs`.

### Stage C: Package Apply
- Apply manifest steps in deterministic order.
- Persist package lifecycle status (`pending -> running -> completed|failed`).
- Capture per-step logs as artifacts reference.

**Implementation (M3 baseline, repo)**
- Shell executor: `templates/woocommerce/scripts/install-from-manifest.sh` (`DRY_RUN=1` preview vs real `wp` calls).
- Trigger task `apply-manifest` optional hook: set `LOBSTER_EXECUTE_MANIFEST_STEPS=true` and `LOBSTER_MANIFEST_EXECUTION_MODE=dry_run|apply` (see `lobster-factory/README.md`).
- Local CLI: `scripts/execute-apply-manifest-staging.mjs` (`--execute=0|1`) with the same manifest guardrails as `dryrun-apply-manifest.mjs`.
- **M3 + C2-3 baseline**: after successful shell with DB writes, rows are PATCHed to `completed`; on shell failure to `failed` (`supabaseRestPatch`). Rollback script: `rollback-from-manifest.sh` + `rollback-apply-manifest-staging.mjs` (plugin deactivate reverse order; theme manual; full restore = hosting snapshot).
- **A9 artifacts**: `LOBSTER_ARTIFACTS_MODE=local` → disk under `agency-os/reports/artifacts/lobster/…` (`LOCAL_ARTIFACTS_SINK.md`). `LOBSTER_ARTIFACTS_MODE=remote_put` → presigned HTTP PUT (`REMOTE_PUT_ARTIFACTS.md`). Both set `logs_ref` + `output_snapshot.logsRef` on PATCH when writes enabled.
- **Hosting contract**: `resolveStagingProvisioning` drives `create-wp-site` (`none` / `mock` / `provider_stub` / `http_json` / unknown blocked) — `docs/hosting/HOSTING_ADAPTER_CONTRACT.md`, `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md`.

### Stage D: Smoke Validation
- Run mandatory smoke test suite:
  - WordPress reachable
  - WooCommerce active
  - Core plugin set status
  - Basic auth/session path
- Store structured report in artifacts.

### Stage E: Decision Gate
- If target is `staging`: finish run.
- If target is `production`:
  - create `approvals` record
  - set run status `blocked_for_approval`
  - wait for decision event

### Stage F: Production Rollout
- Run only when approval status is `approved`.
- Enforce precheck + change summary + rollback plan.
- Execute rollout and write postcheck results.

## Risk and Approval Policy
- `production` actions are `critical` risk by default.
- Approval is mandatory for:
  - production deploy
  - production plugin/theme change
  - DNS cutover
- Approval payload must include:
  - change summary
  - rollback plan
  - precheck status
  - linked artifacts

## Rollback and Compensation
- Mandatory rollback points:
  - before package apply
  - before production rollout
- On failure:
  - set status to `failed`
  - create incident
  - execute compensation step
  - if compensation succeeds, set `rolled_back`

## Audit Trail Requirements
Every run must persist:
- input snapshot
- output snapshot
- error payload (if any)
- artifacts metadata
- approval decisions
- incident linkage

Tables used:
- `workflow_runs`
- `approvals`
- `incidents`
- `artifacts` (or artifacts metadata field)

## Tool Routing (enforced)
- Trigger.dev: orchestration and durable execution.
- Supabase: state/audit/approvals/incident records.
- GitHub: code + release gate.
- n8n: notification/webhook glue only.
- WordPress runtime: final delivery surface, not control plane.

## Non-goals (current phase)
- Direct production automation without approval.
- Replacing durable workflow with n8n-only orchestration.
- Storing runtime secrets in repo files.
