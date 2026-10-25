# codex-oracle review -- 2026-10-23 14:48:36 +08:00

- mode: `review`
- scope: -Path scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1, scripts/refresh-cf-origin-ips.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Re-review of 2 fixes. (1) smoke-status-digest Test-ReportShape: an artifact carrying measured<=0 is BLIND, outranking any legacy verdict field (ci verdictLabel=PASS with every workflow pending was read as PASS); test case 4b. (2) refresh-cf-origin-ips: ssh now through Invoke-SshWithDeadline (180s total, ServerAlive) instead of Start-Process -Wait with only ConnectTimeout. Report only real defects.
- exit: 0 | elapsed: 264916ms | answer: 1098B
- files-reviewed: scripts/lib/smoke-status-digest.ps1, scripts/refresh-cf-origin-ips.ps1, tests/smoke-status-digest.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Auto-reboot health is BLIND on every real run because the producer still emits an unzoned timestamp.
  scripts/lib/smoke-status-digest.ps1:310 -> scripts/check-vps-auto-reboot-health.ps1:289
  confidence  -> CONFIRMED
  scenario    -> Producer writes `2026-10-23 06:00:00` UTC; ISO parser treats it as local UTC+8, shifts it eight hours backward, and marks the fresh report stale/BLIND.
  why missed  -> The regression fixture was changed to ISO-with-Z, but the producer was not changed.

FINDING 2: Migrating cf-iprefresh to the detector contract makes the detector audit fail because its legacy allowlist entry was not removed.
  scripts/refresh-cf-origin-ips.ps1:61 -> scripts/detector-contract-legacy.txt:7; scripts/audit-detector-contract.ps1:49
  confidence  -> CONFIRMED
  scenario    -> A successful refresh writes a compliant artifact; the audit sees the still-listed filename as compliant-but-legacy, records it stale, and exits 1.
  why missed  -> The writer migration was reviewed without updating the allowlist that explicitly must shrink after migration.

TOTAL: 2 findings
