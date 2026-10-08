# codex-oracle review -- 2026-10-08 13:26:35 +08:00

- mode: `review`
- scope: whole repo
- target: `1f72ef7a2`
- context: Claude finished 6 must-fix items on Codex-written TEACH/EXPRESS/ops code: restore drill (-U, --network none, real Docker test, readiness timeout); queue checks allow only 4 command shapes (command_shape_error); one shared scanner refuses AI score/rank text (6 分, 3/5, score/rank/grade/points, 等第, 及格) but allows lesson text like 5 分鐘 and dates; case ownership check in the generic blocks/docs.py save (someone else's case and a missing case -> same 404); a deleted teach.completion saves the course as declined (ON_DELETE hook) and is not recreated; AI sentences compared whitespace-normalised against every AI sentence in every version of the case's drafts on create and update. Report only defects that break a card line, lose data/privacy, or break CI/the main path.
- exit: 0 | elapsed: 691978ms | answer: 1822B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/docs.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/teach.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/__init__.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/express.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/teach.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/lessons/__init__.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/TeachPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/TeachPage.tsx, Projects/internal/cognitive-engineering-os/ops/cognitive-db/restore-cognitive-db.sh, Projects/internal/cognitive-engineering-os/tests/unit/test_block_express.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_teach.py, Projects/internal/cognitive-engineering-os/tests/unit/test_codex_queue.py, Projects/internal/cognitive-engineering-os/tests/unit/test_cognitive_db_ops.py, agency-os/reports/review-debt.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The queue accepts an `affected_tests` check that runs no tests
  file:57   -> Projects/internal/cognitive-engineering-os/scripts/affected_tests.py:310
  confidence  -> CONFIRMED
  scenario    -> `python scripts/affected_tests.py --base HEAD~1` passes validation, only prints test names, exits 0, and the card is marked passed.
  why missed  -> Tests cover only `--run` forms; the parser never requires `--run`.

FINDING 2: The scanner rejects valid two-part dates as scores
  file:44   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/lessons/__init__.py:53
  confidence  -> CONFIRMED
  scenario    -> AI text `課程在 10/08 開始` matches the `number/number` score regex and is refused as `TEACH_AI_OUTPUT_REFUSED`.
  why missed  -> The test covers only three-part dates such as `2026/10/08`.

FINDING 3: The new case-ownership guard is bypassed by idempotent updates
  file:106   -> Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/docs.py:107
  confidence  -> CONFIRMED
  scenario    -> A legacy person record references another person’s case; PUTting identical content returns from the unchanged-content fast path with 200, without reaching the new ownership check or returning 404.
  why missed  -> Ownership validation was added below the existing early return; tests cover only new records.

FINDING 4: Queue command allowlisting does not constrain the working directory
  file:167   -> scripts/codex-continue.ps1:235
  confidence  -> CONFIRMED
  scenario    -> A card uses `cwd: "..\\cos-pg"` with an otherwise allowed `npx vitest run evil.test.ts`; validation accepts the string and the driver executes outside the Codex worktree.
  why missed  -> Validation checks only that `cwd` is a string; the driver joins it without containment validation.

TOTAL: 4 findings
