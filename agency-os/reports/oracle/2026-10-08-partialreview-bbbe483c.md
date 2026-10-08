# codex-oracle review -- 2026-10-08 09:34:52 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/tests/__init__.py, Projects/internal/cognitive-engineering-os/tests/unit/test_00_full_suite_guard.py, Projects/internal/cognitive-engineering-os/scripts/test-gate.sh, Projects/internal/cognitive-engineering-os/README.md, Projects/internal/cognitive-engineering-os/tests/conftest.py, Projects/internal/cognitive-engineering-os/scripts/test-phase5-local.ps1, Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md, agency-os/AGENTS.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2. Round-1 findings and their fixes: (1) pytest --ignore bypassed the sentinel and (2) a single-file pytest of the sentinel was blocked -> the pytest check moved to tests/conftest.py (a directory among pytest's args = whole tree); (3) local entry points -> test-phase5-local.ps1 stops before its full-suite step without COS_FULL_SUITE=1, and RESEARCH_LINES_MASTER_PLAN.md's ?祆?頝?line now names affected_tests.py. Only that one line of the plan is this change. COS full-suite guard (plan rule 11): block whole-tree unittest discovery / directory-wide pytest unless COS_FULL_SUITE=1. Look for: a whole-tree run that slips past; a targeted run wrongly blocked (named module, -p narrowed discover, single-file pytest, affected_tests.py --run, test-gate.sh module list, eval_gate.py); CI test-gate.sh --all path broken; os._exit side effects. AGENTS.md: only the REALTEST row is this change (the Last-synced stamp hunk is another session's). Also verify: does this change depend on something NOT visible in this diff -- a config value, retention/timeout setting, schema assumption, cron schedule, or upstream default defined elsewhere in the repo? If it contradicts the change (e.g. makes it silently unreachable / dead code), report that as a finding even if it wasn't otherwise in scope. Reminder: if you cannot support a real finding after checking the above, say so directly and return no findings. Do not invent a weak or speculative finding just to appear useful -- that is worse than reporting nothing.
- exit: 0 | elapsed: 472606ms | answer: 1364B
- files-reviewed: Projects/internal/cognitive-engineering-os/README.md, Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md, Projects/internal/cognitive-engineering-os/scripts/test-gate.sh, Projects/internal/cognitive-engineering-os/scripts/test-phase5-local.ps1, Projects/internal/cognitive-engineering-os/tests/__init__.py, agency-os/AGENTS.md, Projects/internal/cognitive-engineering-os/tests/conftest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_00_full_suite_guard.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Bare `pytest` bypasses the full-suite guard.

  `Projects/internal/cognitive-engineering-os/tests/conftest.py:19-21` -> `Projects/internal/cognitive-engineering-os/tests/conftest.py:1-4`

  confidence  -> CONFIRMED

  scenario    -> From the product root, run `pytest` with `COS_FULL_SUITE` unset. Bare pytest supplies no positional directory in `config.args`, so the condition is false and the full test tree runs despite the documented claim that bare pytest is blocked.

  why missed  -> The implementation checks only explicit directory arguments; it never treats empty arguments as the current directory.

FINDING 2: `affected_tests.py --run` can report green without testing the new pytest guard.

  `Projects/internal/cognitive-engineering-os/scripts/affected_tests.py:291-313` -> `Projects/internal/cognitive-engineering-os/tests/conftest.py:16-21`

  confidence  -> CONFIRMED

  scenario    -> Change only `tests/conftest.py` so `pytest_collection_modifyitems` becomes a no-op, then run `python scripts/affected_tests.py --run`. The selector runs only named `unittest` modules and never invokes pytest; it reports no affected unit module and exits 0 while directory-wide pytest is now unguarded.

  why missed  -> The selector models static unittest dependencies and does not model pytest’s automatic `conftest.py` loading.

TOTAL: 2 findings
