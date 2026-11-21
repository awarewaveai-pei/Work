# ADR 020: 目前客戶 — 全系統一種傳法：網址 `org`／`site`，空值＝未選，授權只在伺服器

- **狀態**：已接受（操作者 2026-11-22：側欄客戶欄、產品子網域員工可換客戶）。實作中：卡見 `agency-os/handoffs/2026-11-22-platform-membership-ux/DISPATCH.md`。
- **日期**：2026-11-22
- **承接**：[ADR 018](018-product-doors-and-buyout-delivery.md) §2（主機由設定推導、白牌主機綁客戶）、[ADR 019](019-staff-tool-grants.md)（逐工具歸格）、[ADR 021](021-membership-model.md)（單位＝會員）。
- **盤點與卡**：`agency-os/handoffs/2026-11-22-platform-membership-ux/CLIENT-CONTEXT-PLAN-20261121.md`（下稱 A；§1a 盤點、§4 卡）。
- NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`

## 1. 決定

| 項 | 規定 | 來源 |
|---|---|---|
| 識別符 | 客戶＝`organizations.id`（uuid）；網站＝`wp_sites.id`（uuid）。slug 只留在 `/ops/clients/[slug]` 路徑，由伺服器端換成 uuid。 | A §3a；`NA/app/(shell)/ops/clients/[slug]/page.tsx:60-64` |
| 網址參數名 | `org`、`site`。API 參數名（`organizationId`／`siteId`）不改。 | A §3a |
| 來源 | ① session 綁定客戶（客戶帳號，`x-ops-org-id`）② 主機綁定客戶（白牌 `custom_domains`，未實作）③ 網址 `org`／`site`（員工）。 | `NA/lib/tenant-guard.ts:193-205`；ADR 018 `:32` |
| ① 與 ② 並存 | 相同 → 用它；不同 → 拒絕（403 頁，不顯示任何資料），不取高者。 | ADR 018 `:32` |
| 客戶帳號 | org 恆為 ①；網址 `org`／`site` 不屬於他 → 從網址移除（`router.replace`），不查名、不報錯。客戶欄不列客戶清單。 | A §3a |
| 員工 ＋ ② | 白牌主機上 org 恆為 ②，網址 `org` 不同 → 移除。 | A §3a |
| 員工 ＋ 只有 ③ | 網址決定；每分頁獨立；無跨分頁 cookie／localStorage（VW 例外見 §2.4）。 | A §3a、§4c |
| 員工在產品門 | 與 app 主機同一個客戶欄、同一規則；客戶清單 API 經 §2.2 對員工開放，範圍與 app 主機相同。 | A §3a、§3b |
| 「沒選客戶」 | `org` 為空＝**未選**：頁面不載任何客戶資料，客戶欄顯示「請先選客戶」。空值永不代表自用。 | A §3a |
| 自用 | ＝內部組織（`kind='internal'`）的明確 id，客戶欄列為「AwareWave 自己」一列，選了寫進網址 `org=<內部 id>`。 | `NA/lib/entitlements/subject.ts:43-49` |
| 自動選 | 呼叫者可見的客戶恰 1 個（客戶帳號；買斷單一客戶安裝）→ 自動選；可見網站恰 1 個 → 自動選。都寫回網址。 | A §3a |
| site 推 org | 只給 `site` → `org = site.organization_id`，寫回網址補上 `org`。 | `NA/app/api/content/sites/route.ts:91` |
| 換客戶 | 一律清掉 `site` 與依附 site 的參數（`topic`、`month`）。 | A §3a（F15） |
| 不一致 | `site` 不屬 `org`、不存在、無權 → 狀態 `site_mismatch`／`not_found`／`forbidden`：不選、不載、客戶欄寫原因；**不得**退回第一個。客戶帳號永不看到 `not_found`／`forbidden`（已被「客戶帳號」列移除）。 | A §3a（F6） |
| 舊參數 | `siteId`→`site`（第一批）；`slug`、`client_slug`、`brand`（後續批）；`organizationId`（VW 頁）；localStorage `sf_site` 讀到即刪。 | A §3a |
| 主機 | 只在伺服器算（`lib/portal/hosts.ts`），經外框 provider 傳給瀏覽器；瀏覽器端模組不得 import `hosts.ts`。 | A §1c、§3a |
| 伺服器驗證 | 授權規則不變（`effectiveOrgId`／`assertOrgAccess`／`canAccessOrg`／`siteRowGate`）；`resolveWpSite` 無 siteId 時：客戶身分且可存取網站恰 1 個 → 該站，其餘 → null。 | `NA/lib/tenant-guard.ts:193-216`；`NA/lib/content/wp-sites.ts:123-126` |

## 2. 規則

### 2.1 伺服器資料來源（各一條）

| 資料 | 唯一來源 |
|---|---|
| 客戶清單／搜尋（員工；app 主機與產品門） | `GET /api/ops/org-search`（歸 `NA/lib/portal/staff-tools.ts:20` 的格，不擴權）；加 `?include=<uuid>`、類別 |
| 客戶自己的組織名 | 外框伺服器端由 `x-ops-org-id` 讀 `organizations` 一列，以 prop 傳下 |
| 內部組織 id | 外框伺服器端 `resolveSubject({})` |
| 某客戶的網站清單 | `GET /api/content/sites?organizationId=<uuid>`；只給 site 時 `?siteId=<uuid>` 回該站（含 `organization_id`） |
| 目前客戶的功能狀態（員工替客戶） | `GET /api/entitlements/features?org=<uuid>`，以 `actorFor` 驗證後才換主體 |
| 狀態判定 | 瀏覽器端純函式 `decide()`（`NA/lib/client-context/contract.ts`），輸入＝session／主機 org、網址、上列回應 |

### 2.2 產品門上員工換客戶（6 點）

1. `lib/portal/doors.ts` 新增 `STAFF_DOOR_APIS = ["/api/ops/org-search"]`，`routeOnProductDoor` 對其回 `pass`；**不**加進 `isProductPath`、**不**加進 `PLATFORM_APIS`。
2. `middleware.ts` 不改：客戶身分 → `isClientOutsideDoor` 為真 → 403；未登入 → 401；員工 → `staffToolDenial` 照格（shadow 只記錄，enforce 沒勾格者 403 `tool_not_granted`）。
3. 路由內加 `staffOnly` 當第二層（客戶角色解析為 `operator`，只靠 middleware 會洩客戶名，F16）。
4. 授權格不進 `STAFF_PLATFORM.apis`；頁面登記 `org` 層時，該產品格須在 `STAFF_API_OWNERS["/api/ops/org-search"]`。
5. 影片畫面由 VW 容器供給，客戶欄放不進 VW，沿用 §2.4。
6. 登入：cookie 每主機一份；員工在子網域用同一登入表單，或從 app 帶 `?org=` 連結過去。

### 2.3 為什麼只能靠網址

Supabase 登入 cookie 不設 Domain（每主機各一份），VW cookie 用 `__Host-` 前綴；跨網域不能靠 cookie 帶客戶，一次性登入碼的 `next` 本身也是網址（A §1c；ADR 018 `:12,:46,:71`）。主機名由伺服器 env 推導，瀏覽器讀不到。

### 2.4 VW 例外（唯一）

- VW 的 `__Host-vw-organization` cookie 是 VW 主機內每個子請求的授權依據（nginx auth_request 看不到頁面網址，`NA/app/api/video/workbench/session/route.ts:29-32`），不刪、不跨主機；VW 內以 cookie 為準。
- VW 沒有「未選」狀態（每個請求需要計費主體）：無 cookie 時用內部組織＝「AwareWave 自己」。
- 進入：`https://<video host>/handoff?open=X&org=Y`；Y 等於 identity → 移除 `org`；不同 → 開既有切換對話框預選 Y，按一下才切，取消＝留原客戶；切換後回 `/?open=X`。
- VW 內頁 `?organizationId=` 必須等於 identity，不同 → 「這支影片屬於另一個客戶，請先切換」，不載資料。

### 2.5 客戶頁與功能頁分工

| | `/ops/clients/[slug]`（以客戶） | 功能頁（以功能） |
|---|---|---|
| 放什麼 | 這個客戶是什麼：設定、連線、健康、問題、帳務；每個功能一行狀態＋「去做」連結 | 做事：產出、審核、發布 |
| 客戶怎麼來 | 路徑 slug | 客戶欄（網址 `org`／`site`） |
| 互連 | 外連帶 `withContext(href, { org, site })` | 客戶欄頂端「客戶頁 →」（只員工） |

## 3. 沒選的做法

| 做法 | 原因 |
|---|---|
| 新增全站共用 cookie（父網域如 `.aware-wave.com`） | 獨立主網域、白牌、買斷主機不共享父網域；ADR 018 `:71` 已禁；全瀏覽器一個值，多分頁互相覆蓋 |
| 每主機一份 cookie 或 localStorage 存目前客戶 | 不跨主機；同主機多分頁互蓋；`sf_site` 即反例 |
| 資料庫存每人目前客戶 | 需新表；所有分頁共用一值 |
| 頂部客戶挑選列 | 操作者 2026-11-22 改定側欄客戶欄 |
| middleware 加新標頭 | 動 auth 路徑；`x-ops-org-id` 是 session 綁定，混入網址客戶會讓 `effectiveOrgId` 把員工選擇當客戶身分（`middleware.ts:137-138`） |
| feature flag | 未完成功能靠「尚無入口」不顯示；每卡自身完整 |
| `DEPLOY_HOLD` | 擋所有 app 含手動部署（`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh:204-217`），把整週改動壓成一次上線 |
| 路徑段 `/c/ORG/...` | 動全部路由；與產品門改寫衝突 |
| 每客戶一個子網域 | 每客戶 DNS 與憑證；買斷主機不成立 |
| 新平台 API 掛 `PLATFORM_APIS` 回客戶清單 | 進 `STAFF_PLATFORM.apis` ＝所有員工可讀客戶名單，違反 ADR 019 逐工具歸格 |
| org-search 加進 `isProductPath` | 客戶身分會通過 `isClientOutsideDoor`，而客戶角色解析為 `operator`，路由回全部客戶名（F16） |
| 在 `routeOnProductDoor` 依身分放行 | 該函式在身分解析前執行（`middleware.ts:347-351` vs `:407-430`） |
| 刪 VW cookie | nginx auth_request 子請求看不到頁面網址 |
| 跨分頁 postMessage／BroadcastChannel 同步客戶 | 只同源、需兩頁同開、不可書籤化 |
| 程式內寫死網域清單 | 違反 ADR 018 §2 |
