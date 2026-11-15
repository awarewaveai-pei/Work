# codex-oracle review -- 2026-11-15 12:10:01 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/jobs-view.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai-api.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.4 round 3. Round-2 fixes (f3ab08e3): invariant -- a vendor run recorded as completed (job.finishing) is charged once however the job ends: settle charges succeeded, or failed/cancelled with finishing; at start the server settles failed/cancelled jobs with finishing + paid + not yet reported (a restart turns a running cover-ai job failed first). p6 test: a restart-interrupted and a cancelled-after-vendor cover-ai job each reach usage exactly once (mutation on the charge condition turns it red). api.cjs diff also has VD.10's main-system subtitles (main-system.cjs, not in scope here).
- exit: 0 | elapsed: 93171ms | answer: 1327B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/jobs-view.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai-api.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: AI 封面可能已完成供應商執行，卻在重啟後漏記用量  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:792  
  confidence  -> CONFIRMED  
  scenario    -> 供應商已回傳，程式刪除 `job.finishing` 並在第 793 行存檔；伺服器在第 894 行將工作存為 `succeeded` 前重啟。重啟把持久化的 `running` 工作改為 `failed`，但它已沒有 `finishing`，因此第 193 行不會記用量。  
  why missed  -> 測試涵蓋了保留 `finishing` 的中斷狀態，沒有涵蓋刪除後、成功狀態存檔前的窗口。

FINDING 2: 未記帳的終止工作可能被歷史上限刪除  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:242  
  confidence  -> CONFIRMED  
  scenario    -> 一筆 `failed`／`cancelled` 工作有 `finishing`、`paid`，但尚無 `usageReported`；當更新的終止工作已超過 `JOB_HISTORY_LIMIT`，啟動時第 292 行的 `persist()` 會依第 242–247 行將它從 `jobs.json` 刪除。若伺服器在排定的補記帳執行前再次停止，下一次啟動已無紀錄可補，造成永久漏記。  
  why missed  -> 新增的啟動補記帳迴圈位於既有歷史裁剪之後；測試資料量未觸及裁剪上限。

TOTAL: 2 findings
