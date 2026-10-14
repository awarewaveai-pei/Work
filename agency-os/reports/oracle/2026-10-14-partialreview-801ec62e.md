# codex-oracle review -- 2026-10-14 19:10:40 +08:00

- mode: `review`
- scope: -Path agency-os/automation, automation, scripts/system-health-check.ps1, scripts/generate-integrated-status-report.ps1, scripts/generate-customer-delivery-status.ps1, tests/smoke-status-digest.test.ps1, docs/CHANGE_IMPACT_MATRIX.md, docs/change-impact-map.json, .agency-state/doc-sync-state.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to d4b68718b: delete the monorepo-root automation/ copy (each registrar computes its root from its own folder, so half of each tree resolved wrong); agency-os/automation/REGISTER_SYSTEM_GUARD_TASKS.ps1 finds scripts via scripts/lib/repo-roots.ps1; health check fails if root automation/ returns; delete unused M3 generate-customer-delivery-status.ps1 (operator decision); smoke-status-digest test Case1 now pins doc_integrity_commits missing-report = PASS (event-driven source, smoke-status-digest.ps1:520-533). Root docs/ impact map, matrix and .agency-state deleted: nothing reads them (all callers use Resolve-AgencyRoot / agency-os paths).
- exit: 0 | elapsed: 486855ms | answer: 1399B
- files-reviewed: .agency-state/doc-sync-state.json, automation/ENQUEUE_TENANT_TASK.ps1, automation/README.md, automation/REGISTER_AUTOPILOT_PHASE1_TASKS.ps1, automation/REGISTER_SYSTEM_GUARD_TASKS.ps1, automation/REGISTER_TENANT_TASKS.ps1, automation/TENANT_AUTOMATION_RUNNER.ps1, docs/CHANGE_IMPACT_MATRIX.md, docs/change-impact-map.json, scripts/generate-customer-delivery-status.ps1, agency-os/automation/REGISTER_SYSTEM_GUARD_TASKS.ps1, scripts/generate-integrated-status-report.ps1, scripts/system-health-check.ps1, tests/smoke-status-digest.test.ps1
- deletions-reviewed: .agency-state/doc-sync-state.json@77c6cb3f1, automation/ENQUEUE_TENANT_TASK.ps1@7ec7fa6af, automation/README.md@3bdc768f2, automation/REGISTER_AUTOPILOT_PHASE1_TASKS.ps1@0e857a326, automation/REGISTER_SYSTEM_GUARD_TASKS.ps1@145cdda43, automation/REGISTER_TENANT_TASKS.ps1@4d0074699, automation/TENANT_AUTOMATION_RUNNER.ps1@8b6dffd86, docs/CHANGE_IMPACT_MATRIX.md@b8ffca668, docs/change-impact-map.json@15a105f79, scripts/generate-customer-delivery-status.ps1@7665e2246

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Existing tenant scheduled tasks can keep targeting deleted root automation scripts, while health still passes.

  file:line   -> `agency-os/automation/REGISTER_TENANT_TASKS.ps1:73-88,98-100`; `scripts/scheduled-task-launcher.ps1:12`; `scripts/system-health-check.ps1:369-380,982-1027`

  confidence  -> PLAUSIBLE

  scenario    -> A pre-change `AgencyOS-company-a-daily` task still targets `D:\Work\automation\TENANT_AUTOMATION_RUNNER.ps1` -> the launcher fails resolving the deleted target, while health validates only the launcher path and exits 0 because the failed check is not critical.

  why missed  -> Windows Scheduled Tasks are external state; the change deletes the files but provides no migration/removal for tenant/autopilot task names.

FINDING 2: The new automation-tree health check ignores `-WorkspaceRoot`.

  file:line   -> `scripts/system-health-check.ps1:20,115-119,135-136`; `scripts/lib/repo-roots.ps1:6-18`

  confidence  -> CONFIRMED

  scenario    -> Run `system-health-check.ps1 -WorkspaceRoot C:\Clone` where `C:\Clone\automation\stale.ps1` exists -> `$root` resolves to `C:\Clone\agency-os`, but the check scans the current checkout’s `D:\Work\automation`, reporting PASS and missing the stale tree.

  why missed  -> Default execution makes `Get-MonorepoRoot` and `Split-Path $root -Parent` identical, hiding the alternate-root mismatch.

TOTAL: 2 findings
