# codex-oracle review -- 2026-10-14 10:28:07 +08:00

- mode: `review`
- scope: -Path scripts, mcp/claude-userlevel/hooks, .github/workflows, automation, agency-os/automation, agency-os/scripts, agency-os/docs/change-impact-map.json, agency-os/reports/ao-close/2026-10-03-1457.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Removes the stale agency-os/scripts copy that scheduled tasks ran (CRLF+BOM writes, dropped doc content): scripts find code via PSScriptRoot and agency data via scripts/lib/repo-roots.ps1 Resolve-AgencyRoot (AGENTS.md marker); WorkRoot detectors that tested agency-os/scripts/system-guard.ps1 replaced; doc-sync Upsert-RelatedBlock replaces only its own block; monthly registrar on Task Scheduler COM; health check fails if a scripts folder or code path under agency-os returns; impact map paths agency-relative ../scripts. Focus: wrong-root resolution, silently skipped call sites, doc-sync content loss.
- exit: 0 | elapsed: 321545ms | answer: 2290B
- files-reviewed: agency-os/automation/REGISTER_MONTHLY_SYSTEM_REVIEW_TASK.ps1, agency-os/scripts/align-workstation.ps1, agency-os/scripts/ao-close.ps1, agency-os/scripts/ao-resume.ps1, agency-os/scripts/archive-old-reports.ps1, agency-os/scripts/autopilot-alert-loop.ps1, agency-os/scripts/autopilot-phase1.ps1, agency-os/scripts/build-product-bundle.ps1, agency-os/scripts/check-supabase-memory-monthly.ps1, agency-os/scripts/check-three-way-sync.ps1, agency-os/scripts/doc-sync-automation.ps1, agency-os/scripts/ensure-mariadb-on-user-path.ps1, agency-os/scripts/generate-integrated-status-report.ps1, agency-os/scripts/init-closeout-inbox.ps1, agency-os/scripts/init-onboarding-a10-2-evidence-skeleton.ps1, agency-os/scripts/install-autopilot-startup-fallback.ps1, agency-os/scripts/machine-environment-audit.ps1, agency-os/scripts/monthly-system-review.ps1, agency-os/scripts/notify-ops.ps1, agency-os/scripts/preflight-onboarding-a10-2-readiness.ps1, agency-os/scripts/register-autopilot-phase1.ps1, agency-os/scripts/register-new-governance-doc.ps1, agency-os/scripts/render-program-timeline-from-schedule.ps1, agency-os/scripts/run-postgres-mcp.ps1, agency-os/scripts/secrets-vault.ps1, agency-os/scripts/start-trigger-mcp.ps1, agency-os/scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1, agency-os/scripts/system-guard.ps1, agency-os/scripts/system-health-check.ps1, agency-os/scripts/verify-build-gates.ps1, agency-os/scripts/weekly-system-review.ps1, automation/REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1, scripts/airtable-audit.mjs, scripts/airtable-audit.test.mjs, scripts/airtable-snapshot.mjs, scripts/airtable-snapshot.test.mjs, scripts/art-therapy-transform.mjs, scripts/art-therapy-transform.test.mjs, scripts/load-art-therapy-source-archive.mjs, scripts/verify-adr-index.ps1, scripts/verify-art-therapy-dry-run.mjs, scripts/verify-tenant-staging-sites-index-ssot.ps1, .github/workflows/tenant-staging-ssot.yml, agency-os/docs/change-impact-map.json, agency-os/reports/ao-close/2026-10-03-1457.md, mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, scripts/ao-close.ps1, scripts/append-agent-dispatch-to-worklog.ps1, scripts/archive-old-reports.ps1, scripts/audit-cp950-traps.ps1, scripts/autopilot-phase1.ps1, scripts/doc-sync-automation.ps1, scripts/export-cross-machine-memory.ps1, scripts/generate-integrated-status-report.ps1, scripts/import-cross-machine-memory.ps1, scripts/lib/smoke-status-digest.ps1, scripts/monthly-system-review.ps1, scripts/register-monthly-system-review-task.ps1, scripts/register-new-governance-doc.ps1, scripts/render-program-timeline-from-schedule.ps1, scripts/system-guard.ps1, scripts/system-health-check.ps1, scripts/validate-memory-index.ps1, scripts/verify-build-gates.ps1, scripts/lib/repo-roots.ps1
- deletions-reviewed: agency-os/automation/REGISTER_MONTHLY_SYSTEM_REVIEW_TASK.ps1@41b62a800, agency-os/scripts/align-workstation.ps1@efd6dfa64, agency-os/scripts/ao-close.ps1@44e066db5, agency-os/scripts/ao-resume.ps1@623798ad4, agency-os/scripts/archive-old-reports.ps1@e82f97904, agency-os/scripts/autopilot-alert-loop.ps1@3f7c2ee5d, agency-os/scripts/autopilot-phase1.ps1@6b4498bc8, agency-os/scripts/build-product-bundle.ps1@4e97a00db, agency-os/scripts/check-supabase-memory-monthly.ps1@f321642ae, agency-os/scripts/check-three-way-sync.ps1@72f366a5a, agency-os/scripts/doc-sync-automation.ps1@879967a24, agency-os/scripts/ensure-mariadb-on-user-path.ps1@c1558ef58, agency-os/scripts/generate-integrated-status-report.ps1@57fb03cbb, agency-os/scripts/init-closeout-inbox.ps1@0f5ad6d56, agency-os/scripts/init-onboarding-a10-2-evidence-skeleton.ps1@eb5536edc, agency-os/scripts/install-autopilot-startup-fallback.ps1@b49f77991, agency-os/scripts/machine-environment-audit.ps1@b1cd4e896, agency-os/scripts/monthly-system-review.ps1@5afcfbd63, agency-os/scripts/notify-ops.ps1@1622a5398, agency-os/scripts/preflight-onboarding-a10-2-readiness.ps1@1ce15e368, agency-os/scripts/register-autopilot-phase1.ps1@faaa52414, agency-os/scripts/register-new-governance-doc.ps1@acaf4634c, agency-os/scripts/render-program-timeline-from-schedule.ps1@b668c62e4, agency-os/scripts/run-postgres-mcp.ps1@731cb73f0, agency-os/scripts/secrets-vault.ps1@d2689196c, agency-os/scripts/start-trigger-mcp.ps1@9a834a25d, agency-os/scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1@38d8cc481, agency-os/scripts/system-guard.ps1@25edb9986, agency-os/scripts/system-health-check.ps1@742ba66d1, agency-os/scripts/verify-build-gates.ps1@12738f249, agency-os/scripts/weekly-system-review.ps1@a1bbb02a6, automation/REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1@afa4f6765

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `-NoInteractive` makes the monthly task S4U, which cannot perform the review’s remote SSH check.
  scripts/register-monthly-system-review-task.ps1:63 -> scripts/monthly-system-review.ps1:22
  confidence  -> CONFIRMED
  scenario    -> Register with `-NoInteractive`; when logged off, the monthly Supabase-memory SSH check loses network access and the review is incomplete. [S4U limitation](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks)
  why missed  -> Registration is verified, but the task is never executed under the S4U context.

FINDING 2: Doc-sync can replace content before the actual block when the marker appears in a Markdown example.
  scripts/doc-sync-automation.ps1:78 -> scripts/doc-sync-automation.ps1:102
  confidence  -> CONFIRMED
  scenario    -> A document contains the marker inside a fenced example before its real auto-synced block; `IndexOf` selects the example and the rewrite removes the intervening fence/prose.
  why missed  -> The implementation assumes the marker is unique and line-anchored.

FINDING 3: The canonical doc-sync still writes UTF-8 BOMs under the Windows PowerShell used by the scheduler.
  scripts/register-monthly-system-review-task.ps1:70 -> scripts/doc-sync-automation.ps1:102
  confidence  -> CONFIRMED
  scenario    -> A no-BOM Markdown file is updated by the scheduled `powershell.exe` action; `Set-Content -Encoding UTF8` adds a BOM, preserving the encoding drift this change claims to remove. [PowerShell encoding behavior](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-5.1)
  why missed  -> `repo-text.ps1` is loaded, but this write bypasses its encoding helpers.

FINDING 4: Integrated status generation silently stops producing customer-delivery status.
  scripts/generate-integrated-status-report.ps1:298 -> scripts/generate-integrated-status-report.ps1:298
  confidence  -> CONFIRMED
  scenario    -> The customer-delivery generator exists and AO-CLOSE runs integrated reporting; no customer-delivery report is generated because the invocation was removed.
  why missed  -> The previous path was a no-op, so removing the call was treated as cleanup instead of relocating it.

TOTAL: 4 findings
