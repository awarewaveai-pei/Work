# codex-oracle review -- 2026-10-14 19:35:05 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/evolution  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3 of the COS tool-lessons change (round 1 ef7199bc: 2 findings, round 2 123a2e6f: 1 finding, all on the iceberg drawing vs lessons data contract; both fixed). Invariant now: the drawing four bands are code; lessonkit.DRAWN names each code-drawn tool exact unit keys in order and validate() rejects any lessons version that differs, so sync/check-mocks/promote refuse it before toolsheets.generated.ts is written; MethodVisual no longer throws, reads UNIT_FACTS in band order, pairs the case units by key; ResultPage status shows 知識不足 from KNOWLEDGE_GAPS/NO_LESSON. Review the whole change, not only the delta.
- exit: 0 | elapsed: 272073ms | answer: 1296B
- files-reviewed: Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/learn/[id]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/LessonView.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/lessons.generated.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/lessons.ts, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py, Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py, Projects/internal/cognitive-engineering-os/docs/mockups/iceberg-lesson-mock.html, Projects/internal/cognitive-engineering-os/docs/mockups/mockkit.py, Projects/internal/cognitive-engineering-os/docs/mockups/sync-design-system.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/evolution/LEDGER.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/evolution/kinds.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/evolution/lessons/v1.yaml, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/toolsheets.generated.ts, Projects/internal/cognitive-engineering-os/docs/mockups/lessonkit.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/evolution/lessons/champion.yaml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The SVG safety check accepts mixed-case event-handler attributes.

  `Projects/internal/cognitive-engineering-os/docs/mockups/lessonkit.py:76` -> `Projects/internal/cognitive-engineering-os/docs/mockups/lessonkit.py:191`

  confidence  -> CONFIRMED

  scenario    -> A lesson picture contains `<svg role="img" aria-label="x" ONLOAD="...">`; the case-sensitive `startswith("on")` check accepts it, sync exports it, and the browser treats it as an executable `onload` handler.

  why missed  -> Current lesson data uses no event attributes, and the tests do not exercise mixed-case SVG attributes.

FINDING 2: `Unit.key` is optional, but key-based rendering silently discards units without keys.

  `Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx:9` -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx:22`

  confidence  -> CONFIRMED

  scenario    -> A caller passes a valid `Unit[]` under the exported type without `key`; every `find(candidate.key === layer.key)` fails, so all iceberg bands display `（沒填）` despite populated unit text.

  why missed  -> `ResultPage` now supplies keys, while the optional type preserves older callers and fixtures that do not.

TOTAL: 2 findings
