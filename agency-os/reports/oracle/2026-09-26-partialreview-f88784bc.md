# codex-oracle review -- 2026-09-26 23:46:11 +08:00

- mode: `review`
- scope: whole repo
- target: `6e053ada5`
- context: Round 3 of WC-P4-01 (pure research report renderer). Rounds 1-2 found data values (source metadata, run ids, non-list citations) reaching markdown with line breaks or invisibly. Now closed as a class at one sink: sections are (heading, lines); _seal_section flattens the heading and raises REPORT_LINE_BREAK_FROM_DATA if any body line contains CR/LF; a test poisons every input string with a blank line + '## INJECTED' + a table row. Non-list citations are flagged inline and fail the gate. Please look for any remaining way data can alter markdown structure or make the gate PASS on an unresolvable citation.
- exit: 0 | elapsed: 121673ms | answer: 1869B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py, Projects/internal/cognitive-engineering-os/tests/unit/test_report_render.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/capabilities/contracts/artifact.generate_report.capability.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SPEC_QUICKREF.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/research-report.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/cognitive/typed-objects/research-report.fixtures.yaml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Null `citations` values bypass the resolvability gate  
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:65`  
  confidence  -> CONFIRMED  
  scenario    -> A synthesis object has `{"citations": null}`; `_collect_citations` ignores it, so with otherwise valid inputs `invalid_refs` remains empty and `report_refs_resolvable` can PASS despite malformed citation data.  
  why missed   -> Tests cover strings and non-list values, but not `None`; the explicit `citations is not None` exception contradicts the stated fail-closed behavior.

FINDING 2: Markdown syntax remains injectable through flattened text and citation IDs  
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:44`  
  confidence  -> CONFIRMED  
  scenario    -> A claim text contains `[attacker](https://evil.example)`; `_flatten` removes only line breaks, so the exported report renders an attacker-controlled link. An invalid citation ID such as `x](https://evil.example)` similarly alters the `[INVALID:...]` markup.  
  why missed   -> The tests verify heading/newline injection only; flattening prevents new lines but does not escape Markdown control syntax.

FINDING 3: Pre-escaped pipes can break structural table cells  
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/modules/research/report_render.py:102`  
  confidence  -> CONFIRMED  
  scenario    -> A structural field or run output contains `\| injected |`; `_escape_cell` appends another escape only to the pipe, producing an even number of backslashes before the first pipe, so Markdown can interpret that pipe as a column delimiter and alter the table shape.  
  why missed   -> The test uses plain `a|b`; it does not test a value already containing a backslash before the pipe.

TOTAL: 3 findings
