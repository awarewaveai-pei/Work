# codex-oracle review -- 2026-09-23 22:35:20 +08:00

- mode: `review`
- scope: -Path scripts/lib/git-safe-ops.ps1, scripts/ao-resume.ps1, mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, tests/ao-resume-shared-worktree.test.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 2 of the AO-RESUME shared-worktree fix. Round-1 findings and what changed: (F1 bounded ledger) MaxEntries default raised 500->5000; eviction after 5000 newer sessions re-triggers at most once and the triggered parity step is non-mutating (fetch + merge --ff-only), documented in the Add- comment. (F2 non-atomic check-then-record) new Register-AoResumeSession does check+record under one named mutex AwareWave.AoResume.SeenSessions with a 2000 ms wait; timeout or exception => $false (no trigger). (F3 failed write re-triggers forever) Add- now returns $true only when the append succeeded; Register returns that, so an unwritable ledger means no auto-trigger rather than a re-trigger loop. Tests L9-L11 cover register-twice, unwritable ledger, and a mutex held by ANOTHER process (Start-Process holder). Please verify these three fixes and hunt for what they broke: mutex name scoping across Claude Code + Codex hooks on one machine, AbandonedMutexException handling, StrictMode, the explicit-AO-RESUME path still registering the id, and whether Invoke-SharedWorktreeParity can still move uncommitted work in any branch.
- exit: 0 | elapsed: 88620ms | answer: 747B
- files-reviewed: mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1, scripts/ao-resume.ps1, scripts/lib/git-safe-ops.ps1, tests/ao-resume-shared-worktree.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `-AllowUnexpectedDirty` no longer selects the explicit git-align path
  scripts/ao-resume.ps1:420   -> scripts/ao-resume.ps1:421
  confidence  -> CONFIRMED
  scenario    -> Operator invokes `ao-resume.ps1 -FullMainlineParity -AllowUnexpectedDirty` with a dirty worktree; `$useGitAlign` remains false because it checks only `FullMainlineAllowStash`, `includeFeature`, and `FullMainlineAllowResetAheadOfOrigin`, so the script runs shared-worktree parity and reports `ff-refused` instead of honoring the explicit dirty-tree override.
  why missed   -> The prior code forwarded `AllowUnexpectedDirty` into git-align behavior, but the new branch-selection condition only retained three of the explicit override conditions.

TOTAL: 1 findings
