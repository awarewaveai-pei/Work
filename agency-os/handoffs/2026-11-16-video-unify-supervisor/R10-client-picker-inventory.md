# R10 挑客戶的地方盤點（2026-11-21）

根目錄 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`（NA）；積木 = `app/(shell)/ops/clients/OrgPicker.tsx`。
「資料」：首頁 = 伺服器只給最早 NAV_FIRST（50）個＋總數，其餘靠 `GET /api/ops/org-search?q=`；整表 = 一次拿全部。

| # | 檔:行 | 現在怎麼畫 | 資料 | 用積木？ | 處理 |
|---|---|---|---|---|---|
| 1 | NA `app/(shell)/ops/clients/ClientPanelNav.tsx:27`（`layout.tsx:15` 給首頁） | 圖二：搜尋框＋一列一客戶＋色點，點了換頁 | 首頁＋搜尋 | 只用 `useOrgSearch`，自己畫列 | 改用 OrgPicker（連結模式） |
| 2 | NA `app/(shell)/ops/collect/page.tsx:58` | OrgUrlPicker（膠囊按鈕換行） | 首頁＋搜尋 | 是 | 外觀跟著積木換成圖二 |
| 3 | NA `app/(shell)/ops/integrations/page.tsx:195` | OrgUrlPicker | 首頁＋搜尋 | 是 | 同上 |
| 4 | NA `app/(shell)/tools/outreach/OrgSwitcher.tsx:15`（`layout.tsx:19` 給首頁） | OrgUrlPicker，「自用 / 未指定」 | 首頁＋搜尋 | 是 | 同上 |
| 5 | NA `app/(shell)/tools/banner/BannerStudioStaff.tsx:35`、`:66` | OrgPicker（品牌色篩選、存到哪個客戶） | 首頁＋搜尋（`org-search`） | 是 | 同上 |
| 6 | NA `app/(shell)/tools/video/OrganizationPicker.tsx:72`（用在 `ReleaseDeliveryPanel.tsx`、`StoryBibleWorkbench.tsx`、`ScriptForge.tsx`） | 一顆一顆按鈕「名稱（代號）」 | **整表**：`/api/video/workbench/bootstrap`（上限 200） | 否 | **已換**：首頁走 bootstrap `?first=1`（NAV_FIRST＋總數；客戶帳號只看到自己），多於一個客戶才可搜尋 |
| 7 | `../video-workbench/scripts/organization-picker.js:3`（`index-boot.js:16` 載入） | 左上「客戶：…」按鈕 → 對話框列出全部客戶按鈕 | **整表**：同上 bootstrap | 否（純 JS，另一個服務） | **未換**：要在工作台加搜尋需跨服務改多檔（對話框＋查詢＋代理），照卡片只列 |
| 8 | NA `app/(shell)/tools/content/topics/*`、`app/content/topics/*`（「全部客戶一覽」） | 每個客戶一大列 | 題目頁自己的資料 | 否 | **未換**：線 A R8 處理 |
| 9 | NA `app/(shell)/tools/video/ScriptForge.tsx:1256`「👤 載入客戶…」 | 網站按鈕一列 | 整表：`/api/content/sites`（wp_sites） | 否 | **未換**：挑的是網站（wp_sites），沒有網站搜尋 API；另開卡 |
| 10 | NA `app/(shell)/tools/content/ContentStudio.tsx:748`、`sites/SiteManager.tsx:619`、`tools/video/ReleaseDeliveryPanel.tsx:89` | 網站選擇 | 整表：`/api/content/sites` | 否 | **未換**：同 #9（網站不是組織） |

不是「挑客戶」（檢查器白名單，各一句原因）：
- `app/(shell)/ops/integrations/page.tsx:211` `organizations.map`：只畫已選的那一個客戶（`:110` `selected ? [selected] : []`）。
- `app/(shell)/ops/schedules/ScheduleTable.tsx:166`：排程表每列的客戶名稱查詢，不是選單。
- `app/(shell)/ops/knowledge/page.tsx:60`、`ops/sellers/page.tsx:26`：依 id 查名稱（`.in("id", …)`）。
- `app/(shell)/ops/billing/page.tsx:4`：自己的側欄是伺服器連結＋GET 表單（搜尋含會員 email），已註明不用 ClientPanelNav。
- `app/(shell)/ops/repairs/page.tsx:126`、`ops/inbox/page.tsx:119`：`?client_slug=` 篩選，只有一個「全部客戶」連結。

規則本體：`OrgPicker.tsx` 檔頭；檢查器：`app/(shell)/ops/clients/__tests__/client-picker-rule.test.ts`。
