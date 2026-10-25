# codex-oracle review -- 2026-10-24 22:15:23 +08:00

- mode: `review`
- scope: -Path scripts/lib/fetch-recency-gate.ps1, scripts/system-health-check.ps1, scripts/git-align-main-aoresume-feature.ps1, scripts/test/fetch-recency-gate.Tests.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: One git fetch ledger: the health gate read git-fetch-last.json, written only by git-align, which AO-RESUME stopped running on 2026-09-23 (it now uses Invoke-SharedWorktreeParity -> Invoke-SafeGitFetch, which writes git-network-last.json). The gate went critical 30 days later while fetches succeeded hourly. Now the gate reads the newest fetch entry of git-network-last.json and git-align writes into that same ledger.
- exit: 0 | elapsed: 363904ms | answer: 1747B
- files-reviewed: scripts/git-align-main-aoresume-feature.ps1, scripts/lib/fetch-recency-gate.ps1, scripts/system-health-check.ps1, scripts/test/fetch-recency-gate.Tests.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A recent fetch can be evicted by push history, causing a false critical failure.
  file:line   -> D:\Work\scripts\lib\git-safe-ops.ps1:105 -> D:\Work\scripts\lib\fetch-recency-gate.ps1:43-46
  confidence  -> CONFIRMED
  scenario    -> A successful fetch 10 days ago is followed by 20 successful pushes. The 20-entry total ring buffer evicts the fetch; the gate finds no fetch and the health check records a critical failure.
  why missed  -> Tests cover only one push over one fetch at D:\Work\scripts\test\fetch-recency-gate.Tests.ps1:30-41.

FINDING 2: Concurrent ledger writers can silently lose a successful fetch.
  file:line   -> D:\Work\scripts\git-align-main-aoresume-feature.ps1:109 -> D:\Work\scripts\lib\git-safe-ops.ps1:85-115,241-248
  confidence  -> CONFIRMED
  scenario    -> A fetch and push read the same old history; the fetch writes first, then the push writes its stale snapshot. The fresh fetch disappears, so the gate later judges an older fetch or reports no fetch.
  why missed  -> The shared writer has no lock or atomic read-modify-write protection, and tests are sequential.

FINDING 3: Existing fetch paths bypass the new ledger.
  file:line   -> D:\Work\scripts\machine-environment-audit.ps1:106-110 -> D:\Work\scripts\lib\git-safe-ops.ps1:273-297 -> D:\Work\scripts\system-health-check.ps1:929-937
  confidence  -> CONFIRMED
  scenario    -> `machine-environment-audit.ps1 -FetchOrigin` successfully fetches from origin, but `Invoke-SafeGitCapture` never writes `git-network-last.json`; after 31 days the health gate still reports the ledger critical/stale.
  why missed  -> The change traced `Invoke-SafeGitFetch` but not every caller that passes `fetch` to the generic capture wrapper.

TOTAL: 3 findings
