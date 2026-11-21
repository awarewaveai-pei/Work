# 目前客戶（client context）統一計畫 — 2026-11-21

NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；VW = `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`。所有 file:line 已 grep 驗。回報操作者一律繁體中文。

## 1. 盤點

### 1a. 「目前客戶／網站」讀與寫（頁面與前端；API 只列接收參數名）

| # | 檔:行 | 機制 | 單位 | 識別符 | 讀/寫 |
|---|---|---|---|---|---|
| 1 | NA `lib/outreach/use-active-org.ts:11` | URL `?org` | org | uuid | 讀（開發信全頁） |
| 2 | NA `app/(shell)/tools/outreach/OrgSwitcher.tsx:9,15` | URL `?org`（OrgUrlPicker by=id） | org | uuid | 讀寫 |
| 3 | NA `app/(shell)/ops/integrations/page.tsx:66-67` | URL `?org`（server） | org | uuid | 讀 |
| 4 | NA `app/(shell)/tools/banner/BannerStudio.tsx:1125-1126` | URL `?org`（讀一次） | org | uuid | 讀 |
| 5 | NA `app/(shell)/ops/clients/[slug]/OutreachTab.tsx:62` | 連結 `?org=` | org | uuid | 寫連結 |
| 6 | NA `app/(shell)/ops/collect/page.tsx:41,58` | URL `?slug`（OrgUrlPicker by=slug） | org | slug | 讀寫 |
| 7 | NA `app/(shell)/ops/repairs/page.tsx:24`、`ops/inbox/page.tsx:44` | URL `?client_slug` | org | slug | 讀 |
| 8 | NA `app/(shell)/ops/clients/ClientCard.tsx:137`、`[slug]/ClientHubTabs.tsx:790`、`ops/integrations/page.tsx:234` | 連結 `?client_slug=` | org | slug | 寫連結 |
| 9 | NA `app/(shell)/tools/social/SocialManager.tsx:74,145,148,170` | URL `?brand`＋state | org | uuid | 讀寫 |
| 10 | NA `app/(shell)/ops/clients/[slug]/page.tsx:47,60-64` | path `/ops/clients/[slug]` | org | slug | 讀 |
| 11 | NA `app/(shell)/ops/clients/OrgPicker.tsx:143`（link 模式）、`ClientPanelNav.tsx` | 連結 path | org | slug | 寫連結 |
| 12 | NA `app/(shell)/tools/content/ContentStudio.tsx:482,488,774-775` | URL `?siteId`＋state | site | wp_sites uuid | 讀 |
| 13 | NA `ContentStudio.tsx:1953,2203` | select 下拉（state，不寫 URL） | site | uuid | 寫（違反無下拉規則） |
| 14 | NA `[slug]/ClientHubTabs.tsx:550,556` | 連結 `?siteId=` | site | uuid | 寫連結 |
| 15 | NA `[slug]/ClientHubTabs.tsx:211` | `wpSites[0]` 固定 | site | uuid | 隱含（多站客戶只看得到第一站） |
| 16 | NA `app/(shell)/tools/content/topics/TopicsBoard.tsx:159` | state 預設 `overview.rows[0]`（任一客戶的問題站） | site | uuid | 隱含 |
| 17 | NA `TopicsBoard.tsx:197-200` | `location.search` `?site`（effect 只跑一次，不隨 URL 變） | site | uuid | 讀 |
| 18 | NA `TopicsBoard.tsx:423,427,443` | 自畫網站膠囊＋`history.replaceState ?site=`＋「換客戶或網站」連結 | site | uuid | 讀寫 |
| 19 | NA `topics/AutoContentOverview.tsx:42,67,83,110,136` | `?site=` 連結＋state `orgId`＋OrgPicker（R8 客戶頁） | org/site | uuid | 讀寫 |
| 20 | NA `app/(shell)/tools/video/ScriptForge.tsx:1145,1184` | localStorage `sf_site` | site | uuid | 讀寫 |
| 21 | NA `ScriptForge.tsx:1176-1180` | prop `organizationId`（VW 給）＋整表 `/api/content/sites` 前端過濾 | org→site | uuid | 讀 |
| 22 | NA `app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:40,56,89` | state＋整表 `/api/content/sites` 前端過濾 | org/site | uuid | 讀寫 |
| 23 | NA `app/(shell)/tools/video/StoryBibleWorkbench.tsx:20`、`OrganizationPicker.tsx:41,73` | state＋OrgPicker（bootstrap） | org | uuid | 讀寫 |
| 24 | NA `app/(shell)/ops-console/AiJobForm.tsx:15,18` | state（手填） | org/site | uuid | 讀寫 |
| 25 | NA `app/(shell)/tools/designs/DesignsGallery.tsx:268,361` | prop | org | uuid | 讀 |
| 26 | NA `app/api/video/workbench/organization/route.ts:45` | cookie `__Host-vw-organization`（POST 設） | org | uuid | 寫 |
| 27 | NA `app/api/video/workbench/session/route.ts:26-32` | cookie＋header `x-vw-org`；兩者不同 → 403 `org_context_changed` | org | uuid | 讀（nginx auth_request） |
| 28 | NA `public/editor-shared/video-organization.cjs:3-4,7-15` | cookie／header 名稱、重複 cookie=invalid | org | uuid | 共用 |
| 29 | VW `shared/adapters.js:121-127,173,208` | `/api/vw/identity` → 每請求帶 `X-VW-Org` | org | uuid | 讀 |
| 30 | VW `scripts/organization-picker.js:17,89-95` | 對話框 POST organization＋BroadcastChannel `vw-organization` | org | uuid | 寫 |
| 31 | NA `app/video/(wb)/review-release/page.tsx:12`、`ReviewRelease.tsx:9,14` | URL `?organizationId`（未比對 VW identity） | org | uuid | 讀 |
| 32 | NA `app/video/(door)/release/page.tsx:13-16` | 舊連結 `?organizationId` → 轉 `/?open=review-release` | org | uuid | 轉 |
| 33 | NA `app/video/(wb)/schedule/ScheduleWorkbench.tsx:66`、`script-forge/ScriptForgeWorkbench.tsx:57`、`works/WorksGallery.tsx:14` | `loadCapabilities().mainSystem.organizationId`（= VW identity） | org | uuid | 讀 |
| 34 | NA `app/(shell)/tools/video/OpenWorkbench.tsx:37` | 開 `https://VIDEO_HOST/handoff?open=`，**不帶客戶** | — | — | 跨網域 |
| 35 | VW `scripts/index-1.js:139-148` | `?open=` 與其餘參數轉給 frame | — | — | 跨頁 |
| 36 | VW `scripts/projects-0.js:211,1009`、`projects-bible.js:23`、`shared/jobs-view.js:14-18` | API `?organizationId=`（來自 identity） | org | uuid | 讀 |
| 37 | NA `lib/tenant-guard.ts:24-25,193-216` | header `x-ops-org-id`（middleware 由 session 設，`middleware.ts:24,137-138` 先剝除外來值） | org | uuid | 唯一授權來源 |
| 38 | NA API 參數 | `organizationId`（content/drafts、outreach/*、video/*、tools/designs、tools/presets）、`organization_id`（ops/integrations、ops/audit-events、onboarding/submit）、`slug`（ops/schedules）、`siteId`（content/*、video/wp-posts、content/topics）、`site`（social/wp-article） | — | — | API 名稱不在本計畫改 |

### 1b. 產品入口網域（唯一來源：NA `lib/portal/products.ts:41-98`＋`lib/portal/hosts.ts`）

主機＝`PRODUCT_HOST_<KEY>` 或 `<subdomain>.<PUBLIC_BASE_DOMAIN>`（`hosts.ts:26-28`，預設基底 `aware-wave.com`，`hosts.ts:8-10`）；員工門＝`STAFF_HOSTS`（預設 `app.<base>`，`hosts.ts:17-19`）；入口網站＝`PORTAL_HOST`（預設 `portal.<base>`，`hosts.ts:12-14`）；路由只在 `lib/portal/doors.ts:30-42`（`doorForHost`；`enabled:false` 不服務，`doors.ts:23-25`）。未來白牌：`custom_domains(host→organization_id, product_key)`（ADR 018 `018-product-doors-and-buyout-delivery.md:32`，未實作）。

| key | subdomain | door | nav（頁） | 備註 |
|---|---|---|---|---|
| cognitive | cognitive | external | — | `products.ts:42` |
| hci | hci | external | — | `products.ts:45` |
| social | social | next-admin `/social` | 無 nav | `products.ts:48`；客戶參數 `?brand` |
| video | video | next-admin `/video`，uiService video-workbench | 影片工作台、我的作品 | `products.ts:52-53`；VW 另一容器 |
| tarot | tarot | next-admin `/tarot` | 2 | `products.ts:57` |
| studio | studio | next-admin `/studio` | 2 | `products.ts:63` |
| design | design | next-admin `/design` | 5 | `products.ts:68` |
| content | content | next-admin `/content` | 6（含 R8 `topics/clients`） | `products.ts:76-80` |
| cs | cs | next-admin `/cs`，enabled false | — | `products.ts:85` |
| collect | collect | next-admin `/collect`，enabled false | — | `products.ts:89` |
| outreach | outreach | next-admin `/outreach` | 8 | `products.ts:92-96` |

### 1c. Session／cookie 是否跨網域

- Supabase 登入 cookie 不設 Domain＝每個主機各一份：`lib/supabase/auth-cookie-options.ts:4`（只設 `secure`）；ADR 018 `:12`、`:46`、`:71`（明令不共用 `.aware-wave.com`）。
- VW 客戶 cookie 用 `__Host-` 前綴（`video-organization.cjs:3`），瀏覽器強制 host-only、`path=/`、無 Domain（`organization/route.ts:45`）。
- 跨門登入＝一次性碼：`lib/auth/door-link.ts:12,30`（`next` 參數帶到目標門）；`middleware.ts:50-51` 註明 cookie per host。
- 結論：跨網域**不能**靠 cookie 帶客戶；只能靠網址（一次性碼的 `next` 本身也是網址）。

### 1d. 現成可用、不新造的機制

| 機制 | 檔:行 | 本計畫用途 |
|---|---|---|
| 伺服器授權 | `lib/tenant-guard.ts:100-122,193-216`；`lib/content/wp-sites.ts:111-132,153-161` | 唯一授權點，不改 |
| 網址寫回的挑客戶積木 | `ops/clients/OrgPicker.tsx:101,167-189` | 「目前客戶」第一層直接用 |
| 開發信 hook | `lib/outreach/use-active-org.ts:9-20` | 泛化後刪除（後續批） |
| 入口 context provider | `app/DoorContext.tsx:8-22`、`lib/portal/door-href.ts:6-11` | 同型做法：外框設定，頁面讀 |
| 客戶分租搜尋（staff 全部／客戶只自己） | `app/api/video/workbench/bootstrap/route.ts:13-30`（`scoped`） | 抽成共用 lib |
| 每門都有的 API 清單 | `lib/portal/doors.ts:66,76-90`（`PLATFORM_APIS`；`registry-code.test.ts` 強制需授權） | 新 context route 掛這裡，新門零改動 |
| 「指定取不到不得靜默換」不變量 | `lib/content/pick-initial-site.ts:23`、`ContentStudio.tsx:489-507` | 搬進契約後刪 |
| 產品主機推導 | `lib/portal/hosts.ts:26-28` | 跨網域連結唯一算法 |
| middleware 標頭 | `middleware.ts:24,137-138` | **不**加新標頭（auth 路徑，不動） |

## 2. 對監工方案的審查（漏洞）

| # | 漏洞 | 證據 |
|---|---|---|
| F1 | 「只留網址」與「VW cookie」角色沒分清：cookie 是 VW 每個子請求的授權依據（nginx auth_request 看不到頁面網址），不能刪；真正缺的是「網址→cookie」入口與「VW 內兩來源」的一致性：staff 開 VW 不帶客戶；review-release 用網址 org、VW 請求用 cookie org，互不比對 | `session/route.ts:11-13,29-32`；`OpenWorkbench.tsx:37`；`review-release/page.tsx:12` vs `adapters.js:121-127` |
| F2 | 不是五種而是至少八種傳法；識別符不一：`?org`=uuid，`?slug`／`?client_slug`=slug，`?brand`=uuid，`?siteId`／`?site` 同義兩名 | 1a #1-#9、#12、#17 |
| F3 | 第二層「網站」沒有分頁＝整表：`/api/content/sites` 無 org 篩選、無上限；`loadOverview` 也整表。先挑客戶再列該客戶的網站，網站層就不需要搜尋 API | `api/content/sites/route.ts:48-53`；`lib/content/topics/overview-load.ts:54`；R10 盤點第 9 列 |
| F4 | 「固定在最上方同一位置」若由各頁自畫無法保證；Next layout 拿不到 searchParams，外框要用 client 元件讀 URL，且「這頁要哪一層」必須來自登記表，否則每頁自決＝再次分歧 | `(shell)/layout.tsx:36`；`DoorNav.tsx:1`（use client）；`products.ts:11`、`sidebar-sections.ts:9` 無 scope 欄位 |
| F5 | 客戶登入：API 已安全（`effectiveOrgId` 忽略要求值），但畫面若用網址 uuid 查名顯示＝誤導；入口門上 `/api/ops/org-search` 一律 404，OrgPicker 的 staff 搜尋路徑在門上不能用 | `tenant-guard.ts:198-205`；`doors.ts:114-118`；`OrgPicker.tsx:86` |
| F6 | 「沒指定就拿第一個」散在三處，staff 情境＝某個別人的客戶：TopicsBoard 預設第一列、pickInitialSite 無參數取第一、伺服器 resolveWpSite 無 siteId 取第一個可存取站 | `TopicsBoard.tsx:159`；`pick-initial-site.test.ts:14`；`wp-sites.ts:123-126` |
| F7 | 客戶頁內容分頁只編 `wpSites[0]`；多站客戶第 2 站以後不可達；外連用舊名 `?siteId=` | `ClientHubTabs.tsx:211-212,550,556` |
| F8 | 內容編輯有兩個 select 挑網站（違反無下拉），且選擇不寫回網址（換頁即掉） | `ContentStudio.tsx:1953,2203` |
| F9 | 刪 R8「題目›客戶」後兩件事沒去處：(a) 員工「有問題的客戶排前面」→ `/ops/clients` 落地頁目前是空白提示；(b) 入口門客戶的各站數字 → 五步驟已含同數字（FlowCells） | `ops/clients/page.tsx:6-18`；`AutoContentOverview.tsx:64-117,130-176` |
| F10 | 跨網域只能靠網址（1c）；主機必須由 `productHost()` 推導，客戶跨門要經 `mintDoorLink` 的 `next` | `hosts.ts:26-28`；`door-link.ts:12,30` |
| F11 | 兩條挑客戶搜尋 API、權限門檻不同（operator 以上 vs 能建 AI job 者）＝兩套 | `org-search/route.ts:24`；`bootstrap/route.ts:19` |
| F12 | 員工側欄是 56 個連結不是 54；兩份選單都沒有「此頁要不要客戶」欄位 | `sidebar-sections.ts` link 項 grep -c = 56；`sidebar-sections.ts:9`；`products.ts:11` |
| F13 | R10 檢查器只管「客戶清單」，不管網站清單與私藏來源（localStorage／state／下拉） | `ops/clients/__tests__/client-picker-rule.test.ts` 的 `CLIENT_LISTS` 只有 org-search／bootstrap／ops/clients／organizations |
| F14 | 未來白牌網域＝主機本身綁一個客戶，是第三個來源；契約要先定優先序 | ADR 018 `:32` |
| F15 | 同路由換 query 不 remount：讀網址必須是 reactive hook，不能 effect 讀一次 | `ContentStudio.tsx:761-767`；`TopicsBoard.tsx:196-203` |

## 3. 修正後的單一設計

### 3a. 契約

| 項 | 規定 |
|---|---|
| 識別符 | 客戶＝`organizations.id`（uuid）；網站＝`wp_sites.id`（uuid）。slug 只留在 `/ops/clients/[slug]` 路徑（人讀網址；`page.tsx:60-64` 伺服器端一次換成 uuid）。 |
| 網址參數名 | `org`、`site`（沿用開發信／整合／橫幅的 `org` 與題目的 `site`，搬最少）。API 參數名（`organizationId`／`siteId`）不改。 |
| 來源優先序（高者勝） | ① session 綁定的客戶（`x-ops-org-id`，客戶帳號）② 主機綁定（白牌 `custom_domains`，未實作，預留）③ 網址 `org`／`site`（員工）④ 無＝未選。VW 內部另有 VW cookie，見 3d。 |
| 每分頁獨立 | 網址是每分頁各自的客戶；不設跨分頁的「目前客戶」cookie／localStorage（VW cookie 除外，3d）。 |
| site 推 org | 只給 `site` → `org = site.organization_id`，寫回網址補上 `org`。 |
| 不一致 | `org` 與 `site` 不相符、`site` 不存在、無權限 → 狀態 `site_mismatch`／`not_found`／`forbidden`：什麼都不選、頁面不載資料、積木顯示原因＋改選；**不得**退回第一個。 |
| 未選 | 員工、需要 org 而未給 → 什麼都不選，積木請先挑（決定 1）；需要 site、該客戶恰 1 站 → 自動選並寫回網址；多於 1 站 → 列該客戶的網站按鈕，未按不選。 |
| 客戶帳號 | 網址 `org`／`site` 指向他處 → 直接從網址移除（`router.replace`），不查名、不顯示、不報錯（不洩漏存在與否）；org 恆為自己。 |
| 舊參數相容 | 讀取時正規化並 `router.replace` 成新名：`siteId`→`site`；`slug`／`client_slug`（後續批）→ 查 uuid 後 `org`；`brand`（後續批）→`org`；`organizationId`（VW 頁）→ 見 3d；localStorage `sf_site` → 讀到即刪，不沿用。 |
| 伺服器驗證點 | 不新增授權規則；全部仍走 `effectiveOrgId`／`assertOrgAccess`／`canAccessOrg`／`resolveWpSite`／`siteRowGate`。新 route 只把這些組起來回名稱。 |

### 3b. 伺服器：`GET /api/client-context`（掛 `PLATFORM_APIS`，每門自動有）

- `?org=&site=` → `{ ok, status: ok|none|not_found|forbidden|site_mismatch, org: PickOrg|null, site: {id,name,url}|null, sites: {id,name,url}[]（該 org 的 active 站）, scoped: boolean }`。客戶帳號：org 取 `effectiveOrgId(req, null)`，網址值不參與；永不回 not_found／forbidden。
- `?first=1[&include=]`、`?q=` → 與 bootstrap 相同語意的 PickOrg 清單（邏輯抽到 `lib/client-context/orgs.ts`，bootstrap 改呼叫它）。
- 權限：`canCreateAiImageJob`（與 bootstrap、`/api/content/sites` 同門檻，`bootstrap/route.ts:19`、`sites/route.ts:41-42`）。

### 3c. 前端積木

| 名稱 | 檔 | API |
|---|---|---|
| 契約（純函式） | `lib/client-context/contract.ts` | `PARAM = { org: "org", site: "site" }`；`type Scope = none|org|site`；`normalizeQuery(sp)` 回 `{ org, site, legacy }`；`decide(input)` 回 `{ status, orgId, siteId }`（3a 規則全在此）；`withContext(href, ctx, scope)`（scope none 原樣；跨主機 href 也適用） |
| hook | `lib/client-context/use-client-context.ts` | `useClientContext(scope)` 回 `{ status, org, site, sites, scoped, setOrg, setSite }`；只讀 `useSearchParams`（reactive）＋`/api/client-context`；set＝`router.replace` 保留其他參數；legacy 參數自動換名 |
| 頂部列 | `app/ClientContextBar.tsx` | `ClientContextBar({ scope })`：org 層＝`OrgPicker`（searchPath `/api/client-context`，`searchable={!scoped}`）；site 層＝該客戶網站按鈕；錯誤狀態文字。頁面不 import 它 |
| 登記表欄位 | `products.ts` `DoorNavItem.scope`（必填）；`sidebar-sections.ts` link 項 `scope`（必填） | 外框依目前路徑查 scope |
| 外框 | `ProductDoorShell.tsx`／`DoorNav.tsx`／`SidebarNav.tsx`／`(shell)/layout.tsx` | scope 非 none → 內容區最上方渲染 ClientContextBar；選單每個 scope 非 none 的連結經 `withContext` 帶目前 `org`（目標 scope=site 時加 `site`） |
| 跨網域 | `withContext("https://" + productHost(p) + path, ctx, scope)` | 主機只由 `hosts.ts` 推導，不寫網域清單；新增產品門零改動；客戶跨門走 `mintDoorLink(..., next)`，`next` 內含同一 query |

### 3d. VW（cookie 保留，角色限定）

- cookie＝VW 主機內的 session 狀態（每個子請求授權用），**不是**跨主機的來源。
- 進入：`https://VIDEO_HOST/handoff?open=&org=` →（handoff 轉）`/?open=&org=` → VW 殼讀 `org`：等於 identity → 移除參數；不等 → 開既有切換對話框並預選該客戶，按一下才切（現成 mediaReady→flush→lock→POST organization→BroadcastChannel，`organization-picker.js:84-95`）；取消＝留在原客戶並移除參數。
- VW 內頁的 `?organizationId=`（review-release）必須等於 identity（`loadCapabilities().mainSystem.organizationId`），不等 → 顯示「這支影片屬於另一個客戶，請先切換」，不載資料。
- 衝突裁決：VW 內以 cookie 為準（`session/route.ts:31` 已擋 header 與 cookie 不同）。

### 3e. 以客戶頁 vs 功能頁分工

| | `/ops/clients/[slug]`（以客戶） | 功能頁（以功能） |
|---|---|---|
| 放什麼 | 這個客戶是什麼：設定、連線、健康、問題、帳務；每個功能一行狀態＋「去做」連結 | 做事：產出、審核、發布 |
| 客戶怎麼來 | 路徑 slug | 頂部列（網址 `org`／`site`） |
| 互連 | 外連一律 `withContext("/tools/...", {org, site}, scope)` | 頂部列旁「客戶頁 →」連 `/ops/clients/SLUG`（只員工） |
| 問題清單 | `/ops/clients` 落地頁：有問題的客戶排前面（取代 R8 客戶頁） | 不放客戶清單 |
| 網站設定 | 同一組元件（`sites/*Buttons.tsx`）：客戶頁「內容工具」分頁按站顯示；入口門「網站」頁給客戶 | — |

### 3f. scope 宣告（第一批只內容相關生效）

- site：`/tools/content`、`/tools/content/topics`、`/tools/content/topics/steps`；door：空字串（首頁）、`topics`、`topics/steps`。
- org：`/tools/content/sites`；door `sites`。
- none：`/tools/events`、door `events`、其餘全部（後續批逐頁改為 org 並同批改頁）。
- 後續批已知讀客戶的頁（證據 1a）：`/tools/outreach/*`(9)、`/ops/integrations`、`/tools/banner`、`/ops/collect`、`/tools/social`、`/ops/repairs`、`/ops/inbox`、`/tools/designs`、`/ops/schedules`、`/tools/video`（跨網域）。

## 4. 卡片（第一批：內容入口＋客戶頁＋VW 進入點）

通則：每卡交回 `FILES/TESTS/RISKS` 三行；`.ts/.tsx` 改完 `npx tsc --noEmit`；只跑卡內點名測試；回報操作者一律繁體中文。

| 卡 | 一句話 | 檔案（獨佔） | 刪除 | 相容 | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|---|---|
| C1 | ADR 019「目前客戶」契約登記 | 新 `agency-os/docs/architecture/decisions/019-client-context.md`；`ADR_INDEX.md` | — | — | 3a 表全文；`verify-governance-pointers.mjs` 綠 | Low | — |
| C2 | 契約純函式＋單元測試 | 新 NA `lib/client-context/contract.ts`、`lib/client-context/__tests__/contract.test.ts` | — | `normalizeQuery`：`siteId`→`site`；兩者並存以 `site` 為準並標 legacy | 測試：site 推 org、mismatch 不選、客戶帳號忽略網址、1 站自動／多站不選、`withContext` 對 none／org／site／跨主機 | Low | — |
| C3 | `/api/client-context`＋抽出 bootstrap 邏輯＋掛 PLATFORM_APIS | 新 NA `app/api/client-context/route.ts` 與其 test、新 `lib/client-context/orgs.ts`；改 `app/api/video/workbench/bootstrap/route.ts`、`lib/portal/doors.ts:66` | bootstrap 內重複的 first/q/include 實作 | bootstrap 回應形狀不變（VW `organization-picker.js:7-13` 依賴） | route.test：客戶帶他人 org → 回自己；site 不屬 org → site_mismatch；無權 → forbidden；`registry-code.test.ts`、`products.test.ts`、bootstrap 既有測試綠 | **High**（每個入口門新開一條客戶可呼叫的 API） | C2 |
| C4 | hook＋頂部列積木 | 新 NA `lib/client-context/use-client-context.ts`、`app/ClientContextBar.tsx`、各自 test | — | legacy 參數 → `router.replace` 換名 | render test：org 層用 OrgPicker、site 層按鈕、錯誤三態文字、客戶帳號無搜尋框；URL 變更不 remount 也重算 | Medium | C2（C3 回應形狀依 3b，可並行） |
| C5 | 登記表 scope 欄位＋刪 R8 客戶頁 | NA `lib/portal/products.ts`、`app/sidebar-sections.ts`、刪 `app/content/topics/clients/page.tsx`、刪 `app/(shell)/tools/content/topics/clients/page.tsx`、新 `lib/client-context/__tests__/scope-declared.test.ts` | 兩個 `topics/clients` 選單項（`products.ts:79`、`sidebar-sections.ts:82`）與兩頁 | 舊網址 `/tools/content/topics/clients`、`/content/topics/clients` 變 404，可接受（grep 其餘引用只在 C7 檔） | `scope` 型別必填、56 個＋全部 door nav 填值（3f）；scope-declared test：scope 非 none ⇔ 頁檔（或其元件）用 `useClientContext`，未遷移頁列 `LEGACY` 白名單（只減不增，每列寫後續批名）；`sidebar-coverage.test.ts`、`products.test.ts` 綠 | Medium | C2 |
| C6 | 外框渲染頂部列＋選單帶參數 | NA `app/ProductDoorShell.tsx`、`app/DoorNav.tsx`、`app/SidebarNav.tsx`、`app/(shell)/layout.tsx` | — | — | 員工 `/tools/content?org=X&site=Y` 點側欄「自動內容」→ 網址保留 org／site；入口門同；scope none 的頁無頂部列；DoorNav／SidebarNav 既有測試綠 | Medium | C4、C5 |
| C7 | 題目／五步驟改用 hook | NA `app/(shell)/tools/content/topics/` 下 `TopicsBoard.tsx`、`AutoContentOverview.tsx`、`StaffTopicsBoard.tsx`、`TopicsPageContent.tsx`、`__tests__/*`；`app/content/topics/DoorTopicsBoard.tsx` | `TopicsBoard.tsx:151,156,159`（rows[0] 預設）、`:193-203`、`:400`（clients view）、`:421-428`、`:443`；`AutoContentOverview.tsx:44-117`（ClientOverview、firstPage、problemTag）；`TopicsView` 的 clients；`StaffTopicsBoard.tsx` 的 `pickClient` | `?site=&month=&topic=` 連結（VW schedule，`app/video/(wb)/__tests__/schedule.test.tsx:59`）照常；`month`／`topic` 參數保留 | 頁無自畫挑站；未選 site 不 fetch `/api/content/topics`；換網址 site 重新載入；`TopicsBoard.views.render.test.tsx` 改寫綠 | Medium | C6 |
| C8 | 內容編輯改用 hook | NA `app/(shell)/tools/content/ContentStudio.tsx`、`content/__tests__/ContentStudio.site-wiring.test.tsx`；刪 `lib/content/pick-initial-site.ts` 與 `lib/content/__tests__/pick-initial-site.test.ts` | `ContentStudio.tsx:482,488-510,748-782`、select `:1950-1960`、`:2199-2213`、`unresolvedSiteParam` | `?siteId=` 由 hook 換成 `site`（測試覆蓋）；`saveAsClientDefault` 只寫目前 site，無 site 時按鈕停用 | 無 select；未選站不呼叫 patterns／categories／tags；舊 `?siteId=` 進來網址變 `?org=&site=` | Medium | C6 |
| C9 | 網站頁＝一個客戶的網站 | NA `app/(shell)/tools/content/sites/SiteManager.tsx`、`app/(shell)/tools/content/sites/page.tsx`、`app/content/sites/page.tsx`、`app/api/content/sites/route.ts` 與其 tests | SiteManager 整表載入 `:605` | API 加 `?organizationId=`（`effectiveOrgId` 驗，`.eq` 篩）；不帶時行為不變（其他舊呼叫端後續批收） | 員工未選客戶 → 請挑；新增網站 POST 帶目前 org（`route.ts:135-137` 已收）；客戶帳號只見自己 | Medium | C6 |
| C10 | 客戶頁：內容分頁多站＋外連帶 context＋落地頁問題清單 | NA `app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx`、`app/(shell)/ops/clients/page.tsx` | `ClientHubTabs.tsx:211-212`（wpSites[0]）、`:550,556` 舊 `?siteId=` | 舊書籤 `/tools/content?siteId=` 由 C8 相容 | 多站客戶每站一塊；外連 `/tools/content?org=ID&site=ID`；`/ops/clients` 顯示有問題的客戶（`loadOverview` 的 `row.problem`，連 `/ops/clients/SLUG?tab=內容工具`），不依 C7 | Medium | C2 |
| C11a | VW 進入點（next-admin 側） | NA `app/(shell)/tools/video/` 下 `OpenWorkbench.tsx`、`WorkbenchEntry.tsx`、`ScriptForge.tsx`、`ReleaseDeliveryPanel.tsx`；`app/video/(door)/handoff/page.tsx`、`ScriptHistoryHandoff.tsx`；`app/video/(wb)/review-release/page.tsx`、`ReviewRelease.tsx`；相關 tests | `ScriptForge.tsx:1145,1184` 的 `sf_site`；`ScriptForge.tsx:1176`、`ReleaseDeliveryPanel.tsx:89` 整表載入 | 讀到 `sf_site` 即 removeItem；VW 內 site＝該 org 恰 1 站自動、多站按鈕不記憶；`/release?organizationId=` 舊連結照轉 | OpenWorkbench 帶目前 org，主機用 `productHost`；handoff 轉送 org；review-release org 與 identity 不同 → 錯誤文字、不載；ScriptForge／ReleaseDelivery 只抓 `/api/client-context?org=` 的 sites | Medium | C3、C4 |
| C11b | VW 殼讀 `?org` → 一鍵確認切換 | VW `scripts/index-1.js`、`scripts/organization-picker.js`、`tests/` 新 cjs | — | 無 org 參數行為不變 | 測試：org=identity 移除參數不開窗；不同 → 對話框預選目標，取消不切；切換仍走 flush、lock、POST；BroadcastChannel 照發 | **High**（改 VW cookie 的切換流程） | C11a |
| C12 | 檢查器：禁止私藏客戶來源 | 新 NA `lib/client-context/__tests__/no-private-context.test.ts` | — | `LEGACY` 白名單＝1a 中後續批的檔（只減不增） | 掃 `app/`、`components/`：`searchParams.get` 取 org／site／siteId／slug／client_slug／brand、localStorage 存 site／org／client、挑網站 select、fetch `/api/content/sites` 不帶 organizationId、程式碼內出現寫死的網域字串（`aware-wave.com` 等，`hosts.ts` 預設值除外）組客戶連結 → 紅（`lib/client-context/*` 與白名單除外）；突變：ContentStudio 加回 `searchParams.get("siteId")` → 紅，還原 → 綠 | Low | C7、C8、C9、C10、C11a |
| C14 | 新增產品入口零手改的驗收測試 | 新 NA `lib/client-context/__tests__/new-door.test.ts` | — | — | 見 §4b，全部斷言以迴圈走 `PRODUCTS`，不寫任何產品名或網域 | Low | C3、C5、C6、C12 |
| C13 | 期末閘：critic＋codex-review＋實測 | 無程式檔；WORKLOG、supervisor `data.mjs` | — | — | 本機：員工 `/tools/content?siteId=舊值` → 網址變 org／site；側欄換頁保留；客戶帳號 content 門帶他人 `?org=` → 被移除且資料為自己；VW 從 app 帶 org 開啟 → 確認窗；`PRODUCT_HOST_CONTENT=brand-x.test` 本機起服務重跑同一組；四動作證據行 | — | 全部 |

### 4b. 「新增產品入口零手改」可執行測試（C14）

前提（已驗）：主機全由設定推導 —— `productHost` 讀 `PRODUCT_HOST_<KEY>` 可為任意獨立主網域（`hosts.ts:26-28`）；`doorForHost(host, env)` 吃 env（`doors.ts:30-35`）；每門 API ＝ 自身 api＋`PLATFORM_APIS`（`doors.ts:76-79`）；選單來自登記表 `door.nav`（`ProductDoorShell.tsx:41-42`）。

| # | 斷言（對 `PRODUCTS` 中每個 `door.app === "next-admin"` 的列迴圈） | 對應積木 |
|---|---|---|
| T1 | 以 env `PRODUCT_HOST_<KEY>=<key>-brand.example`（獨立主網域，非 aware-wave.com）與預設子網域各跑一次：`doorForHost` 回該產品門 | 路由 |
| T2 | `routeOnProductDoor("/api/client-context", product)` 為 pass（掛在 PLATFORM_APIS，不需逐產品登記） | 伺服器 |
| T3 | `withContext("https://" + productHost(p, env) + "/x", {org, site}, "site")` 的 host 等於 env 指定主機、query 含 `org`、`site`；不含任何 Domain cookie 假設 | 帶法 |
| T4 | 每個 `door.nav` 項有 `scope`（型別已擋，測試再走一次防 `as` 繞過）；scope 非 none 的項，渲染 `ProductDoorShell` 時頂部列出現、其 `DoorNav` 連結帶 `org` | 外框＋積木 |
| T5 | `scope-declared` 與 `no-private-context` 檢查器的掃描範圍由 `PRODUCTS[].door.page` 推出（不是寫死 `/content` 等目錄清單）：測試斷言檢查器掃描集合 ⊇ 每個 door.page 對應的 app 目錄 | 檢查器 |
| T6 | 原始碼掃描：`lib/client-context/`、`app/ClientContextBar.tsx`、外框四檔不得出現網域字面值（`aware-wave`、`.com` 等）與 `document.cookie`／`cookies.set` 的 `domain` 參數 | 無父網域依賴 |
| 突變 | 在 `products.ts` 測試 fixture 加一列假產品（或對既有列改 `PRODUCT_HOST_*` 為 `other.example`）→ T1–T5 自動涵蓋且全綠；把 `withContext` 改成寫死 `.aware-wave.com` → T3／T6 紅 | — |

### 4c. 排除的做法

| 做法 | 排除原因（證據） |
|---|---|
| 設在父網域（如 `.aware-wave.com`）的共用 cookie 存目前客戶 | 獨立主網域（`PRODUCT_HOST_<KEY>` 任意值，`hosts.ts:27`；白牌 `custom_domains`，ADR 018 `:32`；買斷客戶主機）不共享父網域，cookie 帶不過去＝不成立；ADR 018 `:71` 已禁共用 cookie（同父網域下有客戶 staging WordPress）；且全瀏覽器共用一個值，多分頁互相覆蓋 |
| 每主機自己一份「目前客戶」cookie 或 localStorage（擴大 VW 模式到每門） | 不跨主機；同主機多分頁互相覆蓋（VW 為此另寫鎖與 BroadcastChannel，`organization-picker.js:17-28`、`adapters.js:141-160`），每門重做一次＝多套；`sf_site` 即此反例 |
| 伺服器端每使用者「目前客戶」狀態（資料庫一列） | 需新表（已排除改 schema）；所有分頁共用一值，切 A 分頁改到 B 分頁 |
| 路徑段 `/c/ORG/...` | 動全部路由；與入口門路徑改寫衝突（`doors.ts:107-118` 把非本產品路徑改寫到產品前綴）；爆炸半徑最大，收益只多「layout 能讀 params」，外框用 client 元件即可取得 |
| 每客戶一個子網域（`ORG.content.base`） | 每客戶 DNS／憑證；與「每客戶每產品一列白牌」的 ADR 018 設計重疊；買斷主機不成立 |
| middleware 把網址客戶寫成新請求標頭 | 動 auth 路徑；`x-ops-org-id` 的語意是 session 綁定（`middleware.ts:137-138`），混入網址值會讓 `effectiveOrgId` 誤把員工的選擇當客戶身分 |
| 跨分頁 postMessage／BroadcastChannel 同步客戶 | 只在同源有效；跨主機需兩頁同時開著；非可書籤化 |
| 程式內寫死網域清單（app／content／video…） | 新增產品要手改；違反 ADR 018 §2（`018-...md:28-32`） |
| 刪 VW cookie 改每請求帶網址 org | nginx auth_request 子請求看不到頁面網址（`session/route.ts:11-13`），媒體、靜態檔請求會失去授權依據 |
| 不做頂部列、各頁自畫 | 即現況（1a 八種）；無法保證位置與規則一致 |

### 4d. 先後與並行（兩卡不同時動同一檔）

- 第 1 波並行：C1、C2。
- 第 2 波並行：C3、C4、C5、C10。
- 第 3 波：C6（需 C4、C5）。
- 第 4 波並行：C7、C8、C9、C11a（需 C6；C11a 另需 C3）。
- 第 5 波：C11b（需 C11a）、C12（需 C7 到 C11a）。
- 第 6 波：C14（需 C3、C5、C6、C12）。
- 第 7 波：C13。
- 關鍵路徑：C2 → C4 → C6 → C8 → C12 → C14 → C13。
- 部署：一批一次；推上 main＝當晚 03:00 自動部署 next-admin，所以第一批完成前放 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD`；C3、C11b 為 High，撤 HOLD 需操作者明示。VW 是另一服務，依 AGENTS.md §0 部署腳本手動部署（High）。

### 4e. 後續批（不展開）

L1 開發信（`use-active-org.ts` 併入 hook 後刪）；L2 整合、資料蒐集（`?slug`→`org`）；L3 社群（`?brand`→`org`）；L4 維修、事件（`?client_slug`→`org`）；L5 橫幅、設計庫與 design、studio、tarot 入口；L6 VW 內頁（StoryBible、ReleaseDelivery 的 OrganizationPicker 改吃 identity）；L7 `/api/ops/org-search` 併入 `/api/client-context`（staff 頁 OrgPicker 全改 searchPath 後刪舊 route）；L8 `resolveWpSite` 無 siteId 取第一個（`wp-sites.ts:123-126`）改為要求 siteId（呼叫端全改完後）；L9 白牌主機綁定（ADR 018 §2，等第一個白牌客戶；契約優先序已預留第 ② 層）。

## 5. 風險

| 風險 | 機率 | 影響 | 處置 |
|---|---|---|---|
| 新 platform API 被客戶用來探測他人 org 是否存在 | M | H | 客戶帳號忽略網址值、回自己、永不回 not_found 或 forbidden（C3 測試） |
| 遷移中頁面出現兩個挑選介面 | H | L | 只有已遷移頁 scope 非 none；LEGACY 頁維持 none |
| VW 確認窗誤點切錯客戶 | L | M | 沿用 flush、lock；其他分頁收 BroadcastChannel 被鎖 |
| 自動部署把半套上線 | M | M | 第一批完成前 DEPLOY_HOLD |
| 舊書籤 `topics/clients` 404 | L | L | 接受（只有內部選單連結） |
| 一個客戶網站很多（超過 50）時 site 層按鈕過長 | L | L | 接受；出現時再加搜尋（記 TASKS 一行） |
| 獨立主網域上客戶需重新登入 | H | L | 既有設計（每門各自登入，ADR 018 `:46`）；客戶跨門走 `mintDoorLink` 的 next 帶同一 query，不額外處理 |

Rollback：每卡單一 commit，可單獨反轉；C3 反轉同時移除 PLATFORM_APIS 項；C11b 反轉後 VW 回到只有對話框切換。

## 6. 需操作者決定（至多三項）

1. 員工打開功能頁、網址沒有客戶：**推薦**＝什麼都不選、頂部列請先挑；「AwareWave 自己」是清單裡明確的一列（今天開發信預設「自用 / 未指定」，`OrgSwitcher.tsx:15`）。替代：預設自己。
2. 從 app 帶客戶開影音工作台、而工作台目前是另一客戶：**推薦**＝跳確認窗按一下才切（連結不能悄悄換客戶，別的分頁可能正在存檔）。替代：無未存工作時自動切。
3. 網站設定（品牌語氣、發布方式等）編輯處：**推薦**＝員工在客戶頁「內容工具」分頁、客戶在內容入口「網站」頁，同一組元件；員工側欄「客戶網站」改為需先挑客戶。替代：只留內容入口「網站」頁，客戶頁只放連結。
