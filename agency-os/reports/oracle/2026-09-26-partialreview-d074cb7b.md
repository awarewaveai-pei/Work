# codex-oracle review -- 2026-09-26 23:37:27 +08:00

- mode: `review`
- scope: whole repo
- target: `c9021acc7`
- context: WC-P4-01: pure research report renderer. Every citation id anywhere in the synthesis must resolve to a manifest entry with a 64-hex sha256; the synthesis' own citation_integrity must be PASS; the manifest must match manifest_ref (sha256+count); else gate report_refs_resolvable FAILs (stricter than NA report.ts which rewrites to [?]). Run verdicts derived from GET run-result journal status like main.py:760-763. Markdown carries line sections as tables, sources appendix and a problems section; inline text flattened against heading injection.
- exit: 0 | elapsed: 250311ms | answer: 494B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py, Projects/internal/cognitive-engineering-os/tests/unit/test_report_render.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/capabilities/contracts/artifact.generate_report.capability.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SPEC_QUICKREF.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/research-report.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/cognitive/typed-objects/research-report.fixtures.yaml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Source metadata is emitted without newline flattening, allowing Markdown heading injection.
  report_render.py:150 -> report_render.py:235
  confidence  -> CONFIRMED
  scenario    -> A manifest title contains `Trusted\n\n## Forged`; `_appendix_line` inserts it unchanged, and the final markdown contains a forged `## Forged` section.
  why missed  -> The heading-injection test covers claim text, but not title, URL, or fetched-at metadata rendered by the appendix.

TOTAL: 1 finding
