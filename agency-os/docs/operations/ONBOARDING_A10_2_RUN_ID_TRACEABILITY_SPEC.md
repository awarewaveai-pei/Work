# Onboarding + A10-2 Run ID Traceability Spec

## Purpose
Define one consistent traceability chain for new tenant onboarding and A10-2 business loop execution so evidence is complete and searchable across Agency OS + Lobster Factory.

## Required IDs
- `tenant_slug` (example: `company-acme`)
- `project_slug` (example: `2026-002-onboarding`)
- `workflow_run_id` (from Lobster workflow run)
- `package_install_run_id` (from apply-manifest execution)
- `logs_ref` (artifact logical reference)
- `git_commit` (evidence snapshot commit)
- `e2e_report_path` (report file under `agency-os/reports/e2e/`)

## Source-of-truth mapping
- Tenant/project identity: `agency-os/tenants/**`
- Runtime IDs: Lobster workflow output / DB rows
- Artifact reference: `logs_ref` and artifact report paths
- Business evidence narrative: `agency-os/WORKLOG.md` + `memory/daily/YYYY-MM-DD.md`

## Recording format (required)
For each meaningful run, add one row to the run map in the evidence folder:

| field | value |
|------|-------|
| tenant_slug | |
| project_slug | |
| workflow_run_id | |
| package_install_run_id | |
| logs_ref | |
| git_commit | |
| e2e_report_path | |
| status | `planned` / `running` / `completed` / `failed` / `rolled_back` |
| note | |

## State transition rules
- `planned -> running -> completed` is the expected path.
- Any failure must record `failed` with rollback note.
- `rolled_back` requires rollback evidence path.
- Never skip directly from `planned` to `completed` without run IDs.

## Minimum evidence checklist
- Run map row present and complete.
- At least one report path exists under `agency-os/reports/e2e/`.
- `WORKLOG.md` and daily memory include the same `workflow_run_id`.
- `TASKS.md` reflects the latest milestone status.

## Related
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `../lobster-factory/docs/e2e/OPERABLE_E2E_PLAYBOOK.md`
- `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`
