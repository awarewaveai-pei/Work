# codex-oracle review -- 2026-11-02 13:26:09 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/designs-list.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/asset-group.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/semantic-filename.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/semantic-filename.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/ModelMockupPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/__tests__/model-flow.render.test.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: mockup page: design picker uses new ?group=print (design minus tarot/mockups); downloads get unique semantic filenames
- exit: 0 | elapsed: 91820ms | answer: 1604B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/ModelMockupPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/__tests__/model-flow.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/semantic-filename.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/asset-group.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/designs-list.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/semantic-filename.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 模特合成圖會以目前選取的設計命名，與圖片實際使用的設計不符  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/ModelMockupPanel.tsx:185`  
  confidence  -> CONFIRMED  
  scenario    -> 用設計 A 合成模特圖後，改選設計 B，再下載仍保留的 A 結果；檔名會寫 B。合成時的設計取自第 53 行，但結果未保存當時的名稱。  
  why missed  -> 新檔名直接讀取目前的 `designName`；原有結果會在切換設計後繼續顯示。

FINDING 2: 從產品預設庫選圖後，下載檔名可能沿用上一張設計  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx:567`  
  confidence  -> CONFIRMED  
  scenario    -> 先選名稱為 A 的設計，再點產品預設 B 並合成；此選取路徑更新了 `designRef`，卻未更新 `designName`，第 836 行產生的檔名仍寫 A。  
  why missed  -> 改動更新了圖庫點選與上傳路徑，漏掉產品預設庫的點選路徑。

FINDING 3: `group=print` 測試沒有驗證其宣稱的塔羅排除條件  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.test.ts:223`  
  confidence  -> CONFIRMED  
  scenario    -> 若查詢意外把 `tarot` 素材納入 `print`，此測試仍會通過：測試資料只有設計、無來源、兩種 mockup，沒有任何塔羅素材。  
  why missed  -> 測試名稱寫了「no tarot cards」，但資料只覆蓋 mockup 排除。

TOTAL: 3 findings
