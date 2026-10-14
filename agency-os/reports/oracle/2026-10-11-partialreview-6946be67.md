# codex-oracle review -- 2026-10-11 16:22:51 +08:00

- mode: `review`
- scope: whole repo
- target: `735e12468~1..735e12468`
- context: Commit 735e12468 = COS entry slice 1 (scope docs/platform/ENTRY_SLICE1_CHECKLIST.md). An earlier partial review (agency-os/reports/oracle/2026-10-11-partialreview-b800c499.md) found F1-F7; F3-F7 were fixed after it: engineering tools excluded from non-engineering next-step interpretation (main.py ~1708, FAMILY_BLOCK.get so an unmapped family cannot break interpretation), unopened cases (opened via 陪我思考, no intake yet, no analyses) count as cases on 我的案子 and home (lib/projects.ts unopenedCase/listedAsCase), delete flow reports 202 pending honestly. Check the fixes and the whole commit for: an engineering tool still reachable from a person's list, is_case wrong, data loss or wrong target in the delete flow, a page unreachable from the menu, a broken link to the old home. Report only real findings with file:line; none is a valid answer.
- exit: 0 | elapsed: 182233ms | answer: 2429B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/catalog/display_catalog.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/analyze/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/error.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/layout.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/methods/[id]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/[id]/start/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/workflows/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/globals.css, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/layout.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/login/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AnalysisPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ComparePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/HomeStart.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/HomeStart.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunHeader.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/StuckBox.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ToolDirectory.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/BlockShell.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/FacilitatePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/IntakePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/MyLearnPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/TeachPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultChoices.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultChoices.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.test.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/projects.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/strings.ts, Projects/internal/cognitive-engineering-os/docs/platform/ENTRY_SLICE1_CHECKLIST.md, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_display_catalog.py, agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/platform-entry-design.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Any empty project is classified as a case, including in-flight or failed direct analyses.
  apps/cognitive-engineering-os/apps/cognitive-web/lib/projects.ts:82 -> apps/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx:74
  confidence  -> CONFIRMED
  scenario    -> Direct analysis creates a project, then its analysis request fails or is still running; `is_case=false, analysis_count=0` becomes `listedAsCase=true`, so it appears under 案子 and “繼續上次的案子”.
  why missed  -> The predicate cannot distinguish projects opened via 陪我思考 from empty projects created by the analysis flow.

FINDING 2: Bulk deletion can erase a case after the list becomes stale.
  apps/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx:35 -> apps/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx:42
  confidence  -> CONFIRMED
  scenario    -> A user selects an analysis; another tab saves its intake, turning it into a case; the first tab confirms deletion and sends `DELETE /projects/{id}` without rechecking `is_case`, deleting the newly converted case.
  why missed  -> The flow validates classification only when loading the list, with no server-side type/ETag guard at deletion time.

FINDING 3: A later deletion batch hides an earlier pending cleanup.
  apps/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx:44 -> apps/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx:108
  confidence  -> CONFIRMED
  scenario    -> Batch A returns `physical_cleanup="pending"`; before cleanup finishes, batch B completes normally; `setCleaning(0)` removes the status message even though batch A’s files are still pending.
  why missed  -> The test covers only one deletion batch and treats `cleaning` as per-operation state.

FINDING 4: The popular-tool list is not filtered for engineering tools.
  apps/cognitive-engineering-os/apps/cognitive-web/app/(shell)/analyze/page.tsx:52 -> apps/cognitive-engineering-os/ai_lego/platform/catalog/display_catalog.py:231
  confidence  -> PLAUSIBLE
  scenario    -> If the catalog’s `popular` list contains `security.stride`, `/analyze` renders it with a start link because only goals and free-text picks are filtered.
  why missed  -> Tests use `popular: []`, and the backend forwards `popular` unchanged instead of validating it against `FAMILY_BLOCK`.

TOTAL: 4 findings
