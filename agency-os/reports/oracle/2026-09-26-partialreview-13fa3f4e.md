# codex-oracle review -- 2026-09-26 23:40:44 +08:00

- mode: `review`
- scope: whole repo
- target: `800b77f69`
- context: Round 2 of WC-P4-01 (pure research report renderer). Round 1 found that source title/url/fetched_at were not newline-flattened in the appendix (markdown heading injection); now every inline value (claims, headings, appendix metadata, problem lists, INVALID marks) goes through _flatten. Every citation id anywhere in the synthesis must resolve to a manifest entry with a 64-hex sha256; synthesis citation_integrity must be PASS; manifest must match manifest_ref (sha256+count); else report_refs_resolvable FAILs. Run verdicts derived from GET run-result journal status like main.py:760-763.
- exit: 0 | elapsed: 95320ms | answer: 1565B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py, Projects/internal/cognitive-engineering-os/tests/unit/test_report_render.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/capabilities/contracts/artifact.generate_report.capability.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SPEC_QUICKREF.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/research-report.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/cognitive/typed-objects/research-report.fixtures.yaml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Malformed non-list citations disappear from the rendered report instead of being marked invalid

  `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:87` -> `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:104`

  confidence  -> CONFIRMED

  scenario    -> A synthesis summary has `"citations": "source:S1"` instead of a list. `_collect_citations` records the value as invalid and the gate fails, but `_citation_marks` iterates no markers for non-lists, so the summary contains no `[INVALID:source:S1]` marker. The invalid citation is silently absent from the report body.

  why missed  -> The tests verify that character-by-character markers are absent, but do not verify that the malformed citation is visibly flagged inline.

FINDING 2: Run identifiers can inject arbitrary Markdown headings

  `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:181` -> `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:187`

  confidence  -> CONFIRMED

  scenario    -> A successful run has `run_id = "run-1\n\n## Forged"`. `_run_section` inserts `recipe_id` and `run_id` directly into its section heading, so the exported Markdown contains a forged `## Forged` heading. Claims and source metadata are flattened, but these heading inputs are not.

  why missed  -> The newline-injection tests cover claim text, source metadata, and problem-list values, but omit run identifiers used in section headings.

TOTAL: 2 findings
