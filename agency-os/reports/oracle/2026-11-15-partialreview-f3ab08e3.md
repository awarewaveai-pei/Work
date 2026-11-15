# codex-oracle review -- 2026-11-15 12:03:00 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai-api.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.4 round 2. Round-1 fixes (ccdf770d): makeAiCover reports onVendorDone(costUsd) right after the vendor answers and the job records job.finishing {origin with that cost}, so a local failure after the billed run is still charged once (settle charges a failed job with finishing; deleted on success); the AI cover registers through a settle chained after any export settle already running (Promise.resolve(settling.get(id)).finally(() => settle(export))), failures go to coverRegisterError + the server's own retry; the cover-ai export check runs first in start(), before the ElevenLabs account refresh or any permit/vendor call. Tests: failing title step still reports the cost; refused request makes no outside call with an ElevenLabs key set (mutation turns it red).
- exit: 0 | elapsed: 161632ms | answer: 1263B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/cover-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai-api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/cover-ai.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 服務重啟會漏收已完成的 AI 封面供應商費用
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:277
  confidence  -> CONFIRMED
  scenario    -> 供應商回覆後，`onVendorDone` 已將費用寫入 `job.finishing`；服務在封面處理期間重啟。啟動時把該 job 改為 `failed`，但只對破框 job 執行恢復與 `settle`（同檔第 291–306 行）；一般 `failed` job 的 GET 也不觸發 `settle`（第 1004 行）。費用始終不進 usage outbox。
  why missed  -> 本輪測試涵蓋處理失敗後的正常結算，沒有走重啟恢復路徑。

FINDING 2: 供應商回覆後取消 job 也會漏收費用
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:191
  confidence  -> CONFIRMED
  scenario    -> `onVendorDone` 已記錄費用，使用者在 ffmpeg 處理封面期間取消 job。取消端點將狀態設為 `cancelled` 並中止處理（同檔第 1543–1545 行）；結算只對 `succeeded` 或帶 `finishing` 的 `failed` job 記 usage，因此這筆已計費的供應商執行不會扣款。
  why missed  -> 本輪測試涵蓋後處理失敗，沒有涵蓋同一時段的使用者取消。

TOTAL: 2 findings
