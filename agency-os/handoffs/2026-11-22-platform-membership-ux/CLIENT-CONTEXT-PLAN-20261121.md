# 目前客戶（client context）統一計畫 — 2026-11-21；2026-11-22 依操作者定案改寫

NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；VW = `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`。§1a 表沿用 2026-11-21 grep 驗的盤點；2026-11-22 改寫新增的引用（§1c 末、§1d、§2 F5／F16、§3b、§4 U3–U5）已重新打開程式驗過。操作者 2026-11-22 定案：挑客戶＝**側欄客戶欄**（搜尋＋一列一個＋色點＋類別），不是頂部列；員工在 app 與**各產品子網域**都能用、都能換客戶（`README.md` §2）。開工順序與派工單只在同資料夾 `DISPATCH.md`。回報操作者一律繁體中文。規則正本已移到 ADR 020（`agency-os/docs/architecture/decisions/020-client-context.md`）。

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
- 主機名由伺服器 env 推導（`hosts.ts:26-28` 讀 `process.env`）；瀏覽器端元件讀不到 `PRODUCT_HOST_*`，所以主機必須在伺服器算好再傳下（現行正確做法：`app/(shell)/tools/video/WorkbenchEntry.tsx:14` 以 prop 傳 `videoHost`）。
- 產品門的路由在身分解析之前決定：`routeOnProductDoor` 只看路徑（`middleware.ts:347-351`），身分在其後（`:407-430`）。「依身分放行某支 API」不能寫在 `routeOnProductDoor`，只能放行路徑、交給後面的身分檢查擋（U4）。

### 1d. 現成可用、不新造的機制

| 機制 | 檔:行 | 本計畫用途 |
|---|---|---|
| 伺服器授權 | `lib/tenant-guard.ts:100-122,193-216`；`lib/content/wp-sites.ts:111-132,153-161` | 唯一授權點；只改 `resolveWpSite` 無 siteId 的後備（K6） |
| 挑客戶積木 | `ops/clients/OrgPicker.tsx:101,167-189`（`fill` `:91,115,134`；`badge`、`hint` `:95,98`；搜尋 `useOrgSearch` `:19`） | 客戶欄 `ClientRail` 的核心（K4） |
| 員工端客戶搜尋 | `app/api/ops/org-search/route.ts:22-55`；歸格 `lib/portal/staff-tools.ts:20`（6 格，含 content） | 客戶欄唯一客戶清單來源（員工；app 主機與產品門同一支，U4）；加 `?include=`（K3）、類別（U3） |
| 「include 補一列」先例 | `app/api/video/workbench/bootstrap/route.ts:43-45` | K3 同型照做 |
| 逐工具授權在產品門也生效 | `middleware.ts:147-150`（staff、product 兩種門都跑 `staffDenial`）；`lib/staff-access.ts:39-47`；預設 shadow（`staff-access.ts:10-11`） | U4 不另寫授權 |
| 客戶身分出門即擋 | `middleware.ts:231-234`（`isClientOutsideDoor` 以 `isProductPath` 判斷）、`:246-249`（API 回 403） | U4 擋客戶的第一層 |
| 只限員工的路由守衛 | `lib/tenant-guard.ts:129-131` `staffOnly` | U4 給 org-search 的第二層 |
| 客戶的網站清單 | `app/api/content/sites/route.ts:40-109`（客戶只見自己 `:74`；不回 token `:84-85`） | 「某客戶的網站清單」唯一來源，加 `?organizationId=`／`?siteId=` 篩選（K3） |
| 內部組織（自用） | `lib/entitlements/subject.ts:43-49`（`kind='internal'`）；`session/route.ts:43-45` 用 `resolveSubject({})` 取它 | 「AwareWave 自己」＝這個明確 id |
| 功能清單的主體與快取 | `app/api/entitlements/features/route.ts:12`（主體＝`resolveSubject({ req })`，員工＝內部帳戶 `subject.ts:63-67`）；快取鍵已含主體 org（`lib/entitlements/features.ts:35`） | U5 |
| 員工替客戶的授權證明 | `lib/social/authz.ts:94-101` `actorFor`（owner／admin，或對該客戶有成員角色）；付費路由同一規則（`lib/entitlements/grant.ts:91-99`） | U5：功能清單與實際扣點用同一規則 |
| 開發信 hook | `lib/outreach/use-active-org.ts:9-20` | 泛化後刪除（後續批 L1） |
| 入口 context provider | `app/DoorContext.tsx:8-22`、`lib/portal/door-href.ts:6-11` | 同型做法：外框設定，頁面讀 |
| 外框已是動態渲染 | `(shell)/layout.tsx:17`、`ProductDoorShell.tsx:19`（都呼叫 `headers()`） | 外框可放 `useSearchParams` 的 client 元件 |
| 「指定取不到不得靜默換」不變量 | `lib/content/pick-initial-site.ts:23`、`ContentStudio.tsx:489-507` | 搬進契約後刪 |
| 產品主機推導 | `lib/portal/hosts.ts:26-28` | 只在伺服器端呼叫，結果傳下 |
| middleware 標頭 | `middleware.ts:24,137-138` | **不**加新標頭；本計畫不改 `middleware.ts`（U4 只改 `doors.ts`） |

## 2. 現況漏洞（設計要關掉的類）

| # | 漏洞 | 證據 |
|---|---|---|
| F1 | VW cookie 是 VW 每個子請求的授權依據（nginx auth_request 看不到頁面網址），不能刪；缺的是「網址→cookie」入口與 VW 內兩來源的一致性：staff 開 VW 不帶客戶；review-release 用網址 org、VW 請求用 cookie org，互不比對 | `session/route.ts:11-13,29-32`；`OpenWorkbench.tsx:37`；`review-release/page.tsx:12` vs `adapters.js:121-127` |
| F2 | 至少八種傳法；識別符不一：`?org`=uuid，`?slug`／`?client_slug`=slug，`?brand`=uuid，`?siteId`／`?site` 同義兩名 | 1a #1-#9、#12、#17 |
| F3 | 「網站」層讀整表：`/api/content/sites` 無 org 篩選、無上限；`loadOverview` 也整表 | `api/content/sites/route.ts:48-53`；`lib/content/topics/overview-load.ts:54`；R10 盤點第 9 列 |
| F4 | 挑選介面由各頁自畫，位置與規則不一；兩份選單沒有「此頁要哪一層」的資訊 | 1a #2、#6、#13、#18、#19；`products.ts:11`、`sidebar-sections.ts:9` |
| F5 | 客戶登入時畫面若用網址 uuid 查名顯示＝誤導；產品門上 `/api/ops/org-search` 一律 404，員工在產品門無法換客戶 | `tenant-guard.ts:198-205`；`doors.ts:107-111`（`:109` not_found） |
| F6 | 「沒指定就拿第一個」三處，staff 情境＝某個別人的客戶 | `TopicsBoard.tsx:159`；`pick-initial-site.test.ts:14`；`wp-sites.ts:103-105,123-126` |
| F7 | 客戶頁內容分頁只編 `wpSites[0]`；外連用舊名 `?siteId=` | `ClientHubTabs.tsx:211-212,550,556` |
| F8 | 內容編輯兩個 select 挑網站（違反無下拉），選擇不寫回網址 | `ContentStudio.tsx:1953,2203` |
| F9 | R8「題目›客戶」刪除後：員工問題清單無處放（`/ops/clients` 落地頁空白）；入口客戶的各站數字五步驟已有 | `ops/clients/page.tsx:6-18`；`AutoContentOverview.tsx:64-117,130-176` |
| F10 | 跨網域只能靠網址（1c）；主機只能在伺服器推導 | `hosts.ts:26-28`；`door-link.ts:12,30` |
| F11 | 兩條客戶清單 API、權限門檻不同 | `org-search/route.ts:24`；`bootstrap/route.ts:19` |
| F12 | R10 檢查器只管客戶清單，不管網站清單與私藏來源 | `client-picker-rule.test.ts:13-18` |
| F13 | 未來白牌網域＝主機本身綁一個客戶 | ADR 018 `:32` |
| F14 | 讀網址必須 reactive；題目頁 effect 只讀一次 | `TopicsBoard.tsx:196-203` |
| F15 | 換客戶時保留其他參數 → 舊 `site` 留著＝不一致 | `OrgPicker.tsx:180-185` |
| F16 | org-search 只看角色：客戶身分解析為 `operator`（`ops-role.ts:11,50`），`canModifyIncidentStatus` 放行（`ops-role.ts:97-98`、`org-search/route.ts:23-25`）；今天只靠 middleware 不讓客戶到這支 | 同左 |

## 3. 單一設計

### 3a. 契約（正本：ADR 020）

| 項 | 規定 |
|---|---|
| 識別符 | 客戶＝`organizations.id`（uuid）；網站＝`wp_sites.id`（uuid）。slug 只留在 `/ops/clients/[slug]` 路徑（`page.tsx:60-64` 伺服器端換成 uuid）。 |
| 網址參數名 | `org`、`site`。API 參數名（`organizationId`／`siteId`）不改。 |
| 來源 | ① session 綁定客戶（客戶帳號，`x-ops-org-id`）② 主機綁定客戶（白牌 `custom_domains`，未實作）③ 網址 `org`／`site`（員工）。 |
| ① 與 ② 並存 | 相同 → 用它；不同 → 拒絕（403 頁，不顯示任何資料），不取高者（ADR 018 `:32`：白牌主機＝該計費帳戶）。 |
| 客戶帳號 | org 恆為 ①；網址 `org`／`site` 不屬於他 → 從網址移除（`router.replace`），不查名、不報錯。客戶欄不列客戶清單。 |
| 員工 ＋ ② | 白牌主機上 org 恆為 ②，網址 `org` 不同 → 移除。 |
| 員工 ＋ 只有 ③ | 網址決定；每分頁獨立；無跨分頁 cookie／localStorage（VW cookie 見 3d）。 |
| 員工在產品門 | 與 app 主機同一個客戶欄、同一規則；客戶清單經 U4 在產品門對員工開放，能讀的範圍與 app 主機相同（3b）。 |
| 「沒選客戶」唯一定義 | `org` 為空＝**未選**：頁面不載任何客戶資料，客戶欄顯示「請先選客戶」。空值永不代表自用。 |
| 自用 | ＝內部組織（`kind='internal'`，`subject.ts:45`）的明確 id，客戶欄列為「AwareWave 自己」一列，選了就寫進網址 `org=<內部 id>`。 |
| 自動選 | 呼叫者可見的客戶恰 1 個（客戶帳號；買斷單一客戶安裝）→ 自動選；可見網站恰 1 個 → 自動選。都寫回網址。 |
| site 推 org | 只給 `site` → `org = site.organization_id`，寫回網址補上 `org`。 |
| 換客戶 | `setOrg` 一律清掉 `site` 與依附 site 的參數（`topic`、`month`）。 |
| 不一致 | `site` 不屬 `org`、`site` 不存在、無權 → 狀態 `site_mismatch`／`not_found`／`forbidden`：不選、不載、客戶欄寫原因；**不得**退回第一個（畫面與伺服器同規則，K6）。客戶帳號永不看到 `not_found`／`forbidden`（已被「客戶帳號」列移除）。 |
| 舊參數 | `siteId`→`site`（本批）；`slug`、`client_slug`、`brand`（後續批）；`organizationId`（VW 頁，3d）；localStorage `sf_site` 讀到即刪。 |
| 主機 | 只在伺服器算（`hosts.ts`），經外框 provider 傳給瀏覽器；瀏覽器端模組不得 import `lib/portal/hosts.ts`。 |
| 伺服器驗證 | 授權規則不變（`effectiveOrgId`／`assertOrgAccess`／`canAccessOrg`／`siteRowGate`）；`resolveWpSite` 無 siteId 時：客戶身分且可存取網站恰 1 個 → 該站，其餘 → null（K6）。 |

### 3b. 伺服器資料來源（各一條）

| 資料 | 唯一來源 | 本批改動 |
|---|---|---|
| 客戶清單／搜尋（員工；app 主機與產品門） | `GET /api/ops/org-search`（歸 `staff-tools.ts:20` 的格，不擴權） | K3 加 `?include=<uuid>`；U3 加類別；U4 產品門放行＋路由內 `staffOnly` |
| 客戶自己的組織名（客戶帳號） | 外框伺服器端由 `x-ops-org-id` 讀 `organizations` 一列，以 prop 傳下 | K5 |
| 內部組織 id | 外框伺服器端 `resolveSubject({})`（同 `session/route.ts:44`） | K5 |
| 某客戶的網站清單 | `GET /api/content/sites?organizationId=<uuid>`；只給 site 時 `?siteId=<uuid>` 回那一站（含 `organization_id`） | K3；不帶參數行為不變 |
| 目前客戶的功能狀態（員工替客戶） | `GET /api/entitlements/features?org=<uuid>`，以 `actorFor` 驗證後才換主體 | U5 |
| 狀態判定 | 瀏覽器端純函式 `decide()`（K2），輸入＝session／主機 org、網址、上列回應 | — |

**產品門上員工換客戶（U4；2026-11-22 讀程式驗證可行）**

1. `doors.ts` 新增 `STAFF_DOOR_APIS = ["/api/ops/org-search"]`；`routeOnProductDoor`（`doors.ts:107-111`）對這些路徑回 `pass`。**不**加進 `isProductPath`（`doors.ts:93-96`），**不**加進 `PLATFORM_APIS`（`doors.ts:66`）。
2. 結果（`middleware.ts` 不改）：客戶身分 → `isClientOutsideDoor` 為真（`middleware.ts:231-234`）→ 403 `forbidden`（`:246-249`）；未登入 → 401（`:191-194`）；員工 → `staffToolDenial`（`:147-150`）照 `toolsFor` 的格，enforce 模式沒勾格者 403 `tool_not_granted`（`:155-156`），shadow 模式只記錄（與 app 主機今天相同）；`productApiDenial` 對員工放行（`door-access.ts:25`）。
3. 路由內加 `staffOnly`（`tenant-guard.ts:129-131`）當第二層，關掉 F16。
4. 授權格：不進 `STAFF_PLATFORM.apis`（`staff-tools.ts:64`），員工能讀客戶名單的範圍不變，只多「從哪個網址呼叫」。頁面開始登記 `org` 層時，該產品格必須在 `STAFF_API_OWNERS["/api/ops/org-search"]`（`staff-tools.ts:20`）；本計畫只需加 `video`（K11 的 `/tools/video`），content 已在。
5. 限制：影片產品畫面由 VW 容器供給（`products.ts:52-53` `uiService`），客戶欄放不進 VW，沿用 3d。
6. 登入：cookie 每主機一份（1c）；員工在子網域用同一個登入表單，或從 app 帶 `?org=` 的連結過去（K5、K11）。

### 3c. 前端積木

| 名稱 | 檔 | 介面 |
|---|---|---|
| 契約 | `lib/client-context/contract.ts` | `PARAM`；`type Layer = "org" \| "site"`；`normalizeQuery(sp)`；`decide(input)` 回 `{ status, orgId, siteId }`；`withContext(href, ctx)`：只收已算好的 href（含主機字串），帶上目前 `org`、`site` |
| provider | `app/ClientContextProvider.tsx` | 外框掛一次；收伺服器 prop `{ sessionOrg, hostOrg, internalOrgId, hosts, onDoor }`；讀 `useSearchParams`（reactive）；抓網站清單一次、全頁共用；保存「本頁登記的層」 |
| hook | `lib/client-context/use-client-context.ts` | `useClientContext(layer)`：頁面呼叫＝向 provider 登記本頁要哪一層（外框因此知道要不要畫客戶欄）；回 `{ status, org, site, sites, setOrg, setSite }`；`setOrg` 依 3a 清 `site` |
| 客戶欄 | `app/ClientRail.tsx` | 外框左欄旁第二欄（桌面 220px；平板抽屜；手機收進底列「更多」，藍圖 §9.1、§11、§19.5）；本頁沒登記 → 不渲染。員工：org 層＝`OrgPicker fill`，searchPath `/api/ops/org-search`（app 主機與產品門同一支）；「AwareWave 自己」一列；頂端「客戶頁 →」。客戶帳號：無客戶清單；本頁登記 site 層時只顯示自己的網站按鈕。site 層＝該客戶網站按鈕，排在清單下方。錯誤文字（3a「不一致」）。類別按鈕列由 U3 加（單選、看得見、不是下拉；畫法＝線框圖第 15 頁 A，`README.md` §5） |
| 外框與選單 | `app/PlatformFrame.tsx`、`app/NavRail.tsx`（K5，合併 `(shell)/layout.tsx`＋`ProductDoorShell.tsx`、`SidebarNav.tsx`＋`DoorNav.tsx`，藍圖 §9.1） | 每個內部連結經 `withContext` 帶網址上現有 `org`、`site`；目標頁不登記就忽略（無害）；外部連結不帶。視覺沿用既有 `.sidebar`／`.door-side` class；本計畫不改 `globals.css`（主題工作佔用中，新 class 留給藍圖 U13／U14） |
| 跨網域 | 伺服器算 `https://<host>`（`hosts.ts`）→ provider `hosts[productKey]` → `withContext` | 新增產品列＝`hosts` 自動多一項，零手改 |

「外框怎麼知道此頁要哪一層」：頁面元件呼叫 `useClientContext(layer)` 即登記；外框只看登記，不看選單資料。同一事實只在頁面寫一次。

### 3d. VW（cookie 保留，角色限定）

- cookie＝VW 主機內的 session 狀態（每個子請求授權，`session/route.ts:29-31`），不跨主機。
- VW 身分永遠是明確 org：沒有 cookie 時 VW 用內部組織（`session/route.ts:43-45`）＝3a 的「自用」，顯示為「AwareWave 自己」；VW 沒有「未選」狀態（每個請求需要計費主體）——這是唯一例外，ADR 020 明列。
- 進入：`https://<video host>/handoff?open=X&org=Y` →（handoff 轉）`/?open=X&org=Y` → VW 殼：Y 等於 identity → 移除 `org`；不同 → 開既有切換對話框預選 Y，按一下才切（mediaReady→flush→lock→POST organization→BroadcastChannel，`organization-picker.js:84-95`）；切換後回到 `/?open=X`（不是 `/`，`organization-picker.js:95`）；取消＝留原客戶、移除 `org`。
- VW 內頁 `?organizationId=`（review-release）必須等於 identity，不同 → 文字「這支影片屬於另一個客戶，請先切換」，不載資料。
- 衝突：VW 內以 cookie 為準（`session/route.ts:31` 已擋 header 與 cookie 不同）。

### 3e. 以客戶頁 vs 功能頁分工

| | `/ops/clients/[slug]`（以客戶） | 功能頁（以功能） |
|---|---|---|
| 放什麼 | 這個客戶是什麼：設定、連線、健康、問題、帳務；每個功能一行狀態＋「去做」連結 | 做事：產出、審核、發布 |
| 客戶怎麼來 | 路徑 slug | 客戶欄（網址 `org`／`site`） |
| 互連 | 外連 `withContext("/tools/...", { org: id, site })` | 客戶欄頂端「客戶頁 →」（只員工） |
| 問題清單 | `/ops/clients` 落地頁：有問題的客戶排前面 | 客戶欄類別「需處理」（U3） |
| 網站設定 | 同一組元件（`sites/*Buttons.tsx`）：客戶頁「內容工具」分頁按站顯示；入口門「網站」頁給客戶 | — |
| 會員連結／代辦／授權（ADR 021 G1、G4、G5） | 員工端：「帳號」分頁（`[slug]/AccountsCard.tsx`，`ClientHubTabs.tsx:2557`）；客戶自助授權在 portal（組織層，藍圖 U19）。卡號 M5、M8、U19 見 `DISPATCH.md`，排在 K10 之後 | — |

## 4. 卡片與波次

通則：每卡一個 commit；交回 `FILES/TESTS/RISKS` 三行；`.ts/.tsx` 改完 `npx tsc --noEmit`；只跑卡內點名測試；回報操作者一律繁體中文。不放 `DEPLOY_HOLD`（它擋所有 app 的部署含手動，`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh:204-217`）：每卡自身完整，可隨每晚 03:00 自動部署上線；未完成的功能靠「尚無入口」不讓使用者看到，不新增 feature flag；High 卡 push 前取得操作者明示。批次、模型、派工單只在 `DISPATCH.md`。

藍圖卡的歸屬（重複只留一張）：U1（外框＋選單合併）→ 併入 K5；U2（客戶欄本體）→ 併入 K4，類別列 → U3；U15（客戶欄 `?org` 帶入連結）→ 併入 K5（同主機）與 K11（跨網域開 VW）。U3、U4、U5 屬目前客戶，定義在本節；藍圖 §17.2 只留指標。

### 第 1 波：基礎（畫面幾乎不變）

| 卡 | 一句話 | 檔案（獨佔） | 刪除／相容 | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|---|
| K1 | ADR 020「目前客戶」 | 新 `agency-os/docs/architecture/decisions/020-client-context.md`；`ADR_INDEX.md`（加 020 列；021 列刪「020 保留給…」一句） | — | 含 3a 全表、3b（含產品門 6 點）、3d 的 VW 例外、4c 排除表；`node scripts/verify-governance-pointers.mjs` 綠 | Low | — |
| K2 | 契約純函式 | 新 NA `lib/client-context/contract.ts`、`lib/client-context/__tests__/contract.test.ts` | — | 3a 每一列一個測試：①②不同拒絕、客戶帳號移除他人參數、空 org＝未選、內部 id＝自用、可見恰 1 自動、site 推 org、`setOrg` 清 site/topic/month、mismatch 不選、`siteId`→`site` | Low | — |
| K3 | 兩條既有 API 加篩選 | NA `app/api/ops/org-search/route.ts`、`route.test.ts`；`app/api/content/sites/route.ts`、新 `app/api/content/sites/__tests__/sites-filters.test.ts` | 不帶新參數時回應不變 | org-search：`?include=<uuid>` 不在第一頁時補該列（同 `bootstrap/route.ts:43-45`）、非 uuid 忽略、權限與歸格不變；sites：`?organizationId=` 經 `effectiveOrgId` 驗後 `.eq` 篩、客戶帳號帶他人 id 仍只回自己、`?siteId=` 回單站或空；`organizations-bounded.test.ts`、`staff-tools.test.ts` 綠 | Medium | — |
| K4 | provider、hook、客戶欄 | 新 NA `app/ClientContextProvider.tsx`、`lib/client-context/use-client-context.ts`、`app/ClientRail.tsx`、各自 test | — | render：無頁登記 → 無客戶欄；登記 org → `OrgPicker fill`；登記 site → 網站按鈕在清單下方；全頁只抓一次網站清單；換網址參數不 remount 也重算；客戶帳號無客戶清單；員工在 app 主機與產品門 searchPath 同為 `/api/ops/org-search`；`client-picker-rule.test.ts` 綠 | Medium | K2、K3 |
| K5 | 外框＋選單合併、掛 provider、選單帶參數（併 U1、U15 同主機部分） | NA `app/ProductDoorShell.tsx`、`app/(shell)/layout.tsx`、`app/DoorNav.tsx`、`app/SidebarNav.tsx`、新 `app/PlatformFrame.tsx`、`app/NavRail.tsx`、上列各自 test | `DoorNav`、`SidebarNav` 併入 `NavRail` 後刪舊檔；`DoorNav.tsx:26-35`「功能」清單本卡照搬不刪（U11 刪） | 外框伺服器端算 `{ sessionOrg, hostOrg: null, internalOrgId, hosts, onDoor }` 傳 provider；`NavRail` 連結帶網址上現有 `org`／`site`；原 DoorNav／SidebarNav 測試移到 NavRail 後全綠；`globals.css` 無 diff | Medium | K4 |
| U4 | 員工在產品門可搜尋客戶 | NA `lib/portal/doors.ts`、`lib/portal/staff-tools.ts`（org-search 格加 `video`）、`app/api/ops/org-search/route.ts`（`staffOnly`）、`lib/portal/__tests__/doors.test.ts`、`staff-tools.test.ts`、`registry-code.test.ts`、新 `lib/__tests__/middleware-staff-door-api.test.ts` | 其他 staff API 在產品門仍 404 | 產品門上 GET org-search：客戶 403 `forbidden`、未登入 401、owner 200、enforce＋沒勾格的員工 403 `tool_not_granted`；`STAFF_PLATFORM.apis` 不含它；路由直呼帶 `x-ops-user-kind: client` → 403；突變：拿掉 `staffOnly` → 直呼測試紅、還原綠 | **High**（產品門授權邊界） | K3（同檔） |
| U5 | 員工看「目前客戶」的功能狀態 | NA `app/api/entitlements/features/route.ts`、新 `app/api/entitlements/features/__tests__/route-org.test.ts`、`lib/entitlements/use-paid-features.ts` | 無 `?org` 行為不變 | 員工 owner／admin `?org=X` → `list.subject`＝X 的根；員工對 X 無角色 → 403 `not_authorized_for_org`；客戶 `?org=` 他人 → 403、自己 → 同無參數；非 uuid → 400；hook 帶客戶欄的 org；突變：拿掉 `actorFor` → 403 測試紅、還原綠 | **High**（權益判定） | K4、U6 |

上線後看得到：選單連結會保留網址上的 `org`（例：開發信 `?org=X` 點「工具串接」直接開 X）；app 與產品門的左欄變成同一個元件、外觀不變；尚無頁面登記，客戶欄不出現。Rollback：反轉 K5（連結回到不帶參數、外框回到兩份）；U4 反轉＝產品門回到 404；U5 反轉＝員工回到內部帳戶清單；K1–K4 無畫面。

### 第 2 波：逐頁切換（每卡各自可上線）

| 卡 | 一句話 | 檔案（獨佔） | 刪除／相容 | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|---|
| K7 | 內容編輯改用客戶欄 | NA `app/(shell)/tools/content/ContentStudio.tsx`、`app/(shell)/tools/content/__tests__/ContentStudio.site-wiring.test.tsx`；刪 `lib/content/pick-initial-site.ts`、`lib/content/__tests__/pick-initial-site.test.ts` | 刪 `ContentStudio.tsx:482,488-510,748-782`、select `:1950-1960`、`:2199-2213`、`unresolvedSiteParam`；舊 `?siteId=` 由 hook 換成 `site` | 頁內無 select；網站由客戶欄挑；未選站不呼叫 patterns／categories／tags；`saveAsClientDefault` 無 site 時停用；舊連結進來網址變 `?org=&site=` | Medium | K3、K5 |
| K6 | 伺服器關掉「沒給網站取第一個」 | NA `lib/content/wp-sites.ts` 與其 tests | `wp-sites.ts:123-126` 後備改為：客戶身分且可存取恰 1 站 → 該站；其餘 → null（呼叫端既有 404） | 13 個呼叫點（categories、patterns、related-posts、tags、wp-post、video/wp-posts、`wordpress-core.ts:337`、`wp-post-core.ts:61`、`social-org.ts:29`、`embed-in-post.ts:150,216,378`）測試綠；員工不帶 siteId → 404；`orgIdentity` 單站排程照常 | **High**（租戶解析；改發文路徑） | K7 |
| K8 | 題目、五步驟改用客戶欄；刪 R8 客戶頁 | NA `app/(shell)/tools/content/topics/` 的 `TopicsBoard.tsx`、`AutoContentOverview.tsx`、`StaffTopicsBoard.tsx`、`TopicsPageContent.tsx`、`__tests__/*`；`app/content/topics/DoorTopicsBoard.tsx`；刪 `app/content/topics/clients/page.tsx`、`app/(shell)/tools/content/topics/clients/page.tsx`；`lib/portal/products.ts:79`、`app/sidebar-sections.ts:82` 兩個選單項 | 刪 `TopicsBoard.tsx:151,156,159,193-203,400,421-428,443`；`AutoContentOverview.tsx:44-117`；`TopicsView` 的 clients；`pickClient`。`?site=&month=&topic=` 連結（`app/video/(wb)/__tests__/schedule.test.tsx:59`）照常 | 頁無自畫挑站；未選 site 不 fetch；`TopicsBoard.views.render.test.tsx`、`sidebar-coverage.test.ts`（主題 session 改動中：只跑不改，要改先協調）、`products.test.ts` 綠 | Medium | K3、K5 |
| K9 | 網站頁＝一個客戶的網站 | NA `app/(shell)/tools/content/sites/SiteManager.tsx`、`app/(shell)/tools/content/sites/page.tsx`、`app/content/sites/page.tsx`、`sites/__tests__/SiteManager*` | SiteManager 改抓 `/api/content/sites?includeInactive=1&organizationId=`（取代 `:605` 整表） | 員工未選客戶 → 客戶欄「請先選客戶」；新增網站 POST 帶目前 org（`route.ts:135-137` 已收）；客戶帳號只見自己 | Medium | K3、K5 |
| K10 | 客戶頁多站＋外連帶客戶＋落地頁問題清單 | NA `app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx`、`app/(shell)/ops/clients/page.tsx` | 刪 `ClientHubTabs.tsx:211-212`（wpSites[0]）、`:550,556` 舊 `?siteId=` | 多站客戶每站一塊；外連 `/tools/content?org=ID&site=ID`；`/ops/clients` 列有問題的客戶（`loadOverview` 的 `row.problem`），連 `/ops/clients/SLUG?tab=內容工具` | Medium | K2、K7 |
| U3 | 客戶欄類別（併藍圖 U2 的類別部分） | NA `app/api/ops/org-search/route.ts`、`route.test.ts`、`app/ClientRail.tsx` 與其 test | 不帶 `category` 回應不變 | `?category=` 只收封閉清單（全部／需處理／訂閱／贈送／只有點數；代操、經銷、TEST 由 M3 加）；每列回 `tags[]`；篩選在伺服器、查詢有界（`organizations-bounded.test.ts` 綠）；類別鈕單選、看得見、不是下拉；100 個客戶 mock 開頁到看見指定客戶 ≤ 3 次點擊 | Medium | K4、U4（同檔） |

上線後看得到：內容編輯、題目、五步驟、網站四頁左側出現客戶欄（員工）；頁內挑選介面消失；側欄與入口選單少了「題目 › 客戶」；客戶頁「內容工具」可改每一站；`/ops/clients` 首頁列出有問題的客戶；員工打開內容頁沒帶客戶會先被請挑；員工在 content 子網域也能搜尋並換客戶；客戶欄上方有類別鈕。Rollback：反轉單卡；K8 反轉會一併恢復兩個選單項與頁。

### 第 3 波：VW 進入點

| 卡 | 一句話 | 檔案（獨佔） | 刪除／相容 | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|---|
| K11 | 主系統側：帶客戶開 VW、VW 內頁比對（併 U15 跨網域部分） | NA `app/(shell)/tools/video/` 的 `OpenWorkbench.tsx`、`WorkbenchEntry.tsx`、`ScriptForge.tsx`、`ReleaseDeliveryPanel.tsx`；`app/video/(door)/handoff/page.tsx`、`ScriptHistoryHandoff.tsx`；`app/video/(wb)/review-release/page.tsx`、`ReviewRelease.tsx`；相關 tests | 刪 `ScriptForge.tsx:1145,1184` 的 `sf_site`（讀到即 removeItem）；`ScriptForge.tsx:1176`、`ReleaseDeliveryPanel.tsx:89` 改抓 `/api/content/sites?organizationId=`；`/release?organizationId=` 舊連結照轉 | `/tools/video` 頁呼叫 `useClientContext("org")`（客戶欄出現）；開 VW 帶目前 org，主機用伺服器傳的 `videoHost`；handoff 轉送 `org`；review-release 的 org 與 identity 不同 → 文字、不載 | Medium | K3、K5、U4（video 格） |
| K12 | VW 殼讀 `?org` → 一鍵確認切換 | VW `scripts/index-1.js`、`scripts/organization-picker.js`、`tests/` 新 cjs | 無 `org` 參數行為不變 | org 等於 identity → 移除參數不開窗；不同 → 對話框預選、取消不切；切換仍走 flush、lock、POST、BroadcastChannel；切換後落在 `/?open=` 原值（`organization-picker.js:95` 現為 `/`） | **High**（改 VW cookie 切換流程；VW 手動部署） | K11 |

上線後看得到：從 app 的影音工作台頁（已在客戶欄挑客戶）開 VW，若 VW 目前是別的客戶會跳確認窗，切完直接到原本要開的工具；審片頁開到別的客戶的影片會提示先切換。Rollback：反轉 K12 並重新部署 VW（回到只有對話框切換）；反轉 K11。

### 第 4 波：檢查器與驗收

| 卡 | 一句話 | 檔案（獨佔） | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|
| K13 | 檢查器：禁止私藏客戶來源與自畫客戶挑選 | 新 NA `lib/client-context/__tests__/no-private-context.test.ts` | 掃描範圍由 `PRODUCTS[].door.page`＋`STAFF_ROUTE_GROUPS`（`doors.ts:72`）推出；`searchParams.get` 取 org／site／siteId／slug／client_slug／brand、localStorage 存 site／org／client、挑網站 select、fetch `/api/content/sites` 不帶篩選、頁面自畫 `OrgPicker` 當目前客戶 → 紅（`lib/client-context/*`、`app/ClientRail.tsx`、`LEGACY` 白名單除外；白名單＝後續批的檔，只減不增）；突變：ContentStudio 加回 `searchParams.get("siteId")` → 紅、還原 → 綠 | Low | K7–K11 |
| K14 | 新增產品入口零手改的驗收 | 新 NA `lib/client-context/__tests__/new-door.test.ts` | §4b 全部 | Low | K5、K13 |
| K15 | 期末閘 | 無程式檔；WORKLOG、`DISPATCH.md` 狀態欄 | critic＋`/codex-review`（額度未恢復時 critic＋書面對抗自審＋突變證據）；本機實測：舊 `?siteId=` 轉新參數；側欄換頁保留；客戶帳號帶他人 `?org=` 被移除；員工在 content 子網域搜尋並換客戶；從 app 帶 org 開 VW 出確認窗；以 `PRODUCT_HOST_CONTENT=brand-x.test` 起本機重跑同組；四動作證據行 | — | 全部 |

上線後看得到：無畫面變化（測試）。Rollback：反轉測試檔。

### 先後總表

- 第 1 波：K1、K2、K3 並行 → K4 → K5；U4（K3 後）；U5（K4、U6 後）。
- 第 2 波：K7、K8、K9 並行 → K6、K10（皆需 K7）；U3（K4、U4 後）。
- 第 3 波：K11（K5、U4 後）→ K12。
- 第 4 波：K13 → K14 → K15。
- 關鍵路徑：K2 → K4 → K5 → K7 → K6 → K13 → K14 → K15。
- 會員卡 M5、M8、U19（ADR 021 G1、G5、G4）排在 K10 之後（同客戶頁）；編號與批次見 `DISPATCH.md`。

### 4b. 新增產品入口零手改（K14）

前提（已驗）：主機由設定推導，`PRODUCT_HOST_<KEY>` 可為任意獨立主網域（`hosts.ts:26-28`）；`doorForHost(host, env)` 吃 env（`doors.ts:30-35`）；選單來自登記表 `door.nav`（`ProductDoorShell.tsx:41-42`）。所有斷言迴圈走 `PRODUCTS`，不寫產品名或網域。

| # | 斷言 |
|---|---|
| T1 | 每個 next-admin 門且未停用的列，以 env `PRODUCT_HOST_<KEY>=<key>-brand.example` 與預設子網域各跑：`doorForHost` 回該產品門 |
| T2 | 外框伺服器端產生的 `hosts` 對照表涵蓋每個上述產品，值等於 `productHost(p, env)` |
| T3 | jsdom 中先刪除 `process.env.PRODUCT_HOST_*`，以 provider prop 給 `hosts`（獨立主網域）渲染 `NavRail` 與 `ClientRail`：跨網域連結主機＝prop 值、query 帶 `org`／`site`（會暴露「瀏覽器端讀 env 被換回子網域」） |
| T4 | 靜態掃描：任何 use client 檔與 `lib/client-context/*` 不得 import `lib/portal/hosts` 或讀 `process.env.PRODUCT_HOST` |
| T5 | 靜態掃描：`lib/client-context/*`、`app/ClientContextProvider.tsx`、`app/ClientRail.tsx`、`app/PlatformFrame.tsx`、`app/NavRail.tsx`不得有網域字面值（`aware-wave` 等）或 cookie `domain` 參數 |
| T6 | K13 檢查器的掃描集合 ⊇ 每個 `door.page` 對應的 app 目錄 |
| 突變 | `withContext` 改成拼 `.aware-wave.com` → T3、T5 紅；`ClientRail` import `hosts.ts` → T4 紅；還原 → 綠 |

### 4c. 排除的做法

| 做法 | 原因（證據） |
|---|---|
| 頂部客戶挑選列 | 操作者 2026-11-22 改為側欄客戶欄（`README.md` §2） |
| 父網域（如 `.aware-wave.com`）共用 cookie 存目前客戶 | 獨立主網域（`hosts.ts:27`）、白牌（ADR 018 `:32`）、買斷主機不共享父網域；ADR 018 `:71` 已禁；全瀏覽器一個值，多分頁互相覆蓋 |
| 每主機一份「目前客戶」cookie 或 localStorage | 不跨主機；同主機多分頁互相覆蓋（VW 為此另寫鎖，`organization-picker.js:17-28`、`adapters.js:141-160`）；`sf_site` 即反例 |
| 資料庫存每人目前客戶 | 需新表；所有分頁共用一值 |
| 路徑段 `/c/ORG/...` | 動全部路由；與產品門改寫衝突（`doors.ts:107-111`） |
| 每客戶一個子網域 | 每客戶 DNS 與憑證；買斷主機不成立 |
| middleware 把網址客戶寫成請求標頭 | 動 auth 路徑；`x-ops-org-id` 是 session 綁定（`middleware.ts:137-138`），混入會讓 `effectiveOrgId` 把員工選擇當客戶身分 |
| 新平台 API 掛 `PLATFORM_APIS` 回客戶清單 | `PLATFORM_APIS` 進 `STAFF_PLATFORM.apis`（`staff-tools.ts:64`）＝所有員工可讀客戶名單，違反 ADR 019 逐工具歸格（`staff-tools.ts:20`） |
| 把 org-search 加進 `isProductPath`（或產品的 `door.api`） | 客戶身分就會通過 `isClientOutsideDoor`（`middleware.ts:231-234`），而客戶角色解析為 `operator`（`ops-role.ts:11,50`），路由會回全部客戶名（F16） |
| 在 `routeOnProductDoor` 依身分放行 | 該函式在身分解析前執行（`middleware.ts:347-351` vs `:407-430`），拿不到身分；要做就得改 middleware（auth 路徑） |
| 把 `bootstrap` 客戶清單搬到門上可達的平台路徑 | 落入 `PLATFORM_APIS` 那列的擴權；員工在門上改用 U4（同一支 org-search、同一授權格） |
| 選單登記表加必填 `scope` 欄位＋雙向測試 | 同一事實兩處寫；改 56 個側欄項與全部 door nav；頁面登記即可讓外框知道 |
| 跨分頁 postMessage 或 BroadcastChannel 同步客戶 | 只同源；需兩頁同時開；不可書籤化 |
| 程式內寫死網域清單 | 違反 ADR 018 §2（`018-product-doors-and-buyout-delivery.md:28-32`） |
| 刪 VW cookie | nginx auth_request 子請求看不到頁面網址（`session/route.ts:11-13`） |
| 全程 `DEPLOY_HOLD` | 擋所有 app 含手動部署（`sg-deploy.sh:204-217`），VW 卡自相矛盾，且把整週改動壓成一次上線 |
| 新增 feature flag 框架 | 未完成功能靠「尚無入口」不顯示；每卡自身完整 |

### 4d. 後續批（不展開）

L1 開發信（`use-active-org.ts` 併入 hook；`organization_id IS NULL` 舊列＝「自用 / 未指定」，`use-active-org.ts:5-6`，需先決定歸內部組織，才能刪 null 語意；在此之前列入 K13 白名單）；L2 整合、資料蒐集（`?slug`→`org`）；L3 社群（`?brand`→`org`）；L4 維修、事件（`?client_slug`→`org`）；L5 橫幅、設計庫與 design、studio、tarot 入口；L6 VW 內頁 StoryBible、ReleaseDelivery 的 OrganizationPicker 改吃 identity；L7 `bootstrap` 客戶清單併入 `org-search`（兩者權限門檻不同，`org-search/route.ts:24` vs `bootstrap/route.ts:19`，先定門檻）；L8 白牌主機綁定（ADR 018 §2；屆時在 middleware 實作 3a 的 ① 與 ② 不同即拒，契約已定）。

## 5. 風險

| 風險 | 機率 | 影響 | 處置 |
|---|---|---|---|
| K5 讓選單帶 `org` 後，讀 `?org` 的舊頁（開發信、整合、橫幅）預選該客戶 | H | L | 這正是要的行為；三頁 `?org` 皆 uuid 同語意（1a #1-#4） |
| K5 合併兩個外框，產品門或 app 主機版面走樣 | M | M | 只用既有 class、`globals.css` 無 diff；原 DoorNav／SidebarNav 測試搬到 NavRail 全綠；兩主機各截圖比對 |
| U4 開了產品門上的一支 staff API | L | H | 客戶兩層擋（middleware 403＋路由 `staffOnly`）；不進 `PLATFORM_APIS`、`isProductPath`；High，push 前操作者明示；突變證據 |
| shadow 模式下沒勾格的員工在產品門也讀得到客戶名 | H | L | 與 app 主機今天相同（`staff-access.ts:10-11`）；enforce 由操作者另開（ADR 019） |
| K6 改變發文路徑：未帶 siteId 的呼叫改回 404 | M | M | 13 個呼叫點全跑測試；High，push 前操作者明示；只收窄不放寬 |
| 遷移中頁面同時有客戶欄與舊介面 | L | L | 頁面呼叫 hook 才出現客戶欄；同卡刪舊介面 |
| VW 確認窗誤點切錯客戶 | L | M | 沿用 flush、lock；其他分頁收 BroadcastChannel 被鎖 |
| 夜間自動部署帶上半套 | L | M | 每卡自身完整；High 卡未獲 go 不併 main |
| 舊書籤 `topics/clients` 404 | L | L | 接受（只有內部選單連結） |
| 一個客戶網站很多（超過 50）時網站按鈕過長 | L | L | 接受；出現時再加搜尋（記 TASKS 一行） |
| 獨立主網域上需重新登入 | H | L | 既有設計（每門各自登入，ADR 018 `:46`）；跨門走 `mintDoorLink` 的 next 帶同一 query |

Rollback：見各波；每卡單一 commit 可單獨反轉。

## 6. 操作者已定（2026-11-22，`README.md` §2、§5）

| 題 | 定案 |
|---|---|
| 員工打開功能頁、網址沒有客戶 | 不預選，客戶欄請先挑；「AwareWave 自己」是清單一列，按了才算自用 |
| 網站設定在哪裡改 | 員工在客戶頁「內容工具」分頁；客戶在內容入口「網站」頁；同一組元件 |
| 員工在產品子網域能不能換客戶 | 能（3b 產品門 6 點、U4） |
| 挑客戶介面 | 側欄客戶欄；類別畫法＝線框圖第 15 頁 A（類別篩選鈕） |

尚待：客戶欄「類別」依據（藍圖 Q1；建議＝合作方式＋需處理，TEST 預設隱藏）——只擋 U3，見 `DISPATCH.md`。

## 7. 審查回應（PLAN-REVIEW-20261121.md）

| 項 | 處理 |
|---|---|
| C1 | 採納：取消 HOLD，改四波（§4、4c） |
| A1 | 採納：網站清單唯一來源＝`/api/content/sites` 篩選（3b、K3）；不回 sites／status 的新路由 |
| A2 | 採納：不掛 `PLATFORM_APIS`；客戶清單沿用 org-search 既有歸格；產品門經 U4 只對員工開（3b、4c） |
| A3 | 採納：刪 scope 欄位與雙向測試，改頁面登記（3c） |
| A4 | 採納：`setOrg` 清 site、topic、month（3a） |
| A5 | 採納：空＝未選；自用＝內部組織 id；VW 例外明列（3a、3d） |
| A6 | 採納：① 與 ② 不同即拒（3a；實作在 L8） |
| A7 | 採納：K10 依賴 K7 |
| A8 | 採納：K6 本批關掉整類 |
| A9 | 採納：`/tools/video` 納入 K11 |
| A10 | 採納：K12 驗收切換後回 `/?open=` 原值 |
| A11 | 採納：主機只在伺服器算（3a、3c）；K14 T3、T4 |
| m1–m3 | 採納：F5 與 4c 改 `doors.ts:107-111`；F14 只留 `TopicsBoard.tsx:196-203`；刪 `(shell)/layout.tsx:36` 引用 |
| m6、m7、m8、m9 | 採納：provider 只抓一次（3c）；刪頁併入 K8；可見恰 1 自動（3a）；會員位置寫入 3e、會員卡排 K10 後 |
| m4、m5、m10、B1–B6 | 屬 ADR 021，不在本檔 |
| 審查 §5 第 1 點（C3：bootstrap 客戶清單搬到門上） | 不採搬家（4c）；員工在門上換客戶改由 U4 達成 |

## 8. 一致性檢查

- 檔案重疊：同檔只出現在有先後的卡：`org-search/route.ts` K3 → U4 → U3（依賴鏈）；`ClientRail.tsx` K4 → U3；`use-paid-features.ts` 藍圖 U6 → U5；外框四檔只在 K5；`products.ts`、`sidebar-sections.ts` 本檔只在 K8；`ContentStudio.tsx` 只在 K7；`wp-sites.ts` 只在 K6；`sites/route.ts` 只在 K3；`ClientHubTabs.tsx` 只在 K10；VW 兩檔只在 K12。跨三份文件的檢查在 `DISPATCH.md` 檔尾。
- 先後：K2→K4→K5→{K7,K8,K9,K11}；K3→{K4,U4,K7,K8,K9,K11}；U4→{U3,K11}；{K4,U6}→U5；K7→{K6,K10}；K11→K12；{K7..K11}→K13→K14→K15；無循環。
- 場景唯一答案：員工無參數＝未選；員工選自己＝內部 id；客戶帶他人參數＝移除；只給 site＝推 org；site 不屬 org＝mismatch；同頁換客戶＝清 site；可見恰 1＝自動；白牌與 session 不同＝拒；員工在產品門＝同一客戶欄、同一授權格；客戶打 org-search＝403；VW 無 cookie＝內部組織（唯一例外）；app→VW 客戶不同＝確認後切；獨立主網域＝伺服器算主機＋網址帶參數——3a、3b、3d 各一列，無重複或衝突。
