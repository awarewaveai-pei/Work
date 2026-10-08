# codex-oracle review -- 2026-10-08 09:21:11 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/tests/__init__.py, Projects/internal/cognitive-engineering-os/tests/unit/test_00_full_suite_guard.py, Projects/internal/cognitive-engineering-os/scripts/test-gate.sh, Projects/internal/cognitive-engineering-os/README.md, agency-os/AGENTS.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: COS full-suite guard (plan rule 11): block whole-tree unittest discovery / directory-wide pytest unless COS_FULL_SUITE=1. Look for: a whole-tree run that slips past; a targeted run wrongly blocked (named module, -p narrowed discover, single-file pytest, affected_tests.py --run, test-gate.sh module list, eval_gate.py); CI test-gate.sh --all path broken; os._exit side effects. AGENTS.md: only the REALTEST row is this change (the Last-synced stamp hunk is another session's). Also verify: does this change depend on something NOT visible in this diff -- a config value, retention/timeout setting, schema assumption, cron schedule, or upstream default defined elsewhere in the repo? If it contradicts the change (e.g. makes it silently unreachable / dead code), report that as a finding even if it wasn't otherwise in scope. Reminder: if you cannot support a real finding after checking the above, say so directly and return no findings. Do not invent a weak or speculative finding just to appear useful -- that is worse than reporting nothing.
- exit: 0 | elapsed: 226414ms | answer: 1404B
- files-reviewed: Projects/internal/cognitive-engineering-os/README.md, Projects/internal/cognitive-engineering-os/scripts/test-gate.sh, Projects/internal/cognitive-engineering-os/tests/__init__.py, agency-os/AGENTS.md, Projects/internal/cognitive-engineering-os/tests/unit/test_00_full_suite_guard.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Directory-wide pytest can bypass the guard by excluding its sentinel.
  tests/__init__.py:63   -> tests/unit/test_00_full_suite_guard.py:14
  confidence  -> CONFIRMED
  scenario    -> With `COS_FULL_SUITE` unset, `python -m pytest tests --ignore=tests/unit/test_00_full_suite_guard.py` skips the only pytest check and runs the remaining tree.
  why missed  -> The pytest guard exists only in the sentinel module.

FINDING 2: Running the sentinel as a single pytest file is incorrectly blocked.
  tests/unit/test_00_full_suite_guard.py:14   -> tests/__init__.py:43-56
  confidence  -> CONFIRMED
  scenario    -> `python -m pytest tests/unit/test_00_full_suite_guard.py` detects `_pytest` during collection and exits 2 before either guard test runs.
  why missed  -> The implementation does not distinguish single-file collection from directory collection.

FINDING 3: Existing local full-suite entrypoints fail without the new opt-in variable.
  scripts/test-phase5-local.ps1:32; docs/RESEARCH_LINES_MASTER_PLAN.md:334   -> tests/__init__.py:50-60
  confidence  -> CONFIRMED
  scenario    -> Running either documented local command with `COS_FULL_SUITE` unset causes discovery to exit 2, so `test-phase5-local.ps1` reports failure before smoke testing.
  why missed  -> The change updated README and CI gating but left these existing local callers without `COS_FULL_SUITE=1`.

TOTAL: 3 findings
