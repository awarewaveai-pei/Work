# codex-oracle review -- 2026-10-14 20:50:08 +08:00

- mode: `review`
- scope: -Path scripts/system-health-check.ps1, agency-os/automation, agency-os/tenants, agency-os/reports/automation, agency-os/docs/operations/tenant-scheduling.md, agency-os/README.md, agency-os/docs/overview/agency-os-complete-system-introduction.md, agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Retire per-tenant Windows scheduling (operator delegated the decision): REGISTER_TENANT_TASKS.ps1 never registered anything (param named Args is empty in PS 5.1, count=0 measured), tenant lists held no client work, the two hand-made monthly tasks had empty lists and were refused on battery. Deleted runner/register/enqueue scripts, OPERATIONS_SCHEDULE.json/OPS_QUEUE.json in 3 tenants + template, reports/automation; unregistered the 2 tasks; health check no longer requires those files; SOP/README/guides point to a planned app.aware-wave.com schedule page; tenant-scheduling.md kept as a retirement notice so links stay valid. Check: anything still reading the deleted files, or a health/doc check that now silently passes because its subject is gone.
- exit: 0 | elapsed: 323479ms | answer: 1697B
- files-reviewed: agency-os/automation/ENQUEUE_TENANT_TASK.ps1, agency-os/automation/REGISTER_TENANT_TASKS.ps1, agency-os/automation/TENANT_AUTOMATION_RUNNER.ps1, agency-os/reports/automation/company-p1-pilot/run-monthly-20260901-124713.json, agency-os/reports/automation/company-p1-pilot/run-monthly-20260901-124713.md, agency-os/reports/automation/tasks-list.csv, agency-os/tenants/company-p1-pilot/OPERATIONS_SCHEDULE.json, agency-os/tenants/company-p1-pilot/OPS_QUEUE.json, agency-os/tenants/company-scenery-travel-mongolia/OPERATIONS_SCHEDULE.json, agency-os/tenants/company-scenery-travel-mongolia/OPS_QUEUE.json, agency-os/tenants/company-soulful-expression/OPERATIONS_SCHEDULE.json, agency-os/tenants/company-soulful-expression/OPS_QUEUE.json, agency-os/tenants/templates/tenant-template/OPERATIONS_SCHEDULE.json, agency-os/tenants/templates/tenant-template/OPS_QUEUE.json, agency-os/README.md, agency-os/automation/README.md, agency-os/automation/claude-routines/README.md, agency-os/docs/operations/tenant-scheduling.md, agency-os/docs/overview/agency-os-complete-system-introduction.md, agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md, agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md, agency-os/tenants/README.md, agency-os/tenants/company-soulful-expression/04_OPERATIONS_AUTOMATION_GUIDE.md, agency-os/tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md, agency-os/tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md, scripts/system-health-check.ps1
- deletions-reviewed: agency-os/automation/ENQUEUE_TENANT_TASK.ps1@dfa18978c, agency-os/automation/REGISTER_TENANT_TASKS.ps1@9454b3358, agency-os/automation/TENANT_AUTOMATION_RUNNER.ps1@0b6dea9bd, agency-os/reports/automation/company-p1-pilot/run-monthly-20260901-124713.json@e407e68c2, agency-os/reports/automation/company-p1-pilot/run-monthly-20260901-124713.md@661ec666a, agency-os/reports/automation/tasks-list.csv@594092a91, agency-os/tenants/company-p1-pilot/OPERATIONS_SCHEDULE.json@825bd988e, agency-os/tenants/company-p1-pilot/OPS_QUEUE.json@fe51488c7, agency-os/tenants/company-scenery-travel-mongolia/OPERATIONS_SCHEDULE.json@d71fec1f4, agency-os/tenants/company-scenery-travel-mongolia/OPS_QUEUE.json@fe51488c7, agency-os/tenants/company-soulful-expression/OPERATIONS_SCHEDULE.json@4258ac2db, agency-os/tenants/company-soulful-expression/OPS_QUEUE.json@981f6c25a, agency-os/tenants/templates/tenant-template/OPERATIONS_SCHEDULE.json@aa39e1f24, agency-os/tenants/templates/tenant-template/OPS_QUEUE.json@2feb21015

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Deleting the p1 schedule removes an enabled onboarding readiness job.

  agency-os/tenants/company-p1-pilot/OPERATIONS_SCHEDULE.json:3-7 -> agency-os/docs/operations/tenant-scheduling.md:4-11
  confidence  -> CONFIRMED
  scenario    -> The tenant is undergoing A10-2 onboarding -> `preflight-onboarding-a10-2-readiness.ps1` is no longer scheduled, so readiness evidence stops updating.
  why missed  -> The change treated the tenant schedule as empty, overlooking its enabled daily task.

FINDING 2: Deleting Soulful Expression’s schedule silently removes its daily documentation sync.

  agency-os/tenants/company-soulful-expression/OPERATIONS_SCHEDULE.json:12-23 -> agency-os/tenants/company-soulful-expression/04_OPERATIONS_AUTOMATION_GUIDE.md:4-8
  confidence  -> CONFIRMED
  scenario    -> The daily doc-sync task is enabled -> deleting the schedule and runner stops automatic documentation synchronization, allowing generated documents to drift.
  why missed  -> The task was classified as retired tenant work even though it performs repository-wide documentation governance.

FINDING 3: The revised health check can pass while legacy Windows tasks still invoke deleted automation.

  scripts/system-health-check.ps1:67-73 -> scripts/system-health-check.ps1:242-248
  confidence  -> PLAUSIBLE
  scenario    -> A machine retains an old `AgencyOS-*` scheduled task, while the deleted runner and schedule files are absent -> all remaining health checks pass even though the task still fires and fails.
  why missed  -> File-existence requirements were removed, but stale machine-level task registrations are not represented in the replacement checks.

Final line: TOTAL: 3 findings
