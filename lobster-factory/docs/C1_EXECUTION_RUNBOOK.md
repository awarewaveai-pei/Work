# C1 Execution Runbook (DB Write Path)

> Scope: C1-1 / C1-2 / C1-3  
> Goal: execute the full DB write validation path in a deterministic order with minimal risk.

## 0) Prerequisites
- Run from `D:\Work\lobster-factory`
- Node runtime available
- Supabase credentials ready for execute mode:
  - `LOBSTER_SUPABASE_URL`
  - `LOBSTER_SUPABASE_SERVICE_ROLE_KEY`

## 1) Dryrun First (mandatory)
1. `node scripts/bootstrap-validate.mjs`
2. `node scripts/validate-manifests.mjs`
3. `node scripts/validate-governance-configs.mjs`
4. `node scripts/validate-workflow-runs-write.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444`
5. `node scripts/validate-package-install-runs-flow.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --workflowRunId=66666666-6666-6666-6666-666666666666`
6. `node scripts/validate-db-write-resilience.mjs`

## 2) Execute Mode (staging only)
> Run only after Dryrun First is fully green.

1. C1-1 workflow_runs write:
   - `node scripts/validate-workflow-runs-write.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --execute=1`
2. C1-2 package_install_runs status flow:
   - `node scripts/validate-package-install-runs-flow.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --workflowRunId=66666666-6666-6666-6666-666666666666 --execute=1`
3. C1-3 resilience write check:
   - `node scripts/validate-db-write-resilience.mjs --execute=1`

## 3) Acceptance Criteria
- C1-1: insert succeeds and returns `insertedId` for `workflow_runs`.
- C1-2: insert + transition sequence succeeds (`pending -> running -> completed`).
- C1-3: retry/trace pipeline runs with no fatal write failure.

## 4) Rollback-Safe Handling
- If any execute step fails:
  - Stop immediately.
  - Keep `traceId` from output/error.
  - Patch related `workflow_runs` status to `failed` with error context.
  - Record incident evidence in `agency-os/WORKLOG.md` and daily note.

## 5) After Successful Run
- Update:
  - `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md` (mark C1 tasks)
  - `agency-os/TASKS.md`
  - `agency-os/WORKLOG.md`
  - `agency-os/memory/CONVERSATION_MEMORY.md`
  - `agency-os/memory/daily/YYYY-MM-DD.md`
