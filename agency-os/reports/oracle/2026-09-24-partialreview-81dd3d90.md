# codex-oracle review -- 2026-09-24 12:31:49 +08:00

- mode: `review`
- scope: -Path scripts/check-smoke-tests.ps1, scripts/lib/repair-health-probes.ps1, tests/repair-health-probes.test.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Daily smoke (check-smoke-tests.ps1 Check 2) only read /api/ops/repairs/health ok, which means configured; the Auto-Repair SSH backup probe was ssh_error for 23 days unseen. Change: new lib Get-RepairProbeFindings over backup_script_probe/auto_reboot {sg,eu} (ok/skipped pass; eu unconfigured passes only when eu_backup_required is not true; absent object/key = finding), smoke WARNs on findings, repair_center joins criticalChecks so a skip becomes a blind spot. Endpoint fields: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/health/route.ts. Script runs under Set-StrictMode -Version Latest. Also verify: does this change depend on something NOT visible in this diff? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 225076ms | answer: 30B
- files-reviewed: scripts/check-smoke-tests.ps1, scripts/lib/repair-health-probes.ps1, tests/repair-health-probes.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS

TOTAL: 0 findings
