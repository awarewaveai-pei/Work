# R10 挑客戶盤點（2026-11-21）

NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；積木 = NA `app/(shell)/ops/clients/OrgPicker.tsx`；首頁 = 前 50＋搜尋，整表 = 一次全拿。

| # | 檔:行 | 原畫法 | 資料 | 狀態 |
|---|---|---|---|---|
| 1 | NA `app/(shell)/ops/clients/ClientPanelNav.tsx` | 自畫列＋useOrgSearch | 首頁 | 換：積木連結模式；自畫列刪 |
| 2 | NA `app/(shell)/ops/collect/page.tsx:58` | 積木（膠囊） | 首頁 | 外觀隨積木 |
| 3 | NA `app/(shell)/ops/integrations/page.tsx:195` | 積木（膠囊） | 首頁 | 同上 |
| 4 | NA `app/(shell)/tools/outreach/OrgSwitcher.tsx:15` | 積木（膠囊） | 首頁 | 同上 |
| 5 | NA `app/(shell)/tools/banner/BannerStudioStaff.tsx:34,66` | 積木（膠囊） | 首頁 | 同上 |
| 6 | NA `app/(shell)/tools/video/OrganizationPicker.tsx`（StoryBible／ReleaseDelivery／ScriptForge） | 自畫按鈕 | 整表 bootstrap ≤200 | 換：積木＋bootstrap `?first=1`/`&include`/`?q`；自畫按鈕刪 |
| 7 | `../video-workbench/scripts/organization-picker.js:3` | 對話框全部按鈕 | 整表 bootstrap | 未換：另一服務、需多檔 |
| 8 | NA `app/(shell)/tools/content/topics/*`、`app/content/topics/*` | 每客戶一大列 | 題目資料 | 未換：線 A R8 |
| 9 | NA `app/(shell)/tools/video/ScriptForge.tsx:1256`、`tools/content/ContentStudio.tsx:748`、`tools/content/sites/SiteManager.tsx:619`、`tools/video/ReleaseDeliveryPanel.tsx:89` | 網站按鈕 | 整表 `/api/content/sites`（wp_sites） | 未換：挑網站非組織，無網站搜尋 API |

非挑客戶：NA `ops/integrations/page.tsx:211`（只畫已選一個）、`ops/schedules/ScheduleTable.tsx:166`（列名查詢）、`ops/knowledge/page.tsx:60`／`ops/sellers/page.tsx:26`（依 id 查名）、`ops/billing/page.tsx:4`（挑帳務帳戶）、`ops/repairs/page.tsx:126`／`ops/inbox/page.tsx:119`（?client_slug 篩選連結）。

規則：NA `OrgPicker.tsx` 檔頭；檢查器：NA `app/(shell)/ops/clients/__tests__/client-picker-rule.test.ts`。
