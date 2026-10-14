# codex-oracle review -- 2026-10-11 14:26:33 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Entry slice 1 (docs/platform/ENTRY_SLICE1_CHECKLIST.md): home page becomes one sentence + two doors (陪我思考 opens a case via POST /projects and carries ?q= into 開案; 直接分析 = old home content at /analyze with ?q=); GET /catalog marks each tool's block (blocks.FAMILY_BLOCK) and internal goals so the web hides engineering tools; GET /projects adds is_case (has assembler.intake) so 我的案子 splits 案子 / 我的分析 with tick + permanent delete after an on-page confirmation; result page bottom offers 用這份結果開案 / 留在我的分析 / 永久刪除 while not a case; menu 11 -> 5 sections with sub items, 帶領 only for facilitators (GET /facilitate/me); site name 認知工程系統; 我的專案 renamed 我的案子. Look for: an engineering tool still reachable from a person's list, is_case wrong after intake delete or erase, data loss in the delete flow, a page no longer reachable from the menu, broken links to the old home.
- exit: 0 | elapsed: 614598ms | answer: 3739B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/catalog/display_catalog.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/error.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/layout.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/methods/[id]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/[id]/start/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/workflows/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/globals.css, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/layout.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/login/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AnalysisPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ComparePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunHeader.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/StuckBox.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ToolDirectory.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/BlockShell.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/FacilitatePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/IntakePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/MyLearnPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/TeachPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.test.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/projects.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/strings.ts, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_display_catalog.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/analyze/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/HomeStart.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/HomeStart.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultChoices.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultChoices.tsx, Projects/internal/cognitive-engineering-os/docs/platform/ENTRY_SLICE1_CHECKLIST.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Multiple-workspace tenants cannot use either new entry door.
  file:line   -> `apps/cognitive-web/lib/projects.ts:82,85` -> `ai_lego/apps/api/main.py:2693,2698`
  confidence  -> CONFIRMED
  scenario    -> A tenant has multiple workspaces; opening「陪我思考」or a new direct analysis POSTs without `workspace_id` and receives `PROJECT_WORKSPACE_ID_REQUIRED`.
  why missed  -> Entry tests mock successful POST responses and omit the multi-workspace API path.

FINDING 2: Saved engineering analyses remain actionable from 我的案子.
  file:line   -> `apps/cognitive-web/components/ProjectList.tsx:54` -> `ai_lego/apps/api/main.py:2743`
  confidence  -> CONFIRMED
  scenario    -> A user has a saved `security.stride` analysis; 我的案子 links it to `/methods/security.stride`, where it can be run again.
  why missed  -> Catalog filtering covers recommendations and directories, but the project method list uses every saved method ID.

FINDING 3: Choosing a tool from 直接分析 loses the originating project.
  file:line   -> `apps/cognitive-web/components/result/ResultPage.tsx:539` -> `apps/cognitive-web/app/(shell)/analyze/page.tsx:41,42`
  confidence  -> CONFIRMED
  scenario    -> From a result, the user opens `/analyze?project=P1`, then clicks a category’s「看全部」or featured tool; those links omit `project=P1`, so the subsequent analysis creates a new project.
  why missed  -> Tests verify only the link into `/analyze`, not the links rendered from that page.

FINDING 4: Pending physical cleanup is reported as completed permanent deletion.
  file:line   -> `ai_lego/apps/api/main.py:2848` -> `apps/cognitive-web/components/ProjectList.tsx:43,46`; `components/result/ResultPage.tsx:352,353`
  confidence  -> CONFIRMED
  scenario    -> Database erasure succeeds but file cleanup returns `physical_cleanup: "pending"` with HTTP 202; the UI clears the selection or redirects without showing that deletion is incomplete.
  why missed  -> `apiFetch` accepts any 2xx response, and neither delete flow inspects the cleanup status.

FINDING 5: An opened-but-unsaved case disappears from the home-page continuation link.
  file:line   -> `apps/cognitive-web/components/HomeStart.tsx:28,69` -> `apps/cognitive-web/components/ProjectList.tsx:33,35`
  confidence  -> CONFIRMED
  scenario    -> The user opens「陪我思考」, leaves before saving intake, then returns home; `is_case` is still false, so the home page omits that case and may show an older one instead.
  why missed  -> ProjectList treats empty projects as pending cases, but HomeStart filters strictly on `is_case`.

FINDING 6: 帶領 is visible to non-facilitators who visit its URL.
  file:line   -> `apps/cognitive-web/components/AppNav.tsx:35` -> `apps/cognitive-web/components/AppNav.tsx:51`
  confidence  -> CONFIRMED
  scenario    -> A non-facilitator opens `/lead`; `section === "lead"` bypasses the facilitator check, so the facilitator-only menu item appears.
  why missed  -> The menu test explicitly preserves the item while already on `/lead`.

FINDING 7: AI-generated next-step recommendations can expose engineering tools.
  file:line   -> `ai_lego/apps/api/main.py:1713,1714` -> `ai_lego/modules/research/interpret_method_record.py:589,596` -> `apps/cognitive-web/components/result/ResultPage.tsx:528,534`
  confidence  -> PLAUSIBLE
  scenario    -> A normal-user result contains an active engineering method such as `security.stride` in its recommended steps; the result page renders a runnable link because this path does not apply the user-tool filter.
  why missed  -> The new tests cover catalog/directory filtering, but not the interpretation prompt, validation, or result-card recommendation path.

TOTAL: 7 findings
