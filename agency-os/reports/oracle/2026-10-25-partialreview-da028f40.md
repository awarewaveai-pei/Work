# codex-oracle review -- 2026-10-25 12:39:58 +08:00

- mode: `review`
- scope: -Path scripts/check-ci-health.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: check-ci-health: a red run whose jobs ran 0 steps (GitHub refused to start: billing) is reported as not_started with GitHub's failure annotation; verdict unchanged (still FAIL when entrenched). PS 5.1 target.
- exit: 0 | elapsed: 107436ms | answer: 2084B
- files-reviewed: scripts/check-ci-health.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Zero-step cancellations are incorrectly diagnosed as account problems
  file:line   -> scripts/check-ci-health.ps1:295
  confidence  -> CONFIRMED
  scenario    -> A queued next-admin run is cancelled by a newer push, which remains pending (`.github/workflows/next-admin-typecheck.yml:33` enables cancellation). The cancelled run remains the latest concluded run. With empty steps and no failure annotation, line 182 returns a nonempty fallback, so the report tells the operator to fix the GitHub account despite no account failure. GitHub supports cancelling [queued runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/cancel-a-workflow-run).
  why missed  -> The billing example was generalized to every unhealthy conclusion with zero steps; neither cancellation nor annotation content constrains the diagnosis.

FINDING 2: An annotation on any job after the first is silently missed
  file:line   -> scripts/check-ci-health.ps1:171
  confidence  -> CONFIRMED
  scenario    -> GitHub returns two zero-step jobs: the first is skipped without annotations; the second failed to start because of billing and carries the failure annotation. The function queries only the first job and reports “no annotation,” omitting GitHub’s available explanation.
  why missed  -> The implementation checks all jobs for steps but assumes the first job carries the failure reason.

FINDING 3: Historical execution failures are falsely reported as runs that never started
  file:line   -> scripts/check-ci-health.ps1:295
  confidence  -> CONFIRMED
  scenario    -> Two previous runs executed tests and failed over eight days; today’s run is blocked by billing. Lines 265–268 count all three unhealthy runs, but only today’s run receives the zero-step check. The report consequently claims three consecutive runs never started over eight days, although two executed.
  why missed  -> The existing failure streak was reused as a non-start streak. Keeping the verdict unchanged is correct; reinterpreting the historical count and duration is not.

TOTAL: 3 findings
