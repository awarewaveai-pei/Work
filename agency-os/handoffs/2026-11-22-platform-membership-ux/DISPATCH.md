# DISPATCH — 平台會員、目前客戶、登入後介面：唯一的開工順序

- 建立：2026-11-22｜監工每次工人交回，**先讀本檔**再動作。卡的內容正本：K、U3–U5 在 A；其餘 U、W 在 B §17.2／§2A.6；M 在本檔 §3。
- A＝`CLIENT-CONTEXT-PLAN-20261121.md`；B＝`PLATFORM-UX-BLUEPRINT-20261122.md`；C＝`agency-os/docs/architecture/decisions/021-membership-model.md`。
- NA＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；PL＝`lobster-factory/packages/aware-wave-store-plugin/`；MIG＝`lobster-factory/packages/db/migrations/`；VW＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`。
- 回報操作者一律繁體中文。

## 0. 每張卡都適用

| 規則 | 內容 |
|---|---|
| 工作位置 | 工人在自己的 git worktree（`D:\Worktrees\<卡號>`）、自己的分支 commit，不推 main；監工驗收後才併 main |
| 同檔 | 兩個工人不得同時改同一檔；同批卡的檔案清單兩兩不重疊（§9） |
| 上線 | 不用 `DEPLOY_HOLD`（擋所有 app，`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh:204-217`）；併 main＝當晚 03:00 上線，所以每卡自身完整；未完成的功能靠「尚無入口」不讓使用者看到；不新增 feature flag |
| High | auth／tenant-guard／middleware／cookie／DB migration／金流／正式站 WordPress 外掛啟用：工人照做、監工驗收，**併 main 前停下問操作者** |
| 測試 | 只寫卡片點名的測試；突變只做在隱私／可見範圍／擁有權守衛，一個守衛一次；`.ts/.tsx` 交回前 `npx tsc --noEmit` 綠 |
| 審查 | 每卡 1 個 critic（Codex 額度 2026-11-24 才恢復；之前 High 卡加書面對抗自審＋突變證據） |
| 交回 | 三行 `FILES:`／`TESTS:`（指令＋通過數）／`RISKS:`；不寫散文報告 |
| 主題 session 佔用中 | NA `app/globals.css`、`lib/theme/tokens.ts`、`app/(shell)/tools/theme/*`、`app/__tests__/sidebar-coverage.test.ts`、`lib/theme/__tests__/tokens-match-globals.test.ts`、`app/(shell)/tools/seedstar/`、`components/tools/AwareWaveThemeFrame.tsx`：要改的卡標「先與主題 session 協調」 |
| migration 編號 | 目前最後一號 `0174`（`0174_systems_control_center.sql`，只有檔、未上線）。M 卡開工時 `ls MIG | tail` 取下一號；同批只准一張卡寫 migration |

## 1. 全部卡總表

模型：Sonnet＝卡已寫死步驟；Opus＝需要判斷；Haiku＝純資料。狀態：待派／進行中／待驗收／待操作者 go／已併。

### P1（不等開放註冊）

| 卡 | 白話 | 檔案 | 風險 | 模型 | 依賴 | 批 | 狀態 |
|---|---|---|---|---|---|---|---|
| K1 | 把「目前客戶」規則寫成正式決策文件 ADR 020 | 新 `agency-os/docs/architecture/decisions/020-client-context.md`；`ADR_INDEX.md` | Low | Sonnet | — | 1 | 已併 |
| K2 | 一個小函式決定「現在是哪個客戶、哪個網站」 | 新 NA `lib/client-context/contract.ts`、`lib/client-context/__tests__/contract.test.ts` | Low | Sonnet | — | 1 | 已併 |
| K3 | 客戶搜尋與網站清單兩支 API 可以指定客戶 | NA `app/api/ops/org-search/route.ts`、`route.test.ts`、`app/api/content/sites/route.ts`、新 `app/api/content/sites/__tests__/sites-filters.test.ts` | Medium | Sonnet | — | 1 | 已併 |
| U6 | 「方案內／贈送／扣點／未開通…」標籤只由一個函式決定 | 新 NA `lib/entitlements/right-label.ts`、`lib/entitlements/__tests__/right-label.test.ts`；`lib/entitlements/use-paid-features.ts` | Low | Sonnet | — | 1 | 已併 |
| K4 | 左邊的客戶欄（搜尋＋清單）做好，先不放到頁面 | 新 NA `app/ClientContextProvider.tsx`、`lib/client-context/use-client-context.ts`、`app/ClientRail.tsx`＋各自 test | Medium | Opus | K2、K3 | 2 | 已併 |
| U7 | 會員看自己點數與合約的讀取 API | 新 NA `app/portal/api/account/route.ts`＋test（客戶身分只進得了 `/portal/*`，`middleware.ts` `isClientOutsideDoor`） | Medium | Sonnet | — | 2 | 已併 |
| U22 | 產品登記表加分類、任務、一句話等欄位 | NA `lib/portal/products.ts`、新 `lib/portal/catalog-vocab.ts`、`lib/portal/__tests__/products.test.ts`；`scripts/new-product.mjs`、`scripts/__tests__/new-product.test.mjs` | Medium | Sonnet | — | 2 | 已併 |
| M1 | 測試用客戶標成 TEST（資料庫加 `test` 種類） | MIG 新 `0175_organizations_kind_test.sql`＋`.down.sql`；NA `lib/entitlements/subject.ts`、`tables.ts`、`wp-customers.ts`、`lib/payments/sites.ts`、`app/(shell)/ops/clients/[slug]/page.tsx`、`staff-grant-outcome.ts`＋相關 test | **High** | Opus | — | 2 | 已併（0175 已套用） |
| K5 | app 與各產品子網域換成同一個外框與左欄 | NA `app/ProductDoorShell.tsx`、`app/(shell)/layout.tsx`、`app/DoorNav.tsx`、`app/SidebarNav.tsx`、新 `app/PlatformFrame.tsx`、`app/NavRail.tsx`＋test | Medium | Opus | K4 | 3 | 已併 |
| U4 | 員工在產品子網域也能搜尋客戶 | NA `lib/portal/doors.ts`、`lib/portal/staff-tools.ts`、`app/api/ops/org-search/route.ts`、`lib/portal/__tests__/doors.test.ts`、`staff-tools.test.ts`、`registry-code.test.ts`、新 `lib/__tests__/middleware-staff-door-api.test.ts` | **High** | Opus | K3 | 3 | 已併 |
| U21 | 工具卡片元件（三種密度） | 新 NA `components/portal/ToolCard.tsx`、`ToolGrid.tsx`＋test | Low | Sonnet | U6 | 3 | 已併 |
| W1 | app 提供 WordPress「我的帳號」要畫的產品摘要 | 新 NA `app/api/auth/wp-summary/route.ts`＋test；`lib/auth/sources/awarewave-wp.ts`＋其 test | **High** | Opus | U6、U7 | 3 | 已併 |
| U5 | 員工替客戶操作時，按鈕顯示的是該客戶的開通狀態 | NA `app/api/entitlements/features/route.ts`、新 `app/api/entitlements/features/__tests__/route-org.test.ts`、`lib/entitlements/use-paid-features.ts`、`lib/entitlements/can.ts`（`verdictOf` 多回 `source`）、`lib/entitlements/features.ts` | **High** | Opus | K4、U6 | 4 | 已併 |
| K7 | 寫文章頁改用客戶欄挑網站，拿掉兩個下拉；補：查單一網站網路失敗要顯示「載入失敗」（`ClientContextProvider.tsx` 單站查詢） | NA `app/(shell)/tools/content/ContentStudio.tsx`、`__tests__/ContentStudio.site-wiring.test.tsx`；刪 `lib/content/pick-initial-site.ts`＋test | Medium | Opus | K3、K5 | 4 | 已併 |
| K8 | 題目、五步驟改用客戶欄；刪「題目›客戶」頁 | NA `app/(shell)/tools/content/topics/*`、`app/content/topics/DoorTopicsBoard.tsx`、刪兩個 `topics/clients/page.tsx`、`lib/portal/products.ts`、`app/sidebar-sections.ts` | Medium | Opus | K3、K5 | 4 | 已併 |
| K9 | 網站頁只列目前客戶的網站 | NA `app/(shell)/tools/content/sites/SiteManager.tsx`、`sites/page.tsx`、`app/content/sites/page.tsx`、`sites/__tests__/SiteManager*` | Medium | Sonnet | K3、K5 | 4 | 已併 |
| K6 | 伺服器不再「沒指定網站就拿第一個」 | NA `lib/content/wp-sites.ts`＋其 tests | **High** | Opus | K7 | 5 | 已併 |
| K10 | 客戶頁每個網站都能改；客戶首頁列出有問題的客戶 | NA `app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx`、`app/(shell)/ops/clients/page.tsx` | Medium | Sonnet | K2、K7 | 5 | 已併 |
| K11 | 從 app 開影片工作台會帶著目前客戶 | NA `app/(shell)/tools/video/{OpenWorkbench,WorkbenchEntry,ScriptForge,ReleaseDeliveryPanel}.tsx`、`app/video/(door)/handoff/*`、`app/video/(wb)/review-release/*`＋tests | Medium | Opus | K3、K5、U4 | 5 | 已併 |
| U3 | 客戶欄上方的類別按鈕；補：產品門上的「AwareWave 自己」列（由 org-search 回傳內部組織標記，門上不讀 service-role；K5 `PlatformFrame.tsx` 門上傳 `internalOrgId: null`） | NA `app/api/ops/org-search/route.ts`、`route.test.ts`、`app/ClientRail.tsx`＋test | Medium | Opus | K4、U4；操作者答 Q1 | 5 | 已併 |
| K12 | 影片工作台收到別的客戶時跳確認窗再切；補：做完後刪 `OpenWorkbench.tsx` 的 `VW_IGNORES_ORG_UNTIL_K12` 與那行提示 | VW `scripts/index-1.js`、`scripts/organization-picker.js`、`tests/` 新 cjs | **High** | Opus | K11 | 6 | VW 已部署（63cf3acba）；待正式站實點確認窗後併 NA `3b942fe09`（刪提示） |
| U8 | 會員登入後第一頁改成「我的工作台」；補：分類顯示名從 `ToolCard.tsx:24-26` 移到 `catalog-vocab.ts` | NA `app/portal/launcher/page.tsx` | Medium | Sonnet | U6、U7、U21 | 6 | 已併 |
| U9 | 「尚未開通」頁多一顆「了解這個產品」 | NA `app/PlatformFrame.tsx`（K5 後未開通分支所在檔） | Low | Sonnet | K5 | 6 | 已併 |
| U10 | 會員的「點數與合約」頁 | 新 NA `app/portal/wallet/page.tsx`＋test | Medium | Sonnet | U7 | 6 | 已併 |
| U12 | 頁面名稱＝左欄名稱＝標題的檢查器 | 新 NA `lib/portal/__tests__/page-names.test.ts`；非內容產品頁的 `metadata`／`h1`（不改 `products.ts`、不改 content） | Low | Sonnet | K7、K8 | 7 | |
| U23 | 埋點基礎（挑客戶、被擋、登入成功） | NA `lib/analytics.ts`、`app/posthog-analytics.tsx`、`app/api/ops/analytics-context/*` | Low | Sonnet | — | 7 | |
| M2 | 合約能記「我們代操」 | MIG 新 migration（`organization_product_subscriptions.operated_by`）＋down；NA `lib/entitlements/contracts.ts`、`app/(shell)/ops/clients/[slug]/BillingTab.tsx`＋test | **High** | Opus | M1 | 7 | |
| M11 | aware-wave.com 進門照產品的登入來源清單 | NA `lib/auth/sources/awarewave-wp.ts`＋test、`lib/portal/products.ts`（`loginSources`） | **High** | Opus | W1、K8、U22 | 7 | |
| U11 | 內容入口重排：拆頁、改名、刪功能清單、下拉改按鈕 | NA `lib/portal/products.ts`（content 列）、`app/content/*`、`ContentStudio.tsx`、`app/sidebar-sections.ts`、`app/NavRail.tsx`（刪「功能」清單） | Medium | Opus | K5、K7、K8、U12、M11 | 8 | |
| W2 | 外掛「我的帳號」改畫 app 給的摘要（併 W3、W4）；補：啟用外掛前先在 Cloudflare 對 `/api/auth/wp-summary`、`/api/auth/wp-handoff` 加限流（NA 無既有入站限流；改正式站安全設定，先問操作者） | PL `includes/MyAccountDoors.php`、新 `includes/Summary.php`、`tests/*` | Medium | Sonnet | W1 | 8 | |
| M3 | 由合約自動算出「產品／方式」標籤與 TEST | 新 NA `lib/entitlements/member-tags.ts`＋test；`app/api/ops/org-search/route.ts`＋`route.test.ts`（類別改用它） | Medium | Sonnet | M1、M2、U3 | 8 | |
| U13 | 5 組對比不足的顏色修正；補：兩個主題檔的 import 改指 `app/sidebar-sections` 後刪 `app/SidebarNav.tsx`（K5 暫留的 re-export）；加 `.badge-blue` 後換掉 `ToolCard.tsx` 行內 token | NA `app/globals.css`、`lib/theme/tokens.ts`＋檢查器 | Low | Sonnet | 先與主題 session 協調 | 8 | |
| U14 | 手機底列；補：員工後台手機寬 375 客戶欄把內容擠到 0 寬（`.sidebar` 固定 248＋客戶欄 220）；內容門手機直排時客戶欄不撐滿、內容在一屏以下 | NA `app/PlatformFrame.tsx`、`app/globals.css` | Low | Sonnet | U9、U13；先與主題 session 協調 | 9 | |
| W5 | 本機 WordPress＋app 走一遍，寫成可重跑腳本（G9） | 新 `scripts/local-member-flow.ps1`（路徑展開時確認） | Low | Sonnet | W1、W2 | 9 | |
| K13 | 檢查器：頁面不得私藏客戶來源 | 新 NA `lib/client-context/__tests__/no-private-context.test.ts` | Low | Sonnet | K7–K11 | 9 | |
| M5 | 員工替既有客戶代辦會員（app 端） | MIG 新 migration（待驗證的會員邀請）；NA `lib/entitlements/wp-customers.ts`、`lib/entitlements/identities.ts`、`app/api/ops/clients/[slug]/accounts/route.ts`、`app/(shell)/ops/clients/[slug]/AccountsCard.tsx`＋tests | **High** | Opus | M1、K10 | 9 | |
| K14 | 新增產品入口零手改的驗收測試；補：collect／outreach／design 自己的挑客戶清單（org-search 不帶 category）仍列出 TEST 單位，換成客戶欄後消失 | 新 NA `lib/client-context/__tests__/new-door.test.ts` | Low | Sonnet | K5、K13 | 10 | |
| M6 | 代辦（外掛端）：會員驗證 email 後才連上 | PL 新 `includes/MemberInvite.php`、主檔註冊、`tests/*` | **High** | Opus | W2、M5 | 10 | |
| M8 | 轉移會員（換單位管理者） | MIG 新 migration（轉移函式）；NA 新 `app/api/ops/clients/[slug]/member-transfer/route.ts`、`AccountsCard.tsx` | **High** | Opus | M5 | 10 | |
| K15 | 目前客戶期末閘＋P1 驗收 | 無程式；WORKLOG、本檔狀態欄 | — | Opus | 全部 K | 11 | |
| M10 | WordPress 刪會員／改 email 時 app 跟著知道 | PL 新 `includes/MemberEvents.php`、主檔註冊；NA 新 `app/api/webhooks/awarewave-wp-member/route.ts`、`lib/entitlements/identities.ts` | **High** | Opus | M5、M6 | 11 | |

### P2（開放註冊前；P1 全部併完後才排批、展開）

| 卡 | 白話 | 檔案 | 風險 | 模型 | 依賴 | 批 | 狀態 |
|---|---|---|---|---|---|---|---|
| W6 | 正式站重開店外掛與兩把密鑰（＝G8） | 正式站設定與 `seller_sites` 資料（非程式） | **High** | Opus＋操作者 go | W5 | P2 | |
| M9 | aware-wave.com 關掉訪客結帳（G6） | 正式站 WooCommerce 設定（非程式）；NA 無 | **High** | Sonnet（`wordpress-maintenance-agent` 備份閘） | — | P2 | |
| M4 | 標籤寫進 FluentCRM、WordPress 加 TEST 角色（G3 寫入端） | 沿用既有 NA `lib/crm/fluentcrm.ts`＋wp-bridge `lobster-factory/packages/wp-bridge-plugin/includes/Crm/ContactUpserter.php`（加標籤寫入，不新建接頭）；TEST 角色註冊位置展開時定 | **High** | Opus | M3、W6 | P2 | |
| M7 | 既有客戶逐一代辦成會員（G2） | 無程式；操作紀錄 | **High** | Opus＋操作者 | M5、M6、W6 | P2 | |
| W7 | 真人走查：註冊→付款→進入→扣點；補：用測試會員實看 `/portal/launcher`（U8）與 `/portal/wallet`（U10，管理者與被授權的人各一次） | 無程式；走查紀錄 | Medium | 操作者 | W6、M5、M6、M8、M9、M10 | P2 | |
| U16 | 內容概覽首頁 | NA `app/content/page.tsx` | Medium | Sonnet | U11 | P2 | |
| U17 | 工作台「繼續上次」 | NA `app/portal/launcher/page.tsx` | Medium | Sonnet | U8 | P2 | |
| U18 | 頂列搜尋 | NA `app/PlatformFrame.tsx`、新搜尋元件 | Low | Sonnet | K5、U22 | P2 | |
| U19 | 客戶自己授權他人（＝G4） | 新 NA `app/portal/people/*`、新 API | **High** | Opus | M5 | P2 | |
| U24 | 最近使用／常用 | 新 NA `app/api/portal/recent/route.ts`；可能 migration（索引） | **High** | Opus | U8 | P2 | |
| U25 | 功能層分類欄位＋資料填寫 | NA `lib/portal/products.ts`、`catalog-vocab.ts`、匯入腳本 | Medium | Sonnet＋Haiku 填值 | U22 | P2 | |
| U26 | 登記表匯出 `catalog.json` | 新腳本＋test | Low | Sonnet | U25 | P2 | |
| U28 | 付款後立即失效功能清單快取 | NA `lib/entitlements/features.ts`、付款事件處理 | Medium | Sonnet | U5 | P2 | |

### P3（開放註冊時與之後；B §17.3）

| 卡 | 白話 | 檔案 | 風險 | 模型 | 依賴 | 批 | 狀態 |
|---|---|---|---|---|---|---|---|
| U20 | 收藏 | 新表＋API＋`ToolCard` ★ | **High** | Opus | U21 | P3 | |
| U29 | 公開面：首頁、全部工具、分類、介紹頁 | WordPress（`wordpress-plugin-expert`） | Medium | Sonnet | U26、W7 | P3 | |
| U30 | 搜尋無結果表單與彙整 | WordPress＋營運流程 | Low | Sonnet | U29 | P3 | |
| U31 | 100+ 工具的清單容器 | 新元件 | Low | Sonnet | U25 | P3 | |
| U32 | AI 智慧搜尋（有門檻） | `lib/ai/gateway.ts` 縫 | Medium | Opus | B §4.8 門檻 | P3 | |
| U33 | 啟用免費／免登入 | B §8.2 R1 | Medium | Opus | 操作者決定 | P3 | |
| U34 | 啟用方案分級與功能額度 | B §8.2 R2、R3 | **High** | Opus | 操作者決定 | P3 | |
| U35 | 買斷安裝卡片 | 新資料與卡片 | Medium | Opus | ADR 017 §5 | P3 | |

## 2. 併卡與缺口去處

| 來源 | 去處 |
|---|---|
| B U1（外框＋選單合併） | 併入 K5 |
| B U2（客戶欄） | 本體併入 K4；類別列＝U3 |
| B U15（`?org` 帶入連結） | 同主機併入 K5；跨網域併入 K11 |
| B W3、W4 | 併入 W2（同檔 `MyAccountDoors.php`） |
| B W8（ADR 021 記 G13、G7 關閉） | 不是卡：G13 已寫進 C `:53`；關閉時照 §7 更新 C |
| A U3、U4、U5 | 定義在 A §4；B §17.2 只留指標 |
| C G1 代辦 | M5（app）＋M6（外掛） |
| C G2 既有客戶無會員連結 | M7 |
| C G3 標籤／TEST 角色／代操經銷記法 | M2（代操記法）＋M3（標籤函式；經銷由既有 `<產品>.resell` 列推出，不改 DB）＋M4（寫入 FluentCRM、WordPress TEST 角色） |
| C G4 客戶自己授權他人 | U19 |
| C G5 轉移會員 | M8 |
| C G6 訪客結帳開著 | M9 |
| C G7 登入頁叫人去 aware-wave.com 卻沒進入鈕 | W2＋W6 |
| C G8 四個開關關著 | W6 |
| C G9 本機整套測試 | W5 |
| C G10 WordPress 刪會員／改 email | M10 |
| C G11 aware-wave.com 不看 `loginSources` | M11 |
| C G12 測試單位無標記 | M1 |
| C G13 「進入」清單來自訂單 | W2 |

## 3. M 卡（ADR 021 缺口拆卡）

既有資料（2026-11-22，C `:52`、現況報告）：`organizations` 8 列＝1 internal（`awarewave-ops`）＋7 customer，其中 `e2e-verify-0704-5c1356`、`test-wp-webhook-co-c705c6` 是測試單位；`customer_identities` 2 列測試資料，與 WordPress id 對不上；`customer_identities` 不可改（`MIG 0124_customer_identities.sql:2`；service_role 只有 select、insert，`:33`）。

| 卡 | 做什麼 | 要刪／要改的舊程式 | 既有資料怎麼相容 | 驗收 | 風險 | 先後 |
|---|---|---|---|---|---|---|
| M1 | `organizations.kind` 加 `test`（角色層 TEST，C D3） | 約束 `MIG 0110_plans_entitlements.sql:36-37`；三個 DB 函式把 `kind = 'customer'` 改成 `kind in ('customer','test')`，各取最新定義：`billing_apply_payment_event`（`0148_credit_call_holds.sql:125`，檢查在 `:167`）、`entitlement_staff_account`（`0143_entitlement_staff_grants.sql:19`，`:23`）、`seller_root_account_check`（`0133_seller_sites.sql:38`，`:44`）；`billing_ledger` 的 `unused_units` 只算 customer（`0148:568-569`）**保留**＝測試點數不算負債。app：`subject.ts:7`、`tables.ts:122,152` 型別加 `"test"`；`wp-customers.ts:45,95`、`payments/sites.ts:39`、`[slug]/page.tsx:176`、`staff-grant-outcome.ts:55` 的 `=== "customer"` 改「非 internal 的根帳戶」同一判斷；`subject.ts:71` 已把非 internal 當 customer 計費，不改 | migration 內 `update organizations set kind='test' where slug in (兩個 slug) and kind='customer'`（找不到不報錯，本機庫可能沒有）；其餘 6 列不動；2 列 identities 不動 | 本機庫 up→down→up 綠；三個函式對 test 單位與 customer 單位行為相同（SQL 測試或 psql 實跑）；`npx tsc --noEmit` 綠；併 main 後 `ssh … psql -c "select slug,kind from organizations order by kind"` 恰 2 列 test | **High**（migration＋金流函式） | 無前置；M2、M3 依它 |
| M2 | 合約記「我們代操」（C 軸預設值，不是五種方式的 enum，ADR 017 `:227`） | 新欄 `organization_product_subscriptions.operated_by text not null default 'customer' check (operated_by in ('customer','awarewave'))`；NA `lib/entitlements/contracts.ts` 讀寫；`BillingTab.tsx` 員工切換鈕。「經銷」不改 DB：由有效的 `<產品>.resell` 權利列推出（`can.ts:120-129`）；「買斷」等 U35 | 既有列全為 `customer`（預設值）；Soulful 內容行銷由員工在介面切成代操，不在 migration 猜。**開工先查**（`ssh` 唯讀 psql）：Soulful 的 content 是否有 `organization_product_subscriptions` 列；沒有 → 停下回報（代操要記在哪需重定） | up／down 綠；切換鈕寫入後重讀一致；客戶身分呼叫寫入 → 403 | **High**（migration） | M1 後；M3 依它 |
| M3 | 標籤函式：由 kind＋合約＋權利列算出角色、成對「產品／方式」、方式標籤 | 新 NA `lib/entitlements/member-tags.ts`（純函式）；`org-search` 類別改用它，補 代操／經銷／TEST（TEST 預設隱藏） | 只讀；無資料改動 | 表格驅動測試：C `:34` 兩例（Soulful＝客戶；內容行銷／代操、內容行銷／訂閱；經銷商＝客戶；影片／經銷）＋TEST＋internal＝Admin | Medium | M1、M2、U3 後 |
| M4 | 標籤寫進 FluentCRM（`crm: fluentcrm \| none`，ADR 017 §0b 第 5 條）；WordPress 加 TEST 角色 | 沿用 `lib/crm/fluentcrm.ts` 與 wp-bridge `Crm/ContactUpserter.php`，加標籤寫入；寫入只單向（app→WordPress）；改 wp-bridge 要升 `AWBRIDGE_VERSION` 並走 `scripts/release-wp-bridge.sh` | 首次全量同步 8 單位；手改過的標籤被覆蓋（C D3「不手改」） | 本機 WordPress 先跑；正式站同步後抽查 2 單位 | **High**（正式站 WordPress） | M3、W6 後（P2） |
| M5 | 代辦（app 端）：員工在客戶頁對既有單位發起，記一筆待驗證邀請（單位、聯絡人 email、一次性碼、期限）；照 `lib/accounts/client-invite.ts:1-9` 的「帳號只給已證明的 email」同型做法，不另造驗證流程 | 新表（migration）；`wp-customers.ts:169,177-190` 的「email 不符就新建 `wp-member-<id>`」改為：有對應邀請 → 連到邀請的單位；沒有 → 照舊；`AccountsCard.tsx` 加發起鈕 | 既有 2 列 identities 不動；既有付款路徑行為不變（無邀請時） | 有邀請＋email 已驗證 → 寫一列 identities 到指定單位、不新建單位；邀請過期／email 不符 → 拒；突變：拿掉「email 已驗證」檢查 → 測試紅 | **High**（身分連結＋migration） | M1、K10 後 |
| M6 | 代辦（外掛端）：會員從邀請連結註冊或登入、驗證 email 後，外掛把一次性碼隨簽章事件送回 app | PL 新 `includes/MemberInvite.php`、主檔註冊 | 沒帶碼的會員行為不變 | 外掛單元測試（沿用 `tests/BillingFakes.php`、`stubs/`）；W5 腳本走一遍 | **High** | W2、M5 後 |
| M7 | 既有客戶（Soulful 等）逐一代辦成會員（G2） | 無程式 | 2 列測試 identities：屬 TEST 單位者保留；其餘列出給操作者決定 | 每個 active 客戶單位有一列 identities | **High**（正式資料） | M5、M6、W6 後（P2） |
| M8 | 轉移會員（換管理者／聯絡人離職，C D5） | 新 security definer 函式（刪舊列＋寫新列＋稽核，同一交易；identities 本身仍不給 update）；新路由＋`AccountsCard.tsx` 按鈕 | 既有列只在轉移時被替換 | 轉移後舊帳號失去管理者、新帳號取得；稽核一列；非 owner／admin 員工 → 403 | **High** | M5 後 |
| M9 | aware-wave.com 關訪客結帳（G6） | 正式站 WooCommerce 設定；先 `wordpress-maintenance-agent` 備份閘 | 已存在的訪客訂單不動 | 訪客結帳頁要求登入；登入後結帳照常 | **High**（正式站） | P2 |
| M10 | WordPress 刪會員／改 email → 簽章事件 → app 標記或拒 | PL 新 `includes/MemberEvents.php`；NA 新 webhook 路由、`identities.ts` | 既有會員無事件即無變化 | 刪除事件後該 identities 不再能進門（`wp-handoff` 回 `not_a_member`）；改 email 事件記稽核、不改 identities | **High**（auth） | M5、M6 後 |
| M11 | aware-wave.com 也照 `loginSources` 進門（G11） | `awarewave-wp.ts:75-80` 的例外刪掉（現只檢查 `customer-wp`）；`products.ts` 其餘 8 列（`:54,59,65,72,81,86,90,97`）的 `loginSources` 加 `"awarewave-wp"`（現只有 `:43,46,49` 三列有） | 行為對 aware-wave.com 不變（今天全開，加完清單仍全開）；之後新產品要明寫才開 | 每個 served 門 `wp-handoff` 照舊 200；把某門的 `awarewave-wp` 拿掉 → 403 `login_source_not_allowed`（突變一次）；`products.test.ts` 綠 | **High**（登入通道） | W1、K8、U22 後 |

M11 的依據：`awarewave-wp.ts:75-77` 註明「是否照清單是操作者的決定」；操作者 2026-11-21／22 定「會員從 aware-wave.com 登入，按『進入』到各產品」（`README.md` §2），所以清單全開、改為照清單判斷，行為不變。

## 4. 批次（每批最多 4 張同時做；下一批等上一批全部併入或明確擱置）

| 批 | 卡 | 上線後使用者看得到什麼 | 怎麼驗收 | rollback |
|---|---|---|---|---|
| 1 | K1、K2、K3、U6 | 沒有畫面變化（文件、純函式、API 多兩個選填參數；灰掉按鈕的提示文字來源換成一個函式，字一樣） | 各卡 TESTS 行重跑；`curl -s "https://app.aware-wave.com/api/ops/org-search"`（員工 cookie）回應形狀與改前相同 | 各卡單獨 `git revert` |
| 2 | K4、U7、U22、M1 | 沒有畫面變化（客戶欄尚無頁面登記；新 API 尚無頁面呼叫；登記表多欄位）；M1 併後兩個測試單位在資料庫標為 test | K4 render 測試；U7 對客戶身分只回本單位；`products.test.ts`；M1：psql 查 2 列 test | revert；M1 跑 `.down.sql`（High，操作者 go） |
| 3 | K5、U4、U21、W1 | app 與產品子網域左欄換成同一個元件，外觀不變；選單連結會帶著網址上的 `?org=` | 開 `app.aware-wave.com/tools/outreach?org=<id>` 點「工具串接」→ 網址仍有 `org`；開 `content.aware-wave.com`（員工）左欄與改前截圖相同；U4 middleware 測試；W1 測試（外掛仍停用，正式站不受影響） | revert 單卡 |
| 4 | U5、K7、K8、K9 | 寫文章、題目、五步驟、網站四頁左側出現客戶欄；頁內挑網站的下拉與「題目›客戶」頁消失；員工沒選客戶時頁面請先選 | 員工開 `/tools/content` → 客戶欄可搜尋、選了網址出現 `org`、`site`；舊連結 `/tools/content?siteId=<id>` 進來網址變 `?org=&site=`；客戶帳號在 content 子網域看不到客戶清單 | revert 單卡；K8 revert 會恢復選單項 |
| 5 | K6、K10、K11、U3 | 客戶頁每個網站都能改；`/ops/clients` 首頁列出有問題的客戶；從 app 開影片工作台帶著客戶；客戶欄上方出現類別鈕 | 不帶 siteId 呼叫 `/api/content/categories`（員工）→ 404；多站客戶頁每站一塊；從 `/tools/video?org=<id>` 開 VW 的網址含 `org` | revert 單卡；K6 revert＝恢復取第一站 |
| 6 | K12、U8、U9、U10 | 影片工作台遇到別的客戶跳確認窗；會員登入後是「我的工作台」（已開通在上、點數與合約在右）；「尚未開通」頁多「了解這個產品」；新增「點數與合約」頁 | 在 VW 帶不同 `org` 開 → 確認窗、取消不切；客戶測試帳號登入 portal 看工作台三狀態（載入、失敗重新整理、空） | K12 revert＋VW 重新部署；其餘 revert |
| 7 | U12、U23、M2、M11 | 部分頁面標題改成與左欄同名；員工在客戶頁「帳務」可標「我們代操」 | 頁名檢查器綠；M2 切換後重讀一致；M11：每個門 `wp-handoff` 本機測試 200 | revert；M2 down（High） |
| 8 | U11、W2、M3、U13 | 內容入口改版：左欄「寫文章／改寫／草稿／題目／我的網站／節日行事曆」、第一屏只有關鍵字、標題、生成；「功能」清單消失；按鈕顏色略深（U13） | 手機寬開 content 第一屏看得到「生成」；左欄＝`h1`＝`<title>`；外掛單元測試（外掛仍停用）；類別鈕多「代操／經銷」；對比 5 組 ≥ 4.5:1 | revert 單卡；U13 需同時確認 DB 主題沒覆寫舊值 |
| 9 | U14、W5、K13、M5 | 手機底列；員工在客戶頁「帳號」可對既有客戶發起代辦（外掛端未做，只會建立待驗證邀請） | ≤ 640px 底列 4 項、每項 ≥ 44px；W5 腳本本機跑完；K13 突變紅→綠；M5 測試 | revert；M5 down（High） |
| 10 | K14、M6、M8 | 員工可轉移會員；外掛端代辦（外掛仍停用，正式站無變化） | K14 T1–T6；M6 外掛測試＋W5 腳本含代辦；M8 轉移測試 | revert；M8 down（High） |
| 11 | K15、M10 | 沒有新畫面；P1 期末驗收 | K15 清單全過；M10 本機刪會員後 `wp-handoff` 回 `not_a_member` | revert |

P2、P3：P1 全部併入後，監工依 §1 依賴排批（同樣每批 ≤ 4、檔案不重疊），展開派工單後再派。

## 5. 第一批派工單（全文，可直接貼給工人）

每張都附這段共同開頭：
> 你是 AwareWave 工程師。在監工給你的 git worktree 與分支上工作，只 commit 到該分支，不推 main、不部署、不碰正式站。先 `git log --oneline -5 -- <你的檔案>`。只跑本卡點名的測試；不做無效益測試：只寫卡片點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。`.ts` 改完 `npx tsc --noEmit`（在 NA 目錄）。交回只要三行：`FILES:`、`TESTS:`（指令與通過數）、`RISKS:`。回報操作者一律繁體中文。

### K1 — ADR 020「目前客戶」（Sonnet）

- **問題陳述**：ADR 編號 020 被保留給「目前客戶」規則（`agency-os/docs/architecture/decisions/ADR_INDEX.md:49` 末句），但檔案不存在（`decisions/` 只有 `019-staff-tool-grants.md`、`021-membership-model.md`）。全系統傳「目前客戶」的方法至少八種（A §2 F2）。
- **已知事實**：規則正本＝A（`agency-os/handoffs/2026-11-22-platform-membership-ux/CLIENT-CONTEXT-PLAN-20261121.md`）§3a 全表、§3b（含「產品門上員工換客戶」6 點）、§3d（VW cookie 是唯一例外）、§4c 排除表。ADR 版式照 `021-membership-model.md`：標題、狀態／日期／承接、§1 決定表（每列附來源）、§2 規則、§3 沒選的做法。狀態寫「已接受（操作者 2026-11-22：側欄客戶欄、產品子網域員工可換客戶），實作中：卡見 DISPATCH.md」。ADR_INDEX 列格式照 `:48`（三欄：連結｜一句話｜日期）。
- **已排除**：新增全站共用 cookie；資料庫存每人目前客戶；頂部客戶挑選列；middleware 加新標頭；feature flag；`DEPLOY_HOLD`。這些寫進 ADR 的「沒選的做法」，不要重新評估。
- **預期輸出**：新 `agency-os/docs/architecture/decisions/020-client-context.md`（只寫規則與一句理由，表格優先；不抄 A 的盤點與卡）；`ADR_INDEX.md` 在 019 與 021 之間加 020 列，並刪掉 021 列末句「020 保留給「目前客戶」規則。」。驗證 `node scripts/verify-governance-pointers.mjs`（在 `D:\Work` 根目錄）退出碼 0。交回 `FILES:`／`TESTS:`／`RISKS:`。
- **邊界**：只動這兩檔。不改 A、B、ADR 021、AGENTS.md。不跑 `register-new-governance-doc.ps1`（監工併入時跑）。

### K2 — 契約純函式（Sonnet）

- **問題陳述**：「沒指定就拿第一個」與「網址參數名不一」散在各頁：`TopicsBoard.tsx:159`（預設 `rows[0]`）、`lib/content/pick-initial-site.ts:23`、`lib/content/wp-sites.ts:123-126`；參數名 `?org`／`?slug`／`?brand`／`?siteId`／`?site` 混用（A §1a）。需要一個所有頁共用、可單元測試的判斷。
- **已知事實**：規則逐列在 A §3a。識別符一律 uuid。客戶帳號的單位來自 session（`x-ops-org-id`，`lib/tenant-guard.ts:193-205`）；內部組織 `kind='internal'`（`lib/entitlements/subject.ts:43-49`）。白牌主機綁定（②）尚未實作，今天恆為 null，但函式要能處理。網站列含 `organization_id`（`app/api/content/sites/route.ts:91`）。瀏覽器端不得 import `lib/portal/hosts.ts`（A §3a「主機」）。
- **已排除**：cookie、localStorage、資料庫保存目前客戶；空 org 代表自用；mismatch 時退回第一個網站。
- **預期輸出**：新 NA `lib/client-context/contract.ts`（無 React、無 fetch、無 `process.env`），匯出：`PARAM = { org: "org", site: "site" }`；`type Layer`（`"org"` 或 `"site"`）；`normalizeQuery(sp: URLSearchParams)` 回 `{ org, site, legacy }`（`siteId` 轉 `site`；非 uuid 視為 null；`legacy`＝網址要改寫）；`decide(input)`，input 含 `viewer`（`"staff"` 或 `"client"`）、`sessionOrg`、`hostOrg`、`internalOrgId`、`query {org, site}`、`sites`（該客戶網站列，null＝未載）、`siteLookup`（只給 site 時查回的那一列、`"not_found"`、`"forbidden"` 或 null）、`layer`；回 `{ status, orgId, siteId, rewrite }`，status 為 `ok`／`unselected`／`rejected`／`site_mismatch`／`not_found`／`forbidden`／`loading`，`rewrite`＝網址該改成的 `{org, site}` 或 null；`withContext(href, {org, site})`（保留 href 原有 query 與 hash，只加或換 `org`、`site`）；`ORG_DEPENDENT_PARAMS = ["site","topic","month"]`。新 `lib/client-context/__tests__/contract.test.ts`：A §3a 每一列至少一案——①②不同 → rejected；客戶帳號帶他人 org／site → rewrite 移除；員工空 org → unselected（不得回 internal）；選內部 id → ok；客戶可見網站恰 1 → 自動選並 rewrite；只給 site → 由 `siteLookup.organization_id` 推 org；site 不屬 org → site_mismatch 且 siteId 為 null；`siteId` 轉 `site`；`withContext` 對絕對網址與相對網址都對。指令：`npx vitest run lib/client-context/__tests__/contract.test.ts`。
- **邊界**：只新增這兩檔；不改任何既有檔、不接到任何頁面（K4 才接）。

### K3 — 兩支既有 API 加篩選（Sonnet）

- **問題陳述**：客戶欄要能「網址指定的客戶不在第一頁也顯示」與「只抓某客戶的網站」。現況 `app/api/ops/org-search/route.ts:39-46` 只回前 `NAV_FIRST`（50）列或搜尋結果；`app/api/content/sites/route.ts:48-53` 讀整表再在 `:74` 用 `canAccessOrg` 過濾，沒有 org 篩選。
- **已知事實**：「include 補一列」已有同型先例 `app/api/video/workbench/bootstrap/route.ts:43-45`（uuid 檢查、不在清單才補、`.eq("id", include).maybeSingle()`）。org-search 只回 `ORG_SEARCH_COLUMNS`（`route.ts:16`），既有 `route.test.ts` 鎖這點。組織表讀取必須有界（`lib/__tests__/organizations-bounded.test.ts`）。sites 的租戶規則：`effectiveOrgId(req, requested)`（`lib/tenant-guard.ts:193-216`）客戶一律回自己的 org、員工回 requested（非法 uuid 丟 `OrgAccessError`）。org-search 歸格 `lib/portal/staff-tools.ts:20`，本卡不改。
- **已排除**：新開路由；把客戶清單放 `PLATFORM_APIS`；改 API 參數名；改 `ManagedSite` 欄位。
- **預期輸出**：org-search：`?include=<uuid>`，合法 uuid、不在本次結果、`status <> 'inactive'` → 以同一組欄位補一列在最前；非 uuid 忽略；有 `q` 時也適用。sites GET：`?organizationId=<uuid>` 經 `effectiveOrgId` 後 `.eq("organization_id", …)`（客戶帶他人 id 仍只得自己的）；`?siteId=<uuid>` 加 `.eq("id", …)`，回 0 或 1 列（仍經 `canAccessOrg`）；非法 uuid → 400 `{ok:false,error:"invalid_id"}`；env 後備路徑同樣套用兩個篩選；不帶參數時回應與今天相同。測試：`route.test.ts` 加 include 三案（補列、已在不重複、非 uuid 忽略）；新 `app/api/content/sites/__tests__/sites-filters.test.ts`（員工依 org 篩、客戶帶他人 org 只得自己、siteId 單站、非法 400、無參數不變）。指令：`npx vitest run app/api/ops/org-search app/api/content/sites lib/__tests__/organizations-bounded.test.ts lib/portal/__tests__/staff-tools.test.ts`。突變一次：拿掉 sites 篩選裡的 `effectiveOrgId` → 「客戶帶他人 org」案紅，還原綠（寫進 TESTS 行）。
- **邊界**：只動上列 4 檔。不改 `staff-tools.ts`、`doors.ts`、`middleware.ts`、POST／PATCH、任何頁面。

### U6 — 權益標籤只由一個純函式決定（Sonnet）

- **問題陳述**：灰掉按鈕的原因文字是 `lib/entitlements/use-paid-features.ts:18` 的兩條字典 `WHY`，其餘狀態一律「目前無法使用」（`:34`）；藍圖要求所有畫面（工具卡、工作台、外掛摘要、按鈕提示）用同一組詞（B §7.1、§8 S1–S18、R1–R3、S17）。現在沒有這個函式，各處會各寫一份。
- **已知事實**：功能清單每項只有 `{ allowed, verdict, reason }`（`lib/entitlements/features.ts:17`）；`allowed`＝按鈕現在能不能按（shadow 恆真），`verdict`＝enforce 會怎麼答。`reason` 值：`no_entitlement`、`no_credits`（`can.ts:254` 由 `no_active_entitlement`、`insufficient_credits` 換名）、`back_office_only`（`:262`）、`invalid_subject`（`:264`）、`unknown_feature`（`:266`）、`infrastructure_error`（`:280`）。清單目前**沒有**「方案內／贈送／扣點」的來源欄（U5 才加 `source`）。既有文案要沿用：「尚未開通此功能」（`use-paid-features.ts:18`）、「點數不足。」（`lib/studio/image-errors.ts:3`）、S1／S12 文案（`app/ProductDoorShell.tsx:26-28,31`）。`why()` 的呼叫端有 `BannerStudio.tsx`、`ContentStudio.tsx`、`SeoCheckPanel.tsx`、`TarotStudio.tsx`、`ScriptForge.tsx`、`DoorNav.tsx`，簽章不得變。
- **已排除**：在元件裡各自判斷；新增顏色或色碼（只回 tone 名稱：green／blue／gray／yellow／red，對應既有 badge token，B §7.1 規則 ③）；方案分級、功能額度、不同費率（B §8.2 預留，只回「目前沒有」分支不顯示）。
- **預期輸出**：新 NA `lib/entitlements/right-label.ts`（純函式、無 React、無 import 伺服器模組），`rightLabel(input)`：input 含 `entry`（清單項，null＝讀不到）、`source`（`"contract"`／`"comp"`／`"credits"`／null＝未知）、`door`（`"open"`／`"not_held"`／`"unavailable"`）、`comingSoon`、`viewer`（`"manager"`／`"member"`／`"staff"`）、`mode`（`"shadow"`／`"enforce"`）、選填 `estimate`、`balance`、`endsAt`、`contractStatus`、`walletHold`、`emailUnverified`、`productName`、`featureName`；回 `{ code, label, text, action, tone }`，`code` 為 B §8 的 S 代碼或 null。規則：`allowed` 且 `source` 為 null → `label` null（今天沒有來源資料，不猜）；`no_credits` 有 `estimate`、`balance` → S7 完整句，缺數字 → 「點數不足。」；`viewer` 為 member 時 S7 的按鈕是「請通知單位管理者儲值」；staff 且 shadow → 另附 S15 小字；`back_office_only`／`.resell` 類 → 不顯示（回 null）。新 `lib/entitlements/__tests__/right-label.test.ts`：B §8 表每一列一個表格驅動案例（含 S16a–c、S18 文案）。`use-paid-features.ts`：刪 `WHY`，`why()` 改呼叫 `rightLabel(...).text`，回傳字串對 `no_entitlement`、`no_credits` 與今天相同。指令：`npx vitest run lib/entitlements/__tests__/right-label.test.ts lib/entitlements/__tests__/import-boundary.test.ts`。
- **邊界**：只動上列 3 檔。不改 `features.ts`、`can.ts`、任何頁面或元件、`globals.css`。

## 6. 監工每批交回後要做的事

1. 讀本檔 §1 該批列與 §4 該批列；確認交回三行齊全。
2. 讀 diff：`git -C D:\Worktrees\<卡號> diff main --stat` 與全文；檔案只能是 §1 該卡的清單（多出的檔＝退回，除非是該卡 test）。
3. 跑該卡 TESTS 行的同一指令（不跑全套）；`.ts/.tsx` 卡在 NA 跑 `npx tsc --noEmit`。
4. RISKS 逐項處理：當場修、實測證明無事、或寫明為何不處理（記 WORKLOG），不轉述。
5. critic 一個（`.claude/commands/review.md` 依風險選 tier）；High 卡加書面對抗自審＋卡內突變證據；Codex 2026-11-24 後改 `/codex-review`。
6. High 卡（K6、K12、U4、U5、W1、M1、M2、M5、M6、M8、M10、M11）：驗收過後**停下問操作者**「可以併 main 嗎」，附一句白話風險與 rollback；未獲 go 不併。
7. 併 main：`git -C D:\Work` 以 pathspec commit／cherry-pick 該卡 commit（AGENTS.md §8）；`agency-os/WORKLOG.md` 用 `scripts/git-partial-worktree-commit.py stage`；WORKLOG 四行證據（REALTEST／REVIEW／BUGHUNT／ORACLE）。
8. 更新本檔 §1 狀態欄；若卡完成觸發 §7 的文件行，同一 commit 更新。
9. 移除 worktree 前先 `rmdir` 其中的 junction（`node_modules` 等），再 `git worktree remove`。
10. 全批併完 → 展開下一批派工單（照 §5 五項格式，`file:line` 重新 grep），寫進本檔 §5 後再派；同時最多 4 個工人。
11. 夜間 03:00 部署後，隔天第一件事看部署結果（`reports/status/` 或 sg-deploy log）；某卡出事 → `git revert` 該卡 commit，記 WORKLOG。

## 7. 卡完成後要改的文件行

| 卡 | 要改 |
|---|---|
| K1 | A 頂部加「規則正本已移到 ADR 020」一句；A §3a 標題「（ADR 020 照抄此表）」改「（正本：ADR 020）」 |
| K4 | B §16 `ClientRail` 列「取代／沿用」補檔名 `app/ClientRail.tsx` |
| K5 | B §9.1「合併對象」段改為已完成；B §17.4 外框兩列標「已合併（K5）」 |
| U4 | B §0 第 9 列「員工在產品門呼叫客戶搜尋＝404」改為「僅客戶 403；員工照授權格」；A §2 F5、F16 標「已關（U4）」 |
| U5 | B §0 最後一列（員工功能清單用內部帳戶）改為「`?org=` 時用目前客戶」 |
| K6 | A §2 F6 標「已關」 |
| K7、K8 | A §2 F7、F8、F14 標「已關」；B §15A P9 標「K7 已刪」 |
| K13 | A §2 F12 標「已關」 |
| W2 | C §3 G13 列標「已關（W2）」；B §2A.2「缺口」列與 §17.4 `heldProducts()` 列改為已完成；補：啟用外掛前先在 Cloudflare 對 `/api/auth/wp-summary`、`/api/auth/wp-handoff` 加限流（NA 無既有入站限流；改正式站安全設定，先問操作者） |
| W5 | C §3 G9 標「已關（W5）」 |
| W6 | C §3 G8、G7 標「已關（W2＋W6）」；C `:3` 狀態改「部分實作」 |
| M1 | C §2 三層表「`test` 值未存在，G12」改為「已加（M1）」；C §3 G12 標「已關」；B §9.3 類別表 TEST 列改「是」 |
| M2、M3 | C §3 G3 標「部分已關（M2、M3）」；B §9.3 代操、經銷列改「是」；B 一頁結論 Q1 列補「代操／經銷已算得出」 |
| M4 | C §3 G3 標「已關」 |
| M5、M6 | C §3 G1 標「已關」；C §2「員工代辦（D4，未做）」改「已做」 |
| M7、M8、M9、M10、M11 | C §3 G2、G5、G6、G10、G11 依序標「已關」；M11 同時刪 `lib/auth/sources/awarewave-wp.ts:75-77` 的「操作者決定」註解（卡內做） |
| U19 | C §3 G4 標「已關」 |
| C 全部 G 關完 | C §3 末段「開放註冊的前置條件」改寫為已滿足＋W7 走查紀錄連結 |
| K15 | `README.md` §1、§4 更新狀態；本檔 §1 全部 P1 標「已併」 |

## 8. 需要操作者決定

| 題 | 擋哪張 | 沒答時 |
|---|---|---|
| 客戶欄「類別」用什麼分（B Q1；建議：合作方式＋需處理，TEST 預設隱藏） | 只擋 U3（第 5 批） | 照建議做 |
| 每張 High 卡併 main 前的 go | 該卡 | 不併 |

第 1 批不需任何決定。

## 9. 一致性檢查

- 檔案不重疊：每批 4 張卡的檔案清單已兩兩比對無重疊；同一檔出現在多張卡時一律分在有依賴的不同批（`org-search/route.ts` K3→U4→U3→M3＝批 1→3→5→8；`products.ts` U22→K8→M11→U11＝批 2→4→7→8；`ClientRail.tsx` K4→U3＝批 2→5；`use-paid-features.ts` U6→U5＝批 1→4；`PlatformFrame.tsx` K5→U9→U14＝批 3→6→9；`AccountsCard.tsx` M5→M8＝批 9→10；`wp-customers.ts` M1→M5＝批 2→9；`awarewave-wp.ts` W1→M11＝批 3→7；`globals.css` 只在 U13→U14＝批 8→9；外掛主檔 M6→M10＝批 10→11；migration 每批至多一張）。
- 依賴無循環：所有依賴都指向較早的批（§1「依賴」欄的每張卡批號都小於本卡；U3 的 Q1 是決定不是卡）；P2、P3 只依賴 P1 或同階段較前的卡。
- 每個缺口與舊卡都有去處：G1–G13 全在 §2（G4→U19、G7→W2＋W6、G8→W6、G9→W5、G13→W2，其餘→M1–M11）；A 的 K1–K15 全在 §1；B 的 U1、U2、U15、W3、W4、W8 併卡寫在 §2，U3–U14、U16–U26、U28–U35、W1、W2、W5–W7 全在 §1（B 無 U27）。
