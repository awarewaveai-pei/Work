# codex-oracle review -- 2026-11-06 18:20:12 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/canvas-return-slot.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/canvas-return-slot.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C8.2 tarot send-back: preview + deck card return via useCanvasReturn; extracted applyPreviewEdit and frameCardArt; onReturn must answer within 2s and return false when the deck slot is gone
- exit: 0 | elapsed: 144241ms | answer: 1809B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/canvas-return-slot.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/canvas-return-slot.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 單張牌重新生成後，舊畫布的傳回仍會覆蓋新牌  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/canvas-return-slot.ts:15  
  confidence  -> CONFIRMED  
  scenario    -> 將已完成的牌送進畫布，回到塔羅頁重新生成同一張並等它完成，再從舊畫布按「傳回」；deck id 未因單張重新生成而改變，檢查只看 `done`，因此舊編輯覆蓋新牌。  
  why missed  -> 測試涵蓋整副牌換代與生成中的牌，未涵蓋同一副牌內已完成的單張重新生成。

FINDING 2: 舊預覽的傳回會覆蓋後來生成的預覽，卻保留後者的模型與 seed  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx:909  
  confidence  -> CONFIRMED  
  scenario    -> 送出預覽 A 後，在塔羅頁改選模型並生成預覽 B，最後從 A 的畫布按「傳回」；固定的 `preview` slot 直接接受 A，處理時讀取 B 的 `activeModel` 與 `previewSeed`，畫面與模型、seed 因而不一致。  
  why missed  -> 預覽傳回沿用固定 slot，沒有像 deck slot 一樣核對送出時的版本。

FINDING 3: 已回覆成功後若卡牌合成失敗，編輯圖不會落到任何持久儲存處  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx:923  
  confidence  -> CONFIRMED  
  scenario    -> 傳回時來源分頁的 2D canvas 無法建立，`renderPrintCard` 拋錯；handler 已回傳 `true`，編輯器收到 ack 而不存入「我的設計」，卡牌仍顯示舊外框圖，僅留下錯誤訊息。  
  why missed  -> 驗收只確認傳回 ack 與正常合成，沒有驗證 ack 後的合成失敗路徑。

TOTAL: 3 findings
