# codex-oracle review -- 2026-09-23 23:18:31 +08:00

- mode: `review`
- scope: -Path scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 3 of smoke-status-digest.ps1 (landing). Invariant analysis written before this round, now stated in the file header: PASS/WARN/FAIL are emitted ONLY for a producer value the file explicitly maps (Get-VerdictOrBlind); any unmapped value, missing producer key (Test-ReportShape), stale or unparsable timestamp, or parser exception is BLIND; there is no WARN fallback anywhere. Round-2 findings closed by that rule: (F1) every one of the seven verdict switches now goes through Get-VerdictOrBlind (unmapped -> BLIND naming the value); (F2) probeOk joined the CI required keys. Tests 17 cases + mutation proof, all green; real run: 6 real blockers, no blanks. Please confirm the invariant holds across all ten parsers and report only supportable findings.
- exit: 0 | elapsed: 105856ms | answer: 1070B
- files-reviewed: scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Cloudflare’s unmapped `Overall` values still fall back to WARN.

  `scripts/lib/smoke-status-digest.ps1:492` -> `scripts/lib/smoke-status-digest.ps1:492`  
  confidence  -> CONFIRMED  
  scenario    -> A fresh `cf-security-LATEST.md` contains `**Overall: ERROR**` -> `Get-CfSecurityEntry` emits WARN instead of BLIND, violating the stated unmapped-value invariant.  
  why missed  -> The round-3 audit focused on the seven switch-based parsers; this parser uses direct conditionals and retains a catch-all WARN return.

FINDING 2: CI accepts a string `"false"` for `probeOk` as successful probing.

  `scripts/lib/smoke-status-digest.ps1:196` -> `scripts/lib/smoke-status-digest.ps1:196`  
  confidence  -> CONFIRMED  
  scenario    -> JSON contains `probeOk: "false"`, `verdictLabel: "PASS"`, and fresh timestamps -> PowerShell treats the non-empty string as truthy, skips the blindness branch, and emits PASS despite the failed probe.  
  why missed  -> `Test-ReportShape` checks only property presence, not the producer field’s type.

TOTAL: 2 findings
