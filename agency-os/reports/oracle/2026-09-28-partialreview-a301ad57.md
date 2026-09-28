# codex-oracle review -- 2026-09-28 23:35:35 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Test-only follow-up after round 9 (no findings): test_the_budget_lock_is_not_held_while_the_model_answers_but_the_run_is_reserved used speed bounds (wait 5 s, acquire timeout 2 s, join 10 s) and failed once in a loaded full run; it now follows tests/unit/thread_testkit.py (HANG_GUARD_S + join_all; the lock is probed non-blocking while the model call is in flight, when the metered provider holds it only around the check and the record). Review only whether this test still proves what its docstring claims and cannot hang or pass vacuously. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 75086ms | answer: 690B
- files-reviewed: Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An assertion failure before `release.set()` leaves the worker blocked for the full 300-second guard.

  file:line   -> `Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py:284,292,296-298`
  confidence  -> CONFIRMED
  scenario    -> The worker reaches `release.wait(HANG_GUARD_S)`, then the reservation assertion at line 296 fails; execution skips lines 297-298, so the worker remains blocked for 300 seconds and teardown can clean up its temp directory while it is still running.
  why missed  -> The new `join_all` call only handles the success path; there is no `try/finally` that releases the worker when an earlier assertion fails.

TOTAL: 1 findings
