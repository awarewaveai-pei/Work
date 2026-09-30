# codex-oracle review -- 2026-09-23 23:08:14 +08:00

- mode: `review`
- scope: -Path scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1, scripts/check-smoke-tests.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 2 of smoke-status-digest.ps1. Round-1 findings and fixes: (F1) site-watch now checks freshness BEFORE the NOT_DEPLOYED SKIP shortcut, so a stale NOT_DEPLOYED report is BLIND; (F2) nightly critical_gate must be PASS or FAIL, anything else is BLIND; (F3) new Test-ReportShape: every JSON parser first requires the keys its producer always writes (ci: generatedAtUtc/verdictLabel/findings/workflows; backup: generatedAt/overall/ks_aw_01; auto-reboot: generated_utc/overall_user/ks_aw_01; clickhouse: generatedAtUtc/verdictLabel/findings; capacity: generatedAt/overall/verdicts/blind_spots; site-watch: generatedAt/overall/blind_spots; staging: generated_utc/overall/blind_spots/orphan_total) and returns BLIND naming the missing key otherwise. Tests: Cases 13-15 added (15 cases + mutation proof, all green); real run against D:\Work gives 6 real blockers and no blank lines. Please verify the three fixes and hunt for regressions: a producer whose real report legitimately omits one of the required keys on some path (e.g. capacity when ssh.exe is missing, site-watch NOT_DEPLOYED written by the watchdog without probes), StrictMode property access on the new checks, and whether the required-key lists match what the producers in scripts/check-*.ps1 actually write.
- exit: 0 | elapsed: 80525ms | answer: 1102B
- files-reviewed: scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1, scripts/check-smoke-tests.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Unknown CI verdicts are downgraded to WARN instead of BLIND

  file:line   -> `scripts/lib/smoke-status-digest.ps1:204-205`
  confidence  -> CONFIRMED
  scenario    -> A fresh, structurally valid `ci-LATEST.json` contains `verdictLabel: "DEGRADED"` after a producer schema change; the parser maps it to `WARN`, producing a normal warning instead of reporting that CI’s state is unrecognised/BLIND.
  why missed  -> The new fail-closed rule was applied to nightly `critical_gate`, but the CI switch still uses `default { "WARN" }`.

FINDING 2: CI can report PASS when its probe result is missing

  file:line   -> `scripts/lib/smoke-status-digest.ps1:170-171, 183-184, 203-205`
  confidence  -> CONFIRMED
  scenario    -> A fresh JSON report contains `generatedAtUtc`, `verdictLabel: "PASS"`, `findings`, and `workflows`, but omits `probeOk`; the parser skips the `probeOk=false` branch and returns PASS, even though it cannot establish whether probing succeeded.
  why missed  -> `probeOk` is consumed as an evidentiary field but is absent from CI’s required-key list.

TOTAL: 2 findings
