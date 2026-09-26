# codex-oracle review -- 2026-09-26 23:52:13 +08:00

- mode: `review`
- scope: whole repo
- target: `a45be9ac0`
- context: Round 4 of WC-P4-01 (pure research report renderer). Rounds 1-3 each found data reaching markdown with structure (line breaks, links, raw HTML, pre-escaped pipes) or citations the gate skipped (non-list, null). Now one rule: every data value passes through _literal (line breaks -> space, then every ASCII punctuation char including backslash is backslash-escaped); sections are (heading, lines) sealed by _seal_section which refuses CR/LF in body lines; citation-marks column in structural tables is the module's own syntax built from _literal'd ids; null/non-list/non-str citations are malformed and fail the gate. Look for any remaining path where data changes markdown structure or the gate passes on an unresolvable or malformed citation.
- exit: 0 | elapsed: 86986ms | answer: 785B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py, Projects/internal/cognitive-engineering-os/tests/unit/test_report_render.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/capabilities/contracts/artifact.generate_report.capability.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SPEC_QUICKREF.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/research-report.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/cognitive/typed-objects/research-report.fixtures.yaml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Empty `citations` lists are accepted as valid, despite the renderer’s stated requirement that citation fields be non-empty lists.
  `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:70-78` -> `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:253-272`
  confidence  -> CONFIRMED
  scenario    -> A synthesis claim contains `"citations": []`, with valid manifest binding and an upstream `citation_integrity: PASS` result -> `_collect_citations` records no error, `invalid_refs` remains empty, and `report_refs_resolvable` incorrectly returns `PASS`.
  why missed  -> Tests cover null, non-list, and non-string citation values, but no test exercises an empty citation list.

Final line: TOTAL: 1 finding
