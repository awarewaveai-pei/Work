# codex-oracle review -- 2026-11-06 18:23:38 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/studio-canvas-return.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/banner-canvas-return.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/studio-canvas-return.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/banner-canvas-return.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C8.3: Studio (result by model, ref images by stable id) and Banner (product/bg) take the edited image back from the pro editor via useCanvasReturn; onReturn must answer sync within 2s, false when the slot is gone (then editor saves to My Designs); invariant: image lands in exactly one place, never the wrong slot
- exit: 0 | elapsed: 157446ms | answer: 1762B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/banner-canvas-return.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/banner-canvas-return.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/studio-canvas-return.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/studio-canvas-return.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Studio 已確認傳回後，後續模型生成會把編輯圖覆蓋掉  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx:855  
  confidence  -> CONFIRMED  
  scenario    -> 選兩個模型；第一張生成後送去編輯，第二張仍在生成。編輯圖傳回並獲得 ack（同檔第 604–606 行）；第二張完成時，`slots` 的舊快照重新寫入 `results`，第一張編輯圖消失，也不會存進 My Designs。  
  why missed  -> 單元測試只驗證替換函式，沒有涵蓋持續生成的 `slots` 快照。

FINDING 2: Banner 的 AI 合成背景會讓傳回的商品圖在輸出中消失  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/banner-canvas-return.ts:13  
  confidence  -> CONFIRMED  
  scenario    -> AI 背景已合成舊商品，`bgImageHasProduct=true`。傳回新商品圖後函式只更新 `productImage`；輸出仍使用含舊商品的 `bgImage`，並依 `BannerStudio.tsx:431` 跳過商品疊加。系統回 ack，但成品仍是舊商品。  
  why missed  -> 測試確認欄位更新，沒有經過實際合成輸出。

FINDING 3: Banner 去背請求可在 ack 後覆蓋傳回的商品圖  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx:1209  
  confidence  -> CONFIRMED  
  scenario    -> 對舊商品啟動「一鍵去背」，請求未完成時從畫布傳回新商品並獲得 ack；去背回應隨後將舊商品的處理結果寫回 `productImage`。新編輯圖不再是成品，也未存進 My Designs。  
  why missed  -> 傳回測試沒有涵蓋既有的非同步去背流程。

TOTAL: 3 findings
