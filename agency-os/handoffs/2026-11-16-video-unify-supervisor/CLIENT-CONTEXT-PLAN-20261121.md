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
- 主機名由伺服器 env 推導（`hosts.ts:26-28` 讀 `process.env`）；瀏覽器端元件讀不到 `PRODUCT_HOST_*`，所以主機必須在伺服器算好再傳下（現行正確做法：`app/(shell)/tools/video/WorkbenchEntry.tsx:14` 以 prop 傳 `videoHost`）。

### 1d. 現成可用、不新造的機制

| 機制 | 檔:行 | 本計畫用途 |
|---|---|---|
| 伺服器授權 | `lib/tenant-guard.ts:100-122,193-216`；`lib/content/wp-sites.ts:111-132,153-161` | 唯一授權點；只改 `resolveWpSite` 無 siteId 的後備（K6） |
| 網址寫回的挑客戶積木 | `ops/clients/OrgPicker.tsx:101,167-189` | 頂部列第一層直接用 |
| 員工端客戶搜尋 | `app/api/ops/org-search/route.ts:22-47`；歸格 `lib/portal/staff-tools.ts:20`（6 個工具，含 content） | 頂部列的唯一客戶清單來源（員工主機），加 `?include=`（K3） |
| 客戶的網站清單 | `app/api/content/sites/route.ts:40-110`（客戶只見自己，`:74`；不回 token，`:84-85`） | 「某客戶的網站清單」唯一來源，加 `?organizationId=`／`?siteId=` 篩選（K3） |
| 內部組織（自用） | `lib/entitlements/subject.ts:45`（`kind='internal'`）；`session/route.ts:43-45` 用 `resolveSubject({})` 取它 | 「AwareWave 自己」＝這個明確 id |
| 開發信 hook | `lib/outreach/use-active-org.ts:9-20` | 泛化後刪除（後續批 L1） |
| 入口 context provider | `app/DoorContext.tsx:8-22`、`lib/portal/door-href.ts:6-11` | 同型做法：外框設定，頁面讀 |
| 外框已是動態渲染 | `(shell)/layout.tsx:17`、`ProductDoorShell.tsx:19`（都呼叫 `headers()`） | 外框可放 `useSearchParams` 的 client 元件，不觸發靜態渲染錯誤 |
| 「指定取不到不得靜默換」不變量 | `lib/content/pick-initial-site.ts:23`、`ContentStudio.tsx:489-507` | 搬進契約後刪 |
| 產品主機推導 | `lib/portal/hosts.ts:26-28` | 只在伺服器端呼叫，結果傳下 |
| middleware 標頭 | `middleware.ts:24,137-138` | **不**加新標頭（auth 路徑，不動） |

## 2. 現況漏洞（設計要關掉的類）

| # | 漏洞 | 證據 |
|---|---|---|
| F1 | VW cookie 是 VW 每個子請求的授權依據（nginx auth_request 看不到頁面網址），不能刪；缺的是「網址→cookie」入口與 VW 內兩來源的一致性：staff 開 VW 不帶客戶；review-release 用網址 org、VW 請求用 cookie org，互不比對 | `session/route.ts:11-13,29-32`；`OpenWorkbench.tsx:37`；`review-release/page.tsx:12` vs `adapters.js:121-127` |
| F2 | 至少八種傳法；識別符不一：`?org`=uuid，`?slug`／`?client_slug`=slug，`?brand`=uuid，`?siteId`／`?site` 同義兩名 | 1a #1-#9、#12、#17 |
| F3 | 「網站」層讀整表：`/api/content/sites` 無 org 篩選、無上限；`loadOverview` 也整表 | `api/content/sites/route.ts:48-53`；`lib/content/topics/overview-load.ts:54`；R10 盤點第 9 列 |
| F4 | 挑選介面由各頁自畫，位置與規則不一；兩份選單沒有「此頁要哪一層」的資訊 | 1a #2、#6、#13、#18、#19；`products.ts:11`、`sidebar-sections.ts:9` |
| F5 | 客戶登入時畫面若用網址 uuid 查名顯示＝誤導；產品門上 `/api/ops/org-search` 一律 404 | `tenant-guard.ts:198-205`；`doors.ts:107-111`（`:109` not_found） |
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

## 3. 單一設計

### 3a. 契約（ADR 020 照抄此表）

| 項 | 規定 |
|---|---|
| 識別符 | 客戶＝`organizations.id`（uuid）；網站＝`wp_sites.id`（uuid）。slug 只留在 `/ops/clients/[slug]` 路徑（`page.tsx:60-64` 伺服器端換成 uuid）。 |
| 網址參數名 | `org`、`site`。API 參數名（`organizationId`／`siteId`）不改。 |
| 來源 | ① session 綁定客戶（客戶帳號，`x-ops-org-id`）② 主機綁定客戶（白牌 `custom_domains`，未實作）③ 網址 `org`／`site`（員工）。 |
| ① 與 ② 並存 | 相同 → 用它；不同 → 拒絕（403 頁，不顯示任何資料），不取高者（ADR 018 `:32`：白牌主機＝該計費帳戶）。 |
| 客戶帳號 | org 恆為 ①；網址 `org`／`site` 不屬於他 → 從網址移除（`router.replace`），不查名、不報錯。 |
| 員工 ＋ ② | 白牌主機上 org 恆為 ②，網址 `org` 不同 → 移除。 |
| 員工 ＋ 只有 ③ | 網址決定；每分頁獨立；無跨分頁 cookie／localStorage（VW cookie 見 3d）。 |
| 「沒選客戶」唯一定義 | `org` 為空＝**未選**：頁面不載任何客戶資料，頂部列請先挑。空值永不代表自用。 |
| 自用 | ＝內部組織（`kind='internal'`，`subject.ts:45`）的明確 id，頂部列列為「AwareWave 自己」一列，選了就寫進網址 `org=<內部 id>`。 |
| 自動選 | 呼叫者可見的客戶恰 1 個（客戶帳號；買斷單一客戶安裝）→ 自動選；可見網站恰 1 個 → 自動選。都寫回網址。 |
| site 推 org | 只給 `site` → `org = site.organization_id`，寫回網址補上 `org`。 |
| 換客戶 | `setOrg` 一律清掉 `site` 與依附 site 的參數（`topic`、`month`）。 |
| 不一致 | `site` 不屬 `org`、`site` 不存在、無權 → 狀態 `site_mismatch`／`not_found`／`forbidden`：不選、不載、頂部列寫原因；**不得**退回第一個（畫面與伺服器同規則，K6）。客戶帳號永不看到 `not_found`／`forbidden`（已被上一列移除）。 |
| 舊參數 | `siteId`→`site`（本批）；`slug`、`client_slug`、`brand`（後續批）；`organizationId`（VW 頁，3d）；localStorage `sf_site` 讀到即刪。 |
| 主機 | 只在伺服器算（`hosts.ts`），經外框 provider 傳給瀏覽器；瀏覽器端模組不得 import `lib/portal/hosts.ts`。 |
| 伺服器驗證 | 授權規則不變（`effectiveOrgId`／`assertOrgAccess`／`canAccessOrg`／`siteRowGate`）；`resolveWpSite` 無 siteId 時：客戶身分且可存取網站恰 1 個 → 該站，其餘 → null（K6）。 |

### 3b. 伺服器資料來源（各一條）

| 資料 | 唯一來源 | 本批改動 |
|---|---|---|
| 客戶清單／搜尋（員工主機） | `GET /api/ops/org-search`（歸 `staff-tools.ts:20` 的 6 格，不擴權） | 加 `?include=<uuid>`：網址指定的客戶不在前 50 時補上（K3） |
| 客戶自己的組織名（客戶帳號） | 外框伺服器端由 `x-ops-org-id` 讀 `organizations` 一列，以 prop 傳下 | K5 |
| 內部組織 id | 外框伺服器端 `resolveSubject({})`（同 `session/route.ts:44`） | K5 |
| 某客戶的網站清單 | `GET /api/content/sites?organizationId=<uuid>`；只給 site 時 `?siteId=<uuid>` 回那一站（含 `organization_id`） | 加兩個篩選（K3）；不帶參數行為不變 |
| 狀態判定 | 瀏覽器端純函式 `decide()`（K2），輸入＝session／主機 org、網址、上兩項回應 | — |

產品門上不需要客戶清單：客戶帳號只有自己（①）；員工在產品門上不挑客戶，頂部列只顯示網址指定者並給「到 app 換客戶」連結（主機由伺服器傳）。

### 3c. 前端積木

| 名稱 | 檔 | 介面 |
|---|---|---|
| 契約 | `lib/client-context/contract.ts` | `PARAM`；`type Layer = "org" \| "site"`；`normalizeQuery(sp)`；`decide(input)` 回 `{ status, orgId, siteId }`；`withContext(href, ctx)`：只收已算好的 href（含主機字串），帶上目前 `org`、`site` |
| provider | `app/ClientContextProvider.tsx` | 外框掛一次；收伺服器 prop `{ sessionOrg, hostOrg, internalOrgId, hosts, onDoor }`；讀 `useSearchParams`（reactive）；抓網站清單一次、全頁共用；保存「本頁登記的層」 |
| hook | `lib/client-context/use-client-context.ts` | `useClientContext(layer)`：頁面呼叫＝向 provider 登記本頁要哪一層（外框因此知道要畫什麼）；回 `{ status, org, site, sites, setOrg, setSite }`；`setOrg` 依 3a 清 `site` |
| 頂部列 | `app/ClientContextBar.tsx` | 外框固定位置渲染；本頁沒登記 → 不渲染。org 層＝`OrgPicker`（員工主機 searchPath `/api/ops/org-search`；客戶帳號不顯示搜尋，只顯示名稱）；site 層＝該客戶網站按鈕；錯誤文字 |
| 選單帶參數 | `DoorNav.tsx`、`SidebarNav.tsx` | 每個內部連結經 `withContext` 帶網址上現有的 `org`、`site`；目標頁不登記就忽略（無害）。外部連結不帶 |
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
| 客戶怎麼來 | 路徑 slug | 頂部列（網址 `org`／`site`） |
| 互連 | 外連 `withContext("/tools/...", { org: id, site })` | 頂部列旁「客戶頁 →」（只員工主機） |
| 問題清單 | `/ops/clients` 落地頁：有問題的客戶排前面 | 不放客戶清單 |
| 網站設定 | 同一組元件（`sites/*Buttons.tsx`）：客戶頁「內容工具」分頁按站顯示；入口門「網站」頁給客戶 | — |
| 會員連結／代辦／授權（ADR 021 G1、G4、G5） | 員工端：「帳號」分頁（`[slug]/AccountsCard.tsx`，`ClientHubTabs.tsx:2557`）；客戶自助授權在 portal 工作區（組織層，不屬任一產品門）。只定位置；缺口卡排在 K10 之後 | — |

## 4. 卡片與波次（第一批：內容入口、客戶頁、VW 進入點）

通則：每卡一個 commit；交回 `FILES/TESTS/RISKS` 三行；`.ts/.tsx` 改完 `npx tsc --noEmit`；只跑卡內點名測試；回報操作者一律繁體中文。不放 `DEPLOY_HOLD`（它擋所有 app 的部署含手動，`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh:204-217`）：每波自身完整，可隨每晚 03:00 自動部署上線；High 卡 push 前取得操作者明示。

### 第 1 波：基礎（畫面幾乎不變）

| 卡 | 一句話 | 檔案（獨佔） | 刪除／相容 | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|---|
| K1 | ADR 020「目前客戶」 | 新 `agency-os/docs/architecture/decisions/020-client-context.md`；`ADR_INDEX.md`（填 020 列） | — | 含 3a 全表、3b、3d 的 VW 例外、4c 排除表；`verify-governance-pointers.mjs` 綠 | Low | — |
| K2 | 契約純函式 | 新 NA `lib/client-context/contract.ts`、`lib/client-context/__tests__/contract.test.ts` | — | 3a 每一列一個測試：①②不同拒絕、客戶帳號移除他人參數、空 org＝未選、內部 id＝自用、可見恰 1 自動、site 推 org、`setOrg` 清 site/topic/month、mismatch 不選、`siteId`→`site` | Low | — |
| K3 | 兩條既有 API 加篩選 | NA `app/api/ops/org-search/route.ts` 與其 test；`app/api/content/sites/route.ts` 與 `app/api/content/sites/__tests__/*` | 不帶新參數時回應不變 | org-search：`?include=<uuid>` 補該列、非 uuid 忽略、權限與歸格不變（`staff-tools.test.ts` 綠）；sites：`?organizationId=` 經 `effectiveOrgId` 驗後 `.eq` 篩、客戶帳號帶他人 id 仍只回自己、`?siteId=` 回單站或空 | Medium | — |
| K4 | provider、hook、頂部列 | 新 NA `app/ClientContextProvider.tsx`、`lib/client-context/use-client-context.ts`、`app/ClientContextBar.tsx`、各自 test | — | render：無頁登記 → 無頂部列；登記 org → OrgPicker；登記 site → 網站按鈕；全頁只抓一次網站清單；換網址參數不 remount 也重算；客戶帳號無搜尋框；產品門上員工只見名稱與「到 app 換客戶」 | Medium | K2 |
| K5 | 外框掛 provider、選單帶參數 | NA `app/ProductDoorShell.tsx`、`app/(shell)/layout.tsx`、`app/DoorNav.tsx`、`app/SidebarNav.tsx` | — | 外框伺服器端算 `{ sessionOrg, hostOrg: null, internalOrgId, hosts, onDoor }` 傳 provider；選單連結帶網址上現有 `org`／`site`；DoorNav／SidebarNav 既有測試綠 | Medium | K4 |

上線後看得到：選單連結會保留網址上的 `org`（例：開發信 `?org=X` 點「工具串接」直接開 X）；沒有頂部列。Rollback：反轉 K5（連結回到不帶參數）；K1–K4 無畫面。

### 第 2 波：逐頁切換（每卡各自可上線）

| 卡 | 一句話 | 檔案（獨佔） | 刪除／相容 | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|---|
| K7 | 內容編輯改用頂部列 | NA `app/(shell)/tools/content/ContentStudio.tsx`、`app/(shell)/tools/content/__tests__/ContentStudio.site-wiring.test.tsx`；刪 `lib/content/pick-initial-site.ts`、`lib/content/__tests__/pick-initial-site.test.ts` | 刪 `ContentStudio.tsx:482,488-510,748-782`、select `:1950-1960`、`:2199-2213`、`unresolvedSiteParam`；舊 `?siteId=` 由 hook 換成 `site` | 頁內無 select；未選站不呼叫 patterns／categories／tags；`saveAsClientDefault` 無 site 時停用；舊連結進來網址變 `?org=&site=` | Medium | K3、K5 |
| K6 | 伺服器關掉「沒給網站取第一個」 | NA `lib/content/wp-sites.ts` 與其 tests | `wp-sites.ts:123-126` 後備改為：客戶身分且可存取恰 1 站 → 該站；其餘 → null（呼叫端既有 404） | 13 個呼叫點（categories、patterns、related-posts、tags、wp-post、video/wp-posts、`wordpress-core.ts:337`、`wp-post-core.ts:61`、`social-org.ts:29`、`embed-in-post.ts:150,216,378`）測試綠；員工不帶 siteId → 404；`orgIdentity` 單站排程照常 | **High**（租戶解析；改發文路徑） | K7 |
| K8 | 題目、五步驟改用頂部列；刪 R8 客戶頁 | NA `app/(shell)/tools/content/topics/` 的 `TopicsBoard.tsx`、`AutoContentOverview.tsx`、`StaffTopicsBoard.tsx`、`TopicsPageContent.tsx`、`__tests__/*`；`app/content/topics/DoorTopicsBoard.tsx`；刪 `app/content/topics/clients/page.tsx`、`app/(shell)/tools/content/topics/clients/page.tsx`；`lib/portal/products.ts:79`、`app/sidebar-sections.ts:82` 兩個選單項 | 刪 `TopicsBoard.tsx:151,156,159,193-203,400,421-428,443`；`AutoContentOverview.tsx:44-117`；`TopicsView` 的 clients；`pickClient`。`?site=&month=&topic=` 連結（`app/video/(wb)/__tests__/schedule.test.tsx:59`）照常 | 頁無自畫挑站；未選 site 不 fetch；`TopicsBoard.views.render.test.tsx`、`sidebar-coverage.test.ts`、`products.test.ts` 綠 | Medium | K3、K5 |
| K9 | 網站頁＝一個客戶的網站 | NA `app/(shell)/tools/content/sites/SiteManager.tsx`、`app/(shell)/tools/content/sites/page.tsx`、`app/content/sites/page.tsx`、`sites/__tests__/SiteManager*` | SiteManager 改抓 `/api/content/sites?includeInactive=1&organizationId=`（取代 `:605` 整表） | 員工未選客戶 → 請挑；新增網站 POST 帶目前 org（`route.ts:135-137` 已收）；客戶帳號只見自己 | Medium | K3、K5 |
| K10 | 客戶頁多站＋外連帶客戶＋落地頁問題清單 | NA `app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx`、`app/(shell)/ops/clients/page.tsx` | 刪 `ClientHubTabs.tsx:211-212`（wpSites[0]）、`:550,556` 舊 `?siteId=` | 多站客戶每站一塊；外連 `/tools/content?org=ID&site=ID`；`/ops/clients` 列有問題的客戶（`loadOverview` 的 `row.problem`），連 `/ops/clients/SLUG?tab=內容工具` | Medium | K2、K7 |

上線後看得到：內容編輯、題目、五步驟、網站四頁最上方同一條「目前客戶／網站」；頁內挑選介面消失；側欄與入口選單少了「題目 › 客戶」；客戶頁「內容工具」可改每一站；`/ops/clients` 首頁列出有問題的客戶；員工打開內容頁沒帶客戶會先被請挑。Rollback：反轉單卡；K8 反轉會一併恢復兩個選單項與頁。

### 第 3 波：VW 進入點

| 卡 | 一句話 | 檔案（獨佔） | 刪除／相容 | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|---|
| K11 | 主系統側：帶客戶開 VW、VW 內頁比對 | NA `app/(shell)/tools/video/` 的 `OpenWorkbench.tsx`、`WorkbenchEntry.tsx`、`ScriptForge.tsx`、`ReleaseDeliveryPanel.tsx`；`app/video/(door)/handoff/page.tsx`、`ScriptHistoryHandoff.tsx`；`app/video/(wb)/review-release/page.tsx`、`ReviewRelease.tsx`；相關 tests | 刪 `ScriptForge.tsx:1145,1184` 的 `sf_site`（讀到即 removeItem）；`ScriptForge.tsx:1176`、`ReleaseDeliveryPanel.tsx:89` 改抓 `/api/content/sites?organizationId=`；`/release?organizationId=` 舊連結照轉 | `/tools/video` 頁呼叫 `useClientContext("org")`（頂部列出現）；開 VW 帶目前 org，主機用伺服器傳的 `videoHost`；handoff 轉送 `org`；review-release 的 org 與 identity 不同 → 文字、不載 | Medium | K3、K5 |
| K12 | VW 殼讀 `?org` → 一鍵確認切換 | VW `scripts/index-1.js`、`scripts/organization-picker.js`、`tests/` 新 cjs | 無 `org` 參數行為不變 | org 等於 identity → 移除參數不開窗；不同 → 對話框預選、取消不切；切換仍走 flush、lock、POST、BroadcastChannel；切換後落在 `/?open=` 原值（`organization-picker.js:95` 現為 `/`） | **High**（改 VW cookie 切換流程；VW 手動部署） | K11 |

上線後看得到：從 app 的影音工作台頁（已挑客戶）開 VW，若 VW 目前是別的客戶會跳確認窗，切完直接到原本要開的工具；審片頁開到別的客戶的影片會提示先切換。Rollback：反轉 K12 並重新部署 VW（回到只有對話框切換）；反轉 K11。

### 第 4 波：檢查器與驗收

| 卡 | 一句話 | 檔案（獨佔） | 驗收 | 風險 | 依賴 |
|---|---|---|---|---|---|
| K13 | 檢查器：禁止私藏客戶來源 | 新 NA `lib/client-context/__tests__/no-private-context.test.ts` | 掃描範圍由 `PRODUCTS[].door.page`＋`STAFF_ROUTE_GROUPS`（`doors.ts:72`）推出；`searchParams.get` 取 org／site／siteId／slug／client_slug／brand、localStorage 存 site／org／client、挑網站 select、fetch `/api/content/sites` 不帶篩選、頁面自畫 OrgPicker 選目前客戶 → 紅（`lib/client-context/*`、頂部列、`LEGACY` 白名單除外；白名單＝後續批的檔，只減不增）；突變：ContentStudio 加回 `searchParams.get("siteId")` → 紅、還原 → 綠 | Low | K7–K11 |
| K14 | 新增產品入口零手改的驗收 | 新 NA `lib/client-context/__tests__/new-door.test.ts` | §4b 全部 | Low | K5、K13 |
| K15 | 期末閘 | 無程式檔；WORKLOG、supervisor `data.mjs` | critic＋`/codex-review`；本機實測：舊 `?siteId=` 轉新參數；側欄換頁保留；客戶帳號帶他人 `?org=` 被移除；從 app 帶 org 開 VW 出確認窗；以 `PRODUCT_HOST_CONTENT=brand-x.test` 起本機重跑同組；四動作證據行 | — | 全部 |

上線後看得到：無畫面變化（測試）。Rollback：反轉測試檔。

### 先後總表

- 第 1 波：K1、K2、K3 並行 → K4 → K5。
- 第 2 波：K7、K8、K9 並行 → K6、K10（皆需 K7）。
- 第 3 波：K11 → K12。
- 第 4 波：K13 → K14 → K15。
- 關鍵路徑：K2 → K4 → K5 → K7 → K6 → K13 → K14 → K15。
- ADR 021 會員缺口卡（G1、G4、G5）排在 K10 之後（同用 `ClientHubTabs.tsx`）。

### 4b. 新增產品入口零手改（K14）

前提（已驗）：主機由設定推導，`PRODUCT_HOST_<KEY>` 可為任意獨立主網域（`hosts.ts:26-28`）；`doorForHost(host, env)` 吃 env（`doors.ts:30-35`）；選單來自登記表 `door.nav`（`ProductDoorShell.tsx:41-42`）。所有斷言迴圈走 `PRODUCTS`，不寫產品名或網域。

| # | 斷言 |
|---|---|
| T1 | 每個 next-admin 門且未停用的列，以 env `PRODUCT_HOST_<KEY>=<key>-brand.example` 與預設子網域各跑：`doorForHost` 回該產品門 |
| T2 | 外框伺服器端產生的 `hosts` 對照表涵蓋每個上述產品，值等於 `productHost(p, env)` |
| T3 | jsdom 中先刪除 `process.env.PRODUCT_HOST_*`，以 provider prop 給 `hosts`（獨立主網域）渲染 `DoorNav` 與頂部列：跨網域連結主機＝prop 值、query 帶 `org`／`site`（會暴露「瀏覽器端讀 env 被換回子網域」） |
| T4 | 靜態掃描：任何 use client 檔與 `lib/client-context/*` 不得 import `lib/portal/hosts` 或讀 `process.env.PRODUCT_HOST` |
| T5 | 靜態掃描：`lib/client-context/*`、`app/ClientContextProvider.tsx`、`app/ClientContextBar.tsx`、外框四檔不得有網域字面值（`aware-wave` 等）或 cookie `domain` 參數 |
| T6 | K13 檢查器的掃描集合 ⊇ 每個 `door.page` 對應的 app 目錄 |
| 突變 | `withContext` 改成拼 `.aware-wave.com` → T3、T5 紅；頂部列 import `hosts.ts` → T4 紅；還原 → 綠 |

### 4c. 排除的做法

| 做法 | 原因（證據） |
|---|---|
| 父網域（如 `.aware-wave.com`）共用 cookie 存目前客戶 | 獨立主網域（`hosts.ts:27`）、白牌（ADR 018 `:32`）、買斷主機不共享父網域；ADR 018 `:71` 已禁；全瀏覽器一個值，多分頁互相覆蓋 |
| 每主機一份「目前客戶」cookie 或 localStorage | 不跨主機；同主機多分頁互相覆蓋（VW 為此另寫鎖，`organization-picker.js:17-28`、`adapters.js:141-160`）；`sf_site` 即反例 |
| 資料庫存每人目前客戶 | 需新表（已排除改 schema）；所有分頁共用一值 |
| 路徑段 `/c/ORG/...` | 動全部路由；與產品門改寫衝突（`doors.ts:107-111`） |
| 每客戶一個子網域 | 每客戶 DNS 與憑證；買斷主機不成立 |
| middleware 把網址客戶寫成請求標頭 | 動 auth 路徑；`x-ops-org-id` 是 session 綁定（`middleware.ts:137-138`），混入會讓 `effectiveOrgId` 把員工選擇當客戶身分 |
| 新平台 API 掛 `PLATFORM_APIS` 回客戶清單 | `PLATFORM_APIS` 進 `STAFF_PLATFORM.apis`（`staff-tools.ts:64`）＝所有員工可讀客戶名單，違反 ADR 019 逐工具歸格（`staff-tools.ts:20` 只給 6 格）；且產品門不需要客戶清單（3b） |
| 選單登記表加必填 `scope` 欄位＋雙向測試 | 同一事實兩處寫；改 56 個側欄項與全部 door nav；頁面登記即可讓外框知道 |
| 跨分頁 postMessage 或 BroadcastChannel 同步客戶 | 只同源；需兩頁同時開；不可書籤化 |
| 程式內寫死網域清單 | 違反 ADR 018 §2（`018-product-doors-and-buyout-delivery.md:28-32`） |
| 刪 VW cookie | nginx auth_request 子請求看不到頁面網址（`session/route.ts:11-13`） |
| 全程 `DEPLOY_HOLD` | 擋所有 app 含手動部署（`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh:204-217`），VW 卡自相矛盾，且把整週改動壓成一次上線 |

### 4d. 後續批（不展開）

L1 開發信（`use-active-org.ts` 併入 hook；`organization_id IS NULL` 舊列＝「自用 / 未指定」，`use-active-org.ts:5-6`，需先決定歸內部組織，才能刪 null 語意；在此之前列入 K13 白名單）；L2 整合、資料蒐集（`?slug`→`org`）；L3 社群（`?brand`→`org`）；L4 維修、事件（`?client_slug`→`org`）；L5 橫幅、設計庫與 design、studio、tarot 入口；L6 VW 內頁 StoryBible、ReleaseDelivery 的 OrganizationPicker 改吃 identity；L7 `bootstrap` 客戶清單併入 `org-search`（兩者權限門檻不同，`org-search/route.ts:24` vs `bootstrap/route.ts:19`，先定門檻）；L8 白牌主機綁定（ADR 018 §2；屆時在 middleware 實作 3a 的 ① 與 ② 不同即拒，契約已定）。

## 5. 風險

| 風險 | 機率 | 影響 | 處置 |
|---|---|---|---|
| K5 讓選單帶 `org` 後，讀 `?org` 的舊頁（開發信、整合、橫幅）預選該客戶 | H | L | 這正是要的行為；三頁 `?org` 皆 uuid 同語意（1a #1-#4） |
| K6 改變發文路徑：未帶 siteId 的呼叫改回 404 | M | M | 13 個呼叫點全跑測試；High，push 前操作者明示；只收窄不放寬 |
| 遷移中頁面同時有頂部列與舊介面 | L | L | 頁面呼叫 hook 才出現頂部列；同卡刪舊介面 |
| VW 確認窗誤點切錯客戶 | L | M | 沿用 flush、lock；其他分頁收 BroadcastChannel 被鎖 |
| 夜間自動部署帶上半套 | L | M | 每波自身完整；High 卡未獲 go 不 push |
| 舊書籤 `topics/clients` 404 | L | L | 接受（只有內部選單連結） |
| 一個客戶網站很多（超過 50）時網站按鈕過長 | L | L | 接受；出現時再加搜尋（記 TASKS 一行） |
| 獨立主網域上客戶需重新登入 | H | L | 既有設計（每門各自登入，ADR 018 `:46`）；客戶跨門走 `mintDoorLink` 的 next 帶同一 query |

Rollback：見各波；每卡單一 commit 可單獨反轉。

## 6. 需操作者決定（至多三項）

1. 員工打開功能頁、網址沒有客戶：**建議**＝什麼都不選、頂部列請先挑；「AwareWave 自己」是清單第一列，按了才算自用。替代：沒選就當自己。
2. 網站設定（品牌語氣、發布方式等）在哪裡改：**建議**＝員工在客戶頁「內容工具」分頁、客戶在內容入口「網站」頁，兩處同一組元件。替代：只留內容入口「網站」頁，客戶頁只放連結。
3. 員工在產品入口網域（如 content 子網域）上要不要能換客戶：**建議**＝不能，只顯示目前客戶並給「到 app 換客戶」連結（產品門本來就是客戶用的；省一條門上可呼叫的客戶清單 API，不擴大員工讀客戶名單的範圍）。替代：門上也能搜尋，需新增 API 並寫入 ADR 019 歸格。

## 7. 審查回應（PLAN-REVIEW-20261121.md）

| 項 | 處理 |
|---|---|
| C1 | 採納：取消 HOLD，改四波（§4、4c） |
| A1 | 採納：網站清單唯一來源＝`/api/content/sites` 篩選（3b、K3）；不回 sites／status 的新路由 |
| A2 | 採納：不掛 `PLATFORM_APIS`；客戶清單沿用 org-search 既有歸格（3b、4c） |
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
| m6、m7、m8、m9 | 採納：provider 只抓一次（3c）；刪頁併入 K8；可見恰 1 自動（3a）；會員位置寫入 3e、G 卡排 K10 後 |
| m4、m5、m10、B1–B6 | 屬 ADR 021，不在本檔 |

未採納：審查 §5 第 1 點「C3 把 bootstrap 的客戶清單搬到門上可達的平台路徑」——產品門不需要客戶清單：客戶帳號只有自己（`tenant-guard.ts:198-205`，名稱由外框伺服器端讀），員工在 app 主機已有 org-search（`staff-tools.ts:20`）；新增門上清單反而落入 A2 的擴權（決定 3 若選替代方案再開卡）。

## 8. 一致性檢查（改寫後）

- 檔案重疊：K1–K14 的「檔案（獨佔）」兩兩比對無重疊（外框四檔只在 K5；`products.ts`、`sidebar-sections.ts` 只在 K8；`ContentStudio.tsx` 只在 K7；`wp-sites.ts` 只在 K6；`sites/route.ts` 只在 K3；`ClientHubTabs.tsx` 只在 K10；VW 兩檔只在 K12）。
- 先後：依賴圖 K2→K4→K5→{K7,K8,K9,K11}；K3→{K7,K8,K9,K11}；K7→{K6,K10}；K11→K12；{K7..K11}→K13→K14→K15；無循環。
- 場景唯一答案：員工無參數＝未選；員工選自己＝內部 id；客戶帶他人參數＝移除；只給 site＝推 org；site 不屬 org＝mismatch；同頁換客戶＝清 site；可見恰 1＝自動；白牌與 session 不同＝拒；VW 無 cookie＝內部組織（唯一例外）；app→VW 客戶不同＝確認後切；獨立主網域＝伺服器算主機＋網址帶參數——3a、3d 各一列，無重複或衝突。
