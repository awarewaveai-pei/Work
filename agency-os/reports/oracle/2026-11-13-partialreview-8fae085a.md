# codex-oracle review -- 2026-11-13 20:34:02 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-run.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/bg-remove.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/video-enhance.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/remove-bg-money.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: 去背 double-charge fix: one shared module (replicate-run.cjs) for 去背 and AI 畫質增強. Invariants: (1) one Replicate prediction is taken over by at most one job and so charged at most once (settle() charges each succeeded job by its result) -- handover only from a failed/cancelled job, claimed synchronously in takeOver() before any await; a running job's prediction is never shared; (2) every run this server abandons (poll error, timeout, user cancel, restart) gets POST /predictions/<id>/cancel. Focus: charge count (any path where two succeeded jobs carry the same replicateId) and cancel (any abandon path that skips cancel). Tests use fake fetchImpl only.
- exit: 0 | elapsed: 133005ms | answer: 1339B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/bg-remove.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/video-enhance.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/remove-bg-money.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-run.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 接手舊預測時若狀態查詢逾時，會放棄已知的預測 ID，卻不送出取消請求。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-run.cjs:51
  confidence  -> CONFIRMED
  scenario    -> 新任務接手仍在運算的 `resumeId`；首次 GET 尚未回應時任務逾時，`get()` 因 abort 拋錯。第 51 行直接重拋，未進入第 56–64 行的取消處理，Replicate 預測仍可能繼續計費。
  why missed  -> 取消處理包住輪詢迴圈，卻沒有包住接手後的首次狀態查詢。

FINDING 2: 已取消的 AI 畫質增強任務可把正在取消的預測交給重試任務。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-run.cjs:30
  confidence  -> CONFIRMED
  scenario    -> 使用者取消運算中的 AI 畫質增強任務，伺服器將任務標為 `cancelled` 並送出取消 POST；使用者立即重試時，第 30 行允許接手該預測。若 Replicate 此時仍回報 `processing`，重試任務會等待這個正在取消的預測，最後以取消狀態失敗。舊的 AI 畫質增強路徑只接手 `failed` 任務。
  why missed  -> 共用接手條件把 `cancelled` 與 `failed` 視為相同，但取消請求與供應商狀態變更並不同步。

TOTAL: 2 findings
