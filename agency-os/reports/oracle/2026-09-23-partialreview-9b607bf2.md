# codex-oracle review -- 2026-09-23 22:59:53 +08:00

- mode: `review`
- scope: -Path scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1, scripts/check-smoke-tests.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: smoke-status-digest landing review. scripts/lib/smoke-status-digest.ps1 reads the ten sibling *-LATEST reports into smoke-LATEST.json blockers[] (authored by a session that hit its usage limit after folding critic M1-M4: per-source freshness, guaranteed blocker line for non-PASS, per-source try/catch, fail-BLIND parsers). Three bugs found on the first real run and fixed here: (1) Test-TimestampFresh used .Value on a [Nullable[DateTime]] parameter -- PS 5.1 unwraps it, StrictMode threw in every parser; (2) ConvertFrom-UnzonedUtcSafe used AssumeUniversal without AdjustToUniversal so the result was local-kind and auto-reboot read BLIND on every run; (3) an empty [string[]] in a hashtable came back as  and @() added one blank blocker per PASS source, so blockers.Count was never 0. Test fixtures gained timestamps + schemaVersion and Cases 10-12 (stale=BLIND, one broken report isolated, empty-detail FAIL still a blocker). check-smoke-tests.ps1 consumes it (checks 9/10, blockers force WARN). Please attack: remaining PS 5.1 / StrictMode traps in the parsers, timestamp handling across DST or a machine whose local zone differs, any path where a PASS could be produced from unparsable input, and whether check-smoke-tests can still report PASS when a sibling is FAIL.
- exit: 0 | elapsed: 88604ms | answer: 1681B
- files-reviewed: scripts/lib/smoke-status-digest.ps1, tests/smoke-status-digest.test.ps1, scripts/check-smoke-tests.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Stale `NOT_DEPLOYED` site-watch reports bypass freshness and remain silently SKIP

  `scripts/lib/smoke-status-digest.ps1:323` -> `Get-SiteWatchEntry` returns `SKIP` before parsing/checking `generatedAt`.

  confidence  -> CONFIRMED

  scenario    -> A `site-watch-LATEST.json` containing `overall: "NOT_DEPLOYED"` and a timestamp older than 2 hours remains `SKIP` with no blocker, so smoke reports no evidence of the stale report.

  why missed  -> The test covers the quiet-state mapping but not a stale quiet-state report.

FINDING 2: Nightly health accepts an unknown `critical_gate` value as PASS

  `scripts/lib/smoke-status-digest.ps1:220` -> only `"FAIL"` is treated specially; with `score >= 100`, every other value reaches PASS at line 229.

  confidence  -> CONFIRMED

  scenario    -> A fresh schema-version-1 report has `critical_gate: "BROKEN"` and `score: 100`; the digest returns `PASS` despite not recognizing the gate state.

  why missed  -> The schema check validates field presence and score shape, but not the allowed `critical_gate` enum.

FINDING 3: Structurally incomplete sibling reports can produce PASS

  `scripts/lib/smoke-status-digest.ps1:250` -> backup health maps `overall: "PASS"` directly to PASS after checking only the timestamp.

  confidence  -> CONFIRMED

  scenario    -> A valid JSON file containing only `generatedAt` and `overall: "PASS"` is fresh, but has no producer details or schema fields; the digest still returns PASS and adds no blocker.

  why missed  -> The tests use complete producer-shaped fixtures and do not exercise valid-but-incomplete reports or schema validation for the sibling parsers.

TOTAL: 3 findings
