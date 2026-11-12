# codex-oracle review -- 2026-11-13 00:52:33 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/video-enhance.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/media.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/workbench-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed12-ai-enhance.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed12-effects-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.12.3: real AI picture enhancement (topazlabs/video-upscale on Replicate) for the video editor 特效 pane and the tools page. Job = operation enhance + settings enhanceType 畫面 / enhanceOption AI 大模型增強 / enhanceResolution. Paid feature video.enhance (main-system paidFeature, next-admin products.ts + workbench-usage ASK). Price lives only in next-admin cost-model.ts VIDEO_ENHANCE_RATES + videoEnhanceUsd: charge = reported units (metrics.unspecified_billing_metric) x usdPerUnit; estimate = max(minUnits, ceil(seconds x unitsPerSec)); no units reported = estimate + log. Source sent as data: URI (Files API urls are unreadable to this model), capped at 20MB. Quote from POST /generations/quote. NOTE: api.cjs and main-system.cjs contain other cards' uncommitted work; review only the ED.12.3 hunks (videoEnhance/aiEnhanceSource/enhance).
- exit: 0 | elapsed: 164820ms | answer: 2985B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/workbench-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/media.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/effects.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed12-effects-ai.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/video-enhance.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed12-ai-enhance.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 服務重啟會把仍在 Replicate 執行的增強任務標成失敗，留下無人追蹤的付費 prediction
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:188`
  confidence  -> CONFIRMED
  scenario    -> 任務已有 `replicateId`、狀態為 `running`，但沒有 `providerId`；服務重啟時第 188–191 行將它標為 `failed`，既不恢復輪詢也不取消 prediction。若使用者沒有手動重試，Replicate 可繼續計費，成果卻不會交付。
  why missed  -> 新程式保存並重用 `replicateId`，但啟動時的舊任務恢復邏輯只認 `providerId`。

FINDING 2: 兩個同時送出的任務可共用一個 prediction，卻各自扣款
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:523`
  confidence  -> CONFIRMED
  scenario    -> 同一素材與解析度的任務 A 正在執行時送出 B；B 取得 A 的 `replicateId` 並輪詢同一次 prediction。兩個任務都成功後，各自建立含 `costUsd` 的結果，`settle()` 依各自的 job ID 回報用量（第 119–122、544–549 行），因此一次供應商運算扣兩次點。
  why missed  -> 重用邏輯考慮了失敗後重試，未排除仍在執行的任務。

FINDING 3: 40 分鐘逾時只中止本機輪詢，沒有取消供應商任務
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:847`
  confidence  -> CONFIRMED
  scenario    -> Replicate prediction 超過 40 分鐘仍在 `processing`；計時器 abort 本機任務，`finish()` 將其標為 `failed`（第 718–724 行）。供應商取消呼叫只在使用者按取消的路徑（第 1271–1273 行），所以 prediction 可繼續產生費用。
  why missed  -> 取消測試涵蓋按鈕路徑，未涵蓋自動逾時。

FINDING 4: 工具頁的付費增強按鈕沒有顯示該素材報價
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-workflows.js:109`
  confidence  -> CONFIRMED
  scenario    -> 使用者在工具頁選「畫面／AI 大模型增強」及一支長影片；「開始增強」由 `btn()` 產生，沒有 `data-paid`，也沒有呼叫 `/generations/quote`。按鈕可直接送出付費任務，點擊前看不到這支影片的估價。
  why missed  -> 新增的逐素材報價只接到編輯器「特效」面板，工具頁沿用通用送出按鈕。

FINDING 5: 工具頁提供必定被後端拒絕的 2K 選項
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-workflows.js:109`
  confidence  -> CONFIRMED
  scenario    -> 使用者選「AI 大模型增強／2K」後按「開始增強」；後端 `resolutionOf()` 只接受 `720P`、`1080P`、`4K`（`backend/video-enhance.cjs:16–23`），因此回傳 400，任務無法開始。
  why missed  -> 後端新增解析度白名單時，工具頁原有選項未同步。

TOTAL: 5 findings
