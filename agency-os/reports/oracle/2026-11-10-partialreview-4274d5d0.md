# codex-oracle review -- 2026-11-10 15:48:22 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-project-list.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-project-list.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed9-project-list.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.9 editor project list (search, cards, rename, delete w/ backup, 屬於 專案›第N集) + edSave updatedAt stamped only on content change (excluded from compared json, revision unchanged by a no-edit save)
- exit: 0 | elapsed: 223804ms | answer: 1243B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-project-list.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-project-list.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed9-project-list.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 刪除備份會讓狀態超過儲存上限，導致專案無法刪除
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-project-list.js:40
  confidence  -> CONFIRMED
  scenario    -> 現有狀態約 50 MB，其中剪輯專案清單約 35 MB；刪除時先把整份清單複製進同一狀態，超過 `backend/api.cjs:946` 的 80 MB 請求上限。備份寫入收到 413，刪除中止。備份沒有清理機制，累積刪除也會逐步觸及上限。
  why missed  -> 單筆小專案測試未碰到伺服器對整份狀態的大小限制。

FINDING 2: 刪除測試會把「畫面已移除、伺服器未刪除」判為通過
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed9-project-list.cjs:98
  confidence  -> CONFIRMED
  scenario    -> 備份寫入成功，但隨後 `edSave()` 的寫入失敗；畫面已有一張卡被移除，`ed.save.pending` 最終仍變成 0，伺服器也仍有備份鍵與舊名稱。因此第 98–103 行通過，重新整理後被刪專案卻會出現。
  why missed  -> 測試只看畫面、待寫數與備份文字，沒有核對伺服器的現行專案清單或重新整理後的結果。

TOTAL: 2 findings
