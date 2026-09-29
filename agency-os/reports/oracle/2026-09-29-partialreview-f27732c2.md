# codex-oracle review -- 2026-09-29 10:56:20 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/interpret_method_record.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/projects.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/method-interpretation.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/result-page-shows.yaml, Projects/internal/cognitive-engineering-os/tests/unit/test_interpret_method_record.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator review of the result and project pages (2026-09-29). Review against this checklist; each item is a claim to refute:
1. Next steps never recommend a tool the result page's section 3 already draws (methods/registry/result-page-shows.yaml), the tool itself, or a tool the project already ran; such a step is left out as a repair (no paid retry), and those tools are absent from the prompt's available list and the contract's recommended_next.
2. Contract 1.4.0 is additive: up to 5 options, plan rows with phase short|long and options (names of options they serve, unknown names left out), long_horizon month|quarter|year; an old artifact (no phase) still renders as one group.
3. Card 7: options are picked several at once; plan B shows only the chosen options' rows plus rows that name no option; long rows' labels and suggested due dates follow the span the user picks; 憛怠撱箄降 copies a suggestion only into an empty cell; nothing is saved until every visible row has owner, due and target; the saved option is the chosen names.
4. Card 8 opens a tool in a new tab; the carry-over goes through localStorage, is taken once by the run page, moved into its sessionStorage, and ignored after 10 minutes; a tool the project already ran shows a link to that result.
5. Tasks: 4-state status (legacy TaskDone mapped), journal entries (TaskNoted; at least one field; numbers validated), child tasks (parent must exist in the project, inherit its analysis), project history built from the event log, and "rerun now" reuses an open reminder or schedules one due today.
6. The rerun page shows the task cards' latest recorded numbers.
Report only a concrete way one of these claims fails, or something outside the diff that contradicts them. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 111415ms | answer: 597B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/interpret_method_record.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/projects.ts, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_interpret_method_record.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/method-interpretation.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/result-page-shows.yaml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Long-plan labels ignore the selected span unit

  file:line   -> `apps/cognitive-web/components/result/ResultPage.tsx:314`
  confidence  -> CONFIRMED
  scenario    -> User selects `quarter` and there is one long-plan row; the suggested date is four months out, but the row label and saved `when` render `第 4 個月` instead of the required quarter-based label such as `第 2 季`. Selecting `year` similarly produces `第 13 個月` instead of `第 2 年`.
  why missed   -> The date calculation uses `SPAN_MONTHS`, but the displayed label is hard-coded to `個月`.

TOTAL: 1 finding
