# codex-oracle review -- 2026-10-08 13:35:32 +08:00

- mode: `review`
- scope: whole repo
- target: `b4e03cb7a`
- context: Card 60 FACILITATE content (started by Codex, finished by Claude): scripts loader Ruleset facilitate.scripts with HISTORY fingerprint, dont-list.yaml (FACIL_DONTS, the card's four items), a subject with no stop signal in any step is unavailable (report 「沒有停止訊號」), draft scripts can never lead, importer apps/cli/import_scripts.py --csv --map validates every row before writing any file. Report only defects that break a line of docs/platform/step34-cards/FACILITATE.card.txt, lose data/privacy, or break CI/the main path.
- exit: 0 | elapsed: 534590ms | answer: 2126B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/import_scripts.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/facilitate.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/HISTORY.json, Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/__init__.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/dont-list.yaml, Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/scripts/framing.problem_statement.yaml, Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/scripts/learning.after_action_review.yaml, Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/scripts/systems.iceberg_model.yaml, Projects/internal/cognitive-engineering-os/docs/platform/STEP34_CHECKLIST.md, Projects/internal/cognitive-engineering-os/tests/fixtures/art_tools_sample.csv, Projects/internal/cognitive-engineering-os/tests/unit/test_facilitate_content.py, agency-os/reports/review-debt.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Importing a new draft into the default directory immediately invalidates the FACILITATE ruleset fingerprint.
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/import_scripts.py:87,114` -> `Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/facilitate.py:8` -> `Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/__init__.py:165`
  confidence  -> CONFIRMED
  scenario    -> Run the importer with a new valid subject and no `--output-dir` -> it writes a new YAML beside the managed scripts, but `HISTORY.json:3` remains unchanged; the next loader startup raises `RULESET_CHANGED_WITHOUT_VERSION`, blocking every FACILITATE script.
  why missed  -> The importer test writes to a temporary directory and never exercises the default managed directory or a subsequent loader startup.

FINDING 2: A CSV row with a missing mapped cell crashes instead of being rejected as an invalid row.
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/import_scripts.py:35,56`
  confidence  -> CONFIRMED
  scenario    -> A row ends after the prompt column, so `DictReader` supplies `None` for `stop_signals` -> `_split_signals()` calls `.strip()` on `None`, raising `AttributeError` and terminating the CLI without a validation error.
  why missed  -> The fixture tests an explicitly empty stop-signal cell, not a structurally incomplete CSV row.

FINDING 3: The loader accepts reviewed scripts whose escalation path is not GOVERN.
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/__init__.py:130-133` -> `Projects/internal/cognitive-engineering-os/ai_lego/platform/scripts/__init__.py:189-191`
  confidence  -> CONFIRMED
  scenario    -> A reviewed script has `escalation.who: OTHER` and a non-empty arbitrary `how`, with its version/history updated -> validation passes and `usable_for_leading()` returns it, so it can lead without the required GOVERN escalation.
  why missed  -> All seed scripts use `GOVERN`; tests verify only those seed values and do not mutate the escalation fields.

TOTAL: 3 findings
