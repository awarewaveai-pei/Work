# codex-oracle review -- 2026-09-26 23:57:22 +08:00

- mode: `review`
- scope: whole repo
- target: `886fa5d1e`
- context: Round 5 of WC-P4-01. Round 4's single finding (an empty citations list passed the gate) is fixed: [] is malformed per P-b, flagged inline, gate FAIL. Everything else as in round 4: one _literal for all data, sealed sections, malformed/null/non-list/non-str/empty citations fail.
- exit: 0 | elapsed: 146547ms | answer: 1449B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py, Projects/internal/cognitive-engineering-os/tests/unit/test_report_render.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/capabilities/contracts/artifact.generate_report.capability.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SPEC_QUICKREF.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/research-report.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/cognitive/typed-objects/research-report.fixtures.yaml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Gap citations are collected and appended as sources but never rendered as inline citation markers.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:307
  confidence  -> CONFIRMED
  scenario    -> A gap contains `{"text":"X","needed_evidence":"Y","citations":["source:S1"]}` -> `_collect_citations` includes S1 and the appendix lists `[1]`, but the gap body contains no `[1]`; the report’s own “every appendix citation marker appears in the body” invariant is false.
  why missed   -> The generic collector was hardened for structural fields, but the dedicated gap renderer omits citation handling.

FINDING 2: The report gate accepts a malformed manifest hash as long as the synthesis references the same malformed value.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:338 -> agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/research-report.schema.yaml:36
  confidence  -> CONFIRMED
  scenario    -> `manifest["sha256"]` and `synthesis.manifest_ref["sha256"]` are both `"bad"` with matching entry count -> `manifest_bound` is true and `report_refs_resolvable` can PASS, while the emitted `synthesis_ref.manifest_sha256` violates the required 64-hex schema pattern.
  why missed   -> The binding check verifies equality and count but never validates the manifest digest format.

TOTAL: 2 findings
