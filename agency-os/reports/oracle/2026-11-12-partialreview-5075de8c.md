# codex-oracle review -- 2026-11-12 20:59:31 +08:00

- mode: `review`
- scope: whole repo
- target: `e88ef493d~1..e88ef493d`
- context: Pricing fix already live in prod (next-admin auto-deploys main). Charges real money. Look ONLY for: wrong amount charged/held (per-megapixel imageRunUsd + generateTarotImage hold/charge in lib/tarot/image-gen.ts; per-GPU-second replicateRunUsd in lib/ai/cost-model.ts used by app/api/tools/studio/remove-bg/route.ts via replicate-run.ts predictSec and by video-workbench bg-remove.cjs/image-to-3d.cjs; gpt-4o-mini-tts token estimate in video-workbench provider-cost.cjs speechUsd), crashes, or main-path breakage. Official prices: klein $0.001/MP in + $0.001/MP out; flux-2-max $0.04/run + $0.03/MP out + $0.03/MP in; nano-banana-2 2K $0.101; bg-remover T4 $0.000225/s; TTS text $0.6/1M tok, audio out $12/1M tok at 20 tok/s. Some files changed after this commit (f792960c6, 3679cd292); check the CURRENT files for whether each issue still holds. Report each finding with file:line, concrete failing input, and severity; skip style.
- exit: 0 | elapsed: 211689ms | answer: 1585B
- files-reviewed: agency-os/WORKLOG.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/remove-bg/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/model-comparison.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/editor-ai-panels.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/model-options.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/replicate-run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/model-comparison.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/model-specs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/image-models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/README.md, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/bg-remove.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/index.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-director.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/projects-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/templates-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/episode-spine.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/backend.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/paid-price.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video-ui.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: My Designs 參考圖網址一律按 1 MP 預扣並計價，會低估 Klein 的輸入費用  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts:725`  
  confidence  -> CONFIRMED  
  severity    -> 中  
  scenario    -> Studio 接受 My Designs 圖庫網址作參考圖（`app/api/tools/studio/generate/route.ts:81`），Klein 也會將該網址送給 Replicate（`lib/tarot/image-gen.ts:225`）。若圖為 12 MP，`megapixels()` 仍回傳 1 MP；以 1 MP 輸出計，程式記錄 US$0.002，按指定價格應為 US$0.013。錢包僅有 1 點時，預扣 1 點後實際應扣 2 點，會留下差額。  
  why missed  -> 計價追了 data URL 的尺寸，沒有追到 Studio 允許的圖庫網址入口。

FINDING 2: 去背只按典型運行時間預扣，較長且成功的任務可超出錢包餘額  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/remove-bg/route.ts:48`  
  confidence  -> CONFIRMED  
  severity    -> 中  
  scenario    -> 錢包只有 1 點時，US$0.00044 的估價預扣 1 點。若 Replicate 回報成功任務的 `predict_time` 為 50 秒，實價為 US$0.01125，依 `lib/entitlements/ledger.ts:11` 應扣 2 點；`lib/entitlements/can.ts:248` 只能再扣可用餘額，結果收 1 點並記下 1 點差額。50 秒仍在此路徑的 55 秒預設逾時內（`lib/studio/replicate-run.ts:11`）。  
  why missed  -> 測試涵蓋按秒計算，沒有涵蓋估價跨過點數進位門檻且錢包已被預扣清空的情況。

TOTAL: 2 findings
