# codex-oracle review -- 2026-10-11 17:12:55 +08:00

- mode: `review`
- scope: whole repo
- target: `51dffee2d~1..51dffee2d`
- context: Commit 51dffee2d fixes Codex round-2 findings on COS entry slice 1: 陪我思考 now links to /projects/new where IntakePage has no project and creates project + assembler.intake only when 開案 is pressed (a failed intake save reuses the created project; URL replaced with window.history.replaceState); the web no longer guesses cases (is_case from the server only); DELETE /projects/{id}?only=analysis refuses with 409 PROJECT_IS_A_CASE when the project holds 開案資料; popular list validated against engineering tools; menu gets 開新案子. Report ONLY: data loss, privacy/ownership leaks, or a main path (open a case, run a direct analysis, delete from 我的分析) that breaks. Cite file:line. No style or speculative findings; none is a valid answer.
- exit: 0 | elapsed: 279653ms | answer: 1353B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/catalog/display_catalog.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/new/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/HomeStart.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/HomeStart.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/ProjectList.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/IntakePage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/IntakePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/projects.ts, Projects/internal/cognitive-engineering-os/docs/platform/ENTRY_SLICE1_CHECKLIST.md, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_display_catalog.py, agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/platform-entry-design.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 結果頁的「永久刪除」繞過 `only=analysis`，可刪掉已開成的案子
  file:line   -> apps/cognitive-web/components/result/ResultChoices.tsx:16,27 -> apps/cognitive-web/components/result/ResultPage.tsx:352 -> ai_lego/apps/api/main.py:2832,2853,2855
  confidence  -> CONFIRMED
  scenario    -> 結果頁先載入 `is_case=false`；另一分頁完成開案後，原頁仍顯示「永久刪除」，送出沒有 query string 的 DELETE，後端跳過分析限定檢查並刪除案子的 intake、分析與專案。
  why missed  -> 清單入口改用了 `?only=analysis`，但結果頁共用的 `erase` callback 未同步修改。

FINDING 2: `?only=analysis` 的防護有 TOCTOU race，仍可能刪除剛開成的案子
  file:line   -> ai_lego/apps/api/main.py:2853,2855 -> ai_lego/data/repositories/case_docs.py:261,267 -> ai_lego/platform/erasure.py:193,198 -> ai_lego/data/repositories/project_source_repository.py:790,793
  confidence  -> CONFIRMED
  scenario    -> DELETE 檢查時尚無 intake；另一分頁隨後 POST 並提交 intake；DELETE 接著取得 exclusive case lock，但沒有重新檢查 intake，直接刪除事件與專案，剛保存的開案資料遺失。
  why missed  -> 檢查與實際 erasure 位於不同 transaction，測試只驗證先開案後刪除，未驗證兩者交錯。

TOTAL: 2 findings
