# portal.aware-wave.com 設計方案（v8，V1 已上線）

> **狀態：✅ 已部署，portal.aware-wave.com 對外運作中**（2026-08-29）。commit `83277d80`（portal 本體）+ `d9206dee`（sg-deploy.sh 探針修正）已 push + 部署，`sg-deploy.sh` 4/4 smoke 通過無 rollback。nginx 止血用的 `return 503` 已移除，端對端驗證：`/login` 200、`/` 正確導向 launcher（無迴圈）、`/launcher` 無 session 正確擋 307、`/api/signup` 正確回 503（`PORTAL_SIGNUP_ENABLED` 故意留空,V1 只開身分層不開真實註冊）、靜態資源 200（hydration 正常）、app/api/www/oracle 四個既有網域零回歸。過程中兩個真實 incident 都已止血+治本（§14 nginx-vs-app 部署順序造成的重導放大器；部署時發現的 sg-deploy.sh 探針因整併後過期造成假陽性 rollback，另見 `d9206dee` commit + WORKLOG）。db-expert/自審/critic×3/Codex×3 六輪覆審全部修正。`npx tsc --noEmit` exit 0、`npx vitest run` 59 檔 688 條全過。**下一步（V1 範圍外，需另一輪 go-ahead）**：設 `PORTAL_SIGNUP_ENABLED`+`TURNSTILE_SECRET_KEY` 開放真實註冊。
> **一句話**：portal = HCI-30 + Cognitive OS 的外部客戶登入/帳號/訂閱/launcher 層，跟 `app.aware-wave.com`（內部維運後台）分離——但**重用**既有的 `organizations`/`profiles`/tenant-guard 機制，不建平行系統。

---

## 0. v1 → v2 修正記錄（重工預防，誠實留痕）

v1 設計「portal 自己開一個 `portal` schema（`customers`/`subscriptions`/`product_provisions`）+ 全新 `app_metadata.portal_customer_id` claims 命名空間」。繼續讀 `middleware.ts` 全文（原本只讀了 `APP_AWARE_WAVE_CURRENT_STATE.md` 摘要，這次讀了完整原始碼）後發現：**這套機制已經存在，且已測試、已上線、只是還沒有真正的外部使用者用過它**。

證據：
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tenant-guard.ts:1-141` — 完整的 `staff`/`client` 雙身分模型，`app_metadata.user_kind` + `app_metadata.org_id`，`resolveTenant()`/`assertOrgAccess()`/`effectiveOrgId()`。檔頭註解原文：「client — end-client self-service. Bound to exactly one org」。
- `middleware.ts:110-115,182` — `resolveTenantFromMeta()` 已經在解析 `user_kind`/`org_id` 並注入 `x-ops-user-kind`/`x-ops-org-id` header，跟 `ops_role` 走同一個 middleware pass。
- `lobster-factory/packages/db/migrations/0001_core.sql:3-58` — `organizations`（`type in ('agency','client')`）/ `workspaces` / `profiles`（`id = auth.users.id`）/ `organization_memberships`（含 `status='invited'`，即自助邀請已在 schema 設計中）/ `roles`/`permissions` 全套已存在。
- 22 個檔案（`lib/content/video/__tests__/video-status-tenant.test.ts` 等）已經在消費這套機制，證明不是死程式碼。

**結論：v1 是重工。** 建新 `portal` schema + 新 claims 命名空間，等於在同一個 repo 裡蓋第二套「外部客戶是誰」的系統，違反 AGENTS.md「禁止建立重複模組」與零重工原則。v2 全部改成**重用**。已送修正訊息給已委託的 db-expert（原委託範圍未變更前發出，已即時攔截）。

## 1. 任務理解

根本問題：兩個產品（HCI-30、Cognitive OS）目前沒有機制讓外部客戶登入、開帳號、被授權使用；但**這個系統的地基（org/client/tenant-guard）已經蓋好，只是從沒被接上真正的外部客戶登入流程**。

## 2. 現況分析

### 2.1 已有可沿用的東西（v2 重新盤點）
- **Supabase Auth 已在跑**：`supabase.aware-wave.com`（EU，自架），email+password，`@supabase/ssr` 模式已驗證穩定。
- **`user_kind`/`org_id` 雙身分模型已存在且已測試**：`tenant-guard.ts` + `middleware.ts`（見 §0 證據）。**portal 只是這套機制的第一個真實外部消費者**，不是新建者。
- **`organizations`/`profiles`/`organization_memberships` domain model 已存在**：`0001_core.sql`。`organizations.type='client'` 就是外部客戶組織；`organization_memberships.status='invited'` 就是自助邀請流程的資料位。
- **`provisionClient()` adapter 已驗證**：Hetzner 一鍵租機走同樣「portal 呼叫產品端 API 建資源」的模式（`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`）。

### 2.2 關鍵依賴（不變，仍成立）
- **`ADR-003`（2026-08-29 ACCEPTED）已定義 `Tenant`**：Cognitive OS 的 domain object #23，`Tenant 1:N Workspace`。這是 Cognitive OS **內部**的租戶單位，跟 `organizations`（本 repo 平台層的客戶組織）是兩層不同東西——一個 `organizations` row（客戶跟 AwareWave 的商業關係）未來可能對應一個 Cognitive OS `Tenant`（客戶在 Cognitive OS 產品內的資料邊界），但建立權在 Cognitive OS 自己的 API，portal 只存對應關係。
- **Cognitive OS 目前 Phase 2（無 code，無 provisioning API）**：portal 現在無法真的建立 Cognitive `Tenant`。
- **HCI-30 未動工**：同上。

**結論不變**：portal V1 只做「身分 + 訂閱狀態」，真正開通留 adapter 缺口。**但身分這塊現在有地基可用，不必從零蓋。**

## 3. 風險清單（v2）

| 風險 | 說明 | 對策 |
|---|---|---|
| `organizations` 表原本是為 WP 代操客戶設計 | `type='agency'/'client'` 已有語意，但 `projects.project_type` 預設 `'wordpress'`——這張表原生語境是「幫這個客戶代操網站」，不是「這個客戶訂閱了我們的 SaaS 產品」 | 不改動 `organizations` 既有欄位/語意；新增獨立的 `organization_product_subscriptions` 表承接「訂閱哪個 SaaS 產品」，`organizations` 本身保持中性（agency 對客戶的通用主檔） |
| `user_kind='client'` 從未被真實外部使用者用過 | 目前只有內部測試/程式碼路徑驗證過，沒有真正的客戶自助註冊流程存在 | portal 的 signup 是這條路徑的**第一個生產流量**，§8 驗證計畫必須包含端對端真人視角測試，不能只信任既有單元測試 |
| 假裝已整合 | 若現在硬接一個「建立 Cognitive Tenant」按鈕但後端不存在 | V1 明確標「即將推出」，`organization_product_subscriptions.external_tenant_id` 允許 null |
| 金流 | Stripe/訂閱扣款是 High risk（AGENTS.md 金流紅線） | V1 訂閱狀態**手動/comp**，金流另案 go-ahead |
| RLS 一致性 | 若新表的 RLS 邏輯跟 `organizations`/`organization_memberships` 既有 RLS 慣例不一致，兩套規則各自演化會漂移 | db-expert 已重新委託：新表 RLS 必須比照既有 org-scoped RLS 慣例（0010/0014/0019 migration），不得自創風格 |

## 4. 方案比較

### 4.1 Auth/身分模型：重用 `user_kind='client'` vs 另建命名空間

| | A：重用既有 `user_kind`/`org_id`（v2 決定）| B：portal 專屬 `portal_customer_id`（v1，已廢棄）|
|---|---|---|
| 新增機制 | 零——`tenant-guard.ts`/`middleware.ts` 原樣可用 | 全新 claims 解析、全新 guard 函式、全新測試 |
| 一致性 | 高——跟既有 22 個消費端點同一套規則 | 低——兩套「誰是外部客戶」規則並存，永久維護成本 |
| 30 年存活 | 符合零重工原則 | 違反（見 §0） |
| 風險 | 這是該機制第一次真實外部使用，需要扎實驗證（§3）| N/A（方案已廢棄）|

**決定：方案 A。** v1 的方案 B 已廢棄，理由見 §0。

### 4.2 部署形態：共用 next-admin vs 獨立 app（不變，v1 已定案，此輪重新確認仍成立）

| | A：共用 next-admin（host-based routing）| B：獨立新 app/container |
|---|---|---|
| 新增基建 | 零——同一 container，nginx 多一個 `server_name` block | 一整套新基建 |
| 資源代價 | 低 | `ks-aw-01` 單機（2026-08-28 全整併），監控門檻嚴（記憶體/硬碟 60%）——每個新 container 是真成本 |
| 邏輯隔離 | 中——route group（`app/(portal)/`）+ `lib/portal/` namespace + 新表（非新 schema），**現在額外多一層天然隔離**：portal 頁面本來就該走 `user_kind==='client'` 分支，跟 staff-only 的 `app/(shell)/ops/*` 路由天生不會互相誤觸 | 高——實體隔離 |
| 可逆性 | 高 | N/A |

**決定：方案 A（不變）**。且因為身分模型改成重用既有機制，隔離性比 v1 設計更好——不是「兩套並存但小心不要混」，而是「同一套機制原生支援兩種身分,路由天生分流」。

## 5. V1 範圍界定

**做**：
- **1 張新表**（`public` schema，不新開 `portal` schema）：
  ```sql
  organization_product_subscriptions (
    id uuid pk,
    organization_id uuid references organizations(id),
    product_key text check in ('cognitive','hci'),
    status text check in ('trial','active','past_due','canceled'),
    external_tenant_id uuid null,  -- 對應 Cognitive OS 未來的 Tenant.tenant_id，null=尚未開通
    started_at timestamptz,
    current_period_end timestamptz
  )
  ```
  最終 schema 以 db-expert 覆審後的草案為準（見 §7 步驟 1）。
- **Signup 流程**（portal 第一個真實 consumer）：建立 `organizations` row（`type='client'`）→ 建立 Supabase Auth user（`app_metadata={user_kind:'client', org_id:<新 org id>}`）→ 建立 `profiles` row → 建立 `organization_memberships` row（`status='active'`，簽署人為首個成員）→ 建立 `organization_product_subscriptions` row（`status='trial'`）。
- **登入頁**（`portal.aware-wave.com/login`）：沿用 `@supabase/ssr`，**不新增 claims 命名空間**——`user_kind`/`org_id` 已是既有欄位。
- **Launcher 頁**：讀 `lib/portal/products.ts`（product registry，見 §6.2）+ `organization_product_subscriptions`，`active` 給連結，其餘顯示「即將推出」。
  - **2026-10-30 已改**：launcher 改用門自己的判斷 `lib/portal/held-doors.ts` `heldDoors`（已上線的門 × `organization_entitlements`）：已開通（「開啟」＋有 `works` 門頁者「我的作品」）／尚未開通（「去了解」→`shopUrl()`）／即將推出；不再讀訂閱表（該表 prod 0 列，舊做法讓全部客戶看到「即將推出」）。見 WORKLOG 2026-10-30。

**不做（明確排除）**：
- ❌ Stripe/金流
- ❌ 真的呼叫 Cognitive OS 建 Tenant（下游無 API）
- ❌ HCI-30 任何業務邏輯（只有 launcher 卡片）
- ❌ 新 Postgres schema / 新 claims 命名空間（v1 方案已廢棄，見 §0）
- ❌ 修改既有 `organizations`/`profiles`/`tenant-guard.ts` 的既有行為（只新增，不改既有 22 個消費端點的合約）

## 6. 決策（操作者 2026-08-29 明示授權 Claude 裁決）

### 6.1 部署形態：共用 next-admin，host-based routing（§4.2，不變）

### 6.2 V1 範圍：cognitive + hci 兩個產品卡一起建（data-driven registry）

**決定不變**：`lib/portal/products.ts` 讀取式 registry，兩個 entry 都 `status: 'coming_soon'`：

```ts
export const PRODUCTS = [
  { key: 'cognitive', name: 'AI LEGO Cognitive Engineering OS', domain: 'cognitive.aware-wave.com', status: 'coming_soon' },
  { key: 'hci',       name: 'HCI-30',                            domain: 'hci.aware-wave.com',       status: 'coming_soon' },
] as const
```

**明確邊界不變**：純資料，無 hci 業務邏輯。

## 7. 實作計畫（v3，已用 SSH 實查 `ks-aw-01` 真實 nginx 架構訂正）

**已完成（純新增檔案，零風險，尚未套用/部署）**：
- ✅ `lobster-factory/packages/db/migrations/0062_organization_product_subscriptions.sql` + `packages/db/scripts/0062_organization_product_subscriptions_down.sql`（db-expert 覆審+修正，見 §9）
- ✅ `lib/tenant-guard.ts` 新增 `requireClientOrg()`/`PortalAccessError`（純新增，未改既有 export 行為）
- ✅ `lib/portal/products.ts`（product registry，§6.2）

**架構訂正（SSH 實查 `ks-aw-01`，2026-08-29）**：原計畫「middleware.ts 加 host 分流」是錯的想法源頭——SSH 進去看了實際 nginx 才發現真實架構是**兩層**：
1. **Host nginx**（`/etc/nginx/sites-available/sg-stack.aware-wave.com`）：TLS 終結，`server_name aware-wave.com www api app oracle` 全部轉給 `127.0.0.1:8083`
2. **lobster-nginx 容器**（`/root/lobster-phase1/nginx/default.conf`）：**`app.aware-wave.com` 已經是獨立的 `server { server_name app.aware-wave.com; }` block**，直接轉給 `next-admin:3000`——不是同一個 block 靠 path 分流

**這改變設計，且變得更簡單、更安全**：portal 不需要在 `middleware.ts` 裡加任何 host 判斷邏輯。做法改成：
- 在 lobster-nginx `default.conf` 新增一個**獨立的** `server { server_name portal.aware-wave.com; }` block（照抄 `app.aware-wave.com` block 的樣板：同樣的 header、rate limit、`proxy_pass next-admin:3000`），**多加一行 rewrite**，把所有進來的請求在 nginx 這層就轉成 `/portal/*` 路徑再送進 next-admin。
- next-admin 這邊只要在 `app/portal/login/`、`app/portal/signup/`、`app/portal/launcher/` 放正常的 file-based route，**完全不用碰 host 判斷**。
- `middleware.ts` 唯一要動的地方：現有 matcher 排除清單（`login|intake|api/auth|...`）**多加 `portal/login`、`portal/signup`、`portal/api/signup`**（跟現有 `/login` 排除同一個模式，複製貼上等級的小改動,不是新邏輯)。

**⚠️ 自審抓到一個 rewrite 冪等性 bug（寫 nginx 前就先抓到,沒有真的先寫錯再修）**：naive 寫法 `rewrite ^/(.*)$ /portal/$1 break;` 對「已經是 `/portal/...`」的請求會**重複前綴**成 `/portal/portal/...`。這條路徑真的會被打到——`middleware.ts` 的 `blockedResponse()`（既有程式碼,`middleware.ts:124-132`）用 `new URL("/login", request.url)` 組出登入頁 redirect,但 Next.js 這裡收到的 `request.url` 路徑**已經是 nginx rewrite 過的** `/portal/launcher`（不是瀏覽器原始打的 `/launcher`）,所以 middleware 組出的 `next` 參數會是 `/portal/launcher`；登入成功後 `LoginForm.tsx` 用 `window.location.assign(next)`（既有程式碼,同源絕對路徑）導去 `https://portal.aware-wave.com/portal/launcher`——這個請求會**再次**經過 nginx 的 portal server block,naive rewrite 會再疊一層前綴變成找不到的 `/portal/portal/launcher`。
**修法**：rewrite 規則加負向前瞻,只在「還沒有 `/portal/` 前綴」時才加，已經有就放行：
```nginx
rewrite ^/(?!portal/)(.*)$ /portal/$1 break;
```
nginx 用 PCRE,支援 lookahead，此寫法是冪等的（跑幾次結果都一樣），無論瀏覽器是打 `/launcher` 還是 `/portal/launcher` 都收斂到同一個內部路徑。**這條規則後續又被發現兩個邊界漏洞並修正,實際部署版本以 §7.2（含 `_next/`/`favicon.ico` 排除）跟第二輪 critic M-A 修正（帶尾斜線邊界）為準,見該處。**

**⚠️ 發現一個阻塞項（原計畫沒有）**：SSH 查了 LE 憑證的 SAN 清單（`openssl x509 ... -text`），目前是 `api/app/aware-wave.com/oracle/www` 五個名字，**沒有涵蓋 `portal`**，且不是萬用字元證書。上 `portal.aware-wave.com` 前必須先跑 `certbot --cert-name aware-wave.com --expand -d aware-wave.com -d www.aware-wave.com -d api.aware-wave.com -d app.aware-wave.com -d oracle.aware-wave.com -d portal.aware-wave.com`（**DNS 必須先生效**，certbot 才能驗證），否則 portal 連 TLS 握手都過不了。

**完整步驟（由低風險到高風險排序）**：
1. ✅ Migration 檔（已完成，未套用）——`0062_organization_product_subscriptions.sql` + `0063_portal_complete_signup.sql`（新增 `portal_complete_signup()` RPC，見下方新增小節）
2. ✅ `tenant-guard.ts`/`lib/portal/products.ts`（已完成）
3. ✅ next-admin 新增 `app/portal/{login,signup,launcher}/` 頁面 + `app/portal/api/signup/route.ts`（服務端寫四表，用 service-role key，rate limit 用 `organizations.metadata->>'source'='portal_signup'` 計數，Turnstile + env gate 預設關——照抄 `app/api/onboarding/intake-browser/route.ts` 既有 pattern，非新發明）。**`npx tsc --noEmit` 通過（exit 0）**。critic 覆審跑中（機械閘強制，見下）。
4. ✅ `middleware.ts` matcher 排除清單加 `portal/login`、`portal/signup`、`portal/api/signup`（單行 regex 擴充，`/portal/launcher` 等其餘路徑維持受 gate）
5. **【待 go-ahead】Cloudflare**：新增 `portal` CNAME
6. **【待 go-ahead】`ks-aw-01` 實機**：① `certbot --expand` 擴憑證 ② host nginx `sg-stack.aware-wave.com` 的 `server_name` 兩處各加 `portal.aware-wave.com` ③ lobster-nginx `default.conf` 新增 portal server block（見下方完整可貼上文字）④ `nginx -t` 驗證後 reload
7. **【待 go-ahead】套用 migration**：`docker exec -i supabase-db psql -U supabase_admin -d postgres -f 0062_....sql` 與 `0063_....sql`（順序：0062 先，0063 依賴 0062 的表）

### 7.1 新增小節：`0063_portal_complete_signup.sql`（Migration 步驟 1 的補充）

db-expert Major #5（見 §9）指出 4 表寫入應該是單一交易。已補一個 `SECURITY DEFINER` 的 Postgres function（house pattern，同 `0035_upsert_incident_atomic.sql`）把 `organizations`/`profiles`/`organization_memberships`/`organization_product_subscriptions` 四個 insert 包進同一個 function body（function 本身天然是原子的）。**已知限制,已寫進 migration 檔頭誠實記錄,非隱藏**：Supabase Auth user 是透過 GoTrue admin API 建的，不是這個 Postgres transaction 的一部分——route.ts 必須先建 auth user 拿到 `user_id`，再呼叫這個 function；function 失敗時 route.ts 會呼叫 `auth.admin.deleteUser()` 補償刪除,避免留下有登入能力但沒有組織的「幽靈帳號」。`EXECUTE` 權限明確只給 `service_role`（`REVOKE ALL FROM PUBLIC`），不會被 PostgREST 意外暴露給一般使用者呼叫。

### 7.2 nginx 完整片段（步驟 6 用，含冪等 rewrite 修正）

**lobster-nginx `default.conf` 新增（照抄 `app.aware-wave.com` block，改 `server_name` + 加 rewrite）**：

**⚠️ 這份是「唯一正本」，重新貼上前務必確認 `return 503;` 那行的去留**（critic 覆審提醒 2026-08-29：C-A incident 止血後這行在**現場**是有的，但這份文件的片段原本沒有——若有人照這份文件重新貼一份新的,會在沒人注意的情況下重新打開流量。**只有確認 next-admin 已成功部署且健康檢查通過，才可以拿掉這行**）：
```nginx
server {
    listen 80;
    server_name portal.aware-wave.com;
    # 只有 next-admin 已部署且健康檢查通過才可以刪除這行；部署前這行必須存在（C-A incident 止血機制）
    return 503 "portal.aware-wave.com temporarily disabled pending app deploy";

    resolver 127.0.0.11 valid=30s ipv6=off;
    client_max_body_size 50M;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    add_header X-Content-Type-Options  "nosniff"                        always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options         "SAMEORIGIN"                      always;
    add_header X-XSS-Protection        "1; mode=block"                   always;

    if ($is_trusted_source = 0) { return 444; }
    location ~* \.(env|sql|bak|old|log|swp|tmp|ini|htpasswd)$ { return 444; }

    # Idempotent: only add the /portal/ prefix if it isn't already there (see §7 rewrite bug note).
    # ALSO excludes _next/ and favicon.ico (critic finding M2, 2026-08-29): Next.js emits static
    # asset URLs unprefixed (no basePath/assetPrefix configured -- and can't be, since this one
    # Next.js instance also serves app.aware-wave.com at root paths). Without this exclusion every
    # /_next/static/*.js and *.css request gets rewritten to /portal/_next/... -> 404, and since
    # both portal forms are "use client" components, they would never hydrate at all.
    # `portal(?:/|$)` NOT `portal/` (critic finding M-A, 2026-08-29, second review pass, CONFIRMED
    # LIVE): the bare `/portal/` alternative doesn't match a request for exactly `/portal` (no
    # trailing slash) -- confirmed with curl against ks-aw-01 that this produced a live
    # `/portal/portal` double-prefix and a 404 at the domain root. `(?:/|$)` matches "portal/"
    # OR "portal" at end-of-string, closing both the "/portal" and "/portal/" cases in one
    # alternative -- and mirrors the same boundary fix applied to isPortalPath() in
    # middleware.ts, which had the identical bug on the TypeScript side.
    rewrite ^/(?!portal(?:/|$)|_next/|favicon\.ico)(.*)$ /portal/$1 break;

    location / {
        limit_req zone=admin burst=40 nodelay;
        set $backend http://next-admin:3000;
        proxy_pass $backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```
（未照抄 `app.aware-wave.com` block 的 `location /api/webhooks/`/`location /api/ops/inbox/health` 特例——portal V1 沒有 webhook 或 ops inbox 端點，不需要那兩塊。）

**Host nginx `sg-stack.aware-wave.com` 的 `server_name` 兩處（:80 與 :443 block 都要改）**：
```
server_name aware-wave.com www.aware-wave.com api.aware-wave.com app.aware-wave.com oracle.aware-wave.com portal.aware-wave.com;
```

**不寫進 repo 的 `lobster-factory/infra/hetzner-phase1-core/nginx/`**：那份是已標記「作廢,SG 停用後不代表 `ks-aw-01` 現況」的舊 SSOT（`TASKS.md` 2026-08-29 條目已記錄），寫進去只會製造新的 drift 混淆。上面兩段就是唯一正本，直接貼到 `ks-aw-01` 實機。
8. **【待 go-ahead】部署**：`sg-deploy.sh next-admin`

## 8. 驗證計畫（四動作，v2 加重外部客戶路徑的真實測試）

1. **實測**：
   - `portal.aware-wave.com/login` curl 200
   - **端對端 signup**：真實建立一個 `type='client'` org + Supabase Auth user，確認 `app_metadata` 正確、`organization_memberships` 正確、能登入
   - **RLS 邊界**：用該 client 帳號嘗試讀取另一個 org 的 `organization_product_subscriptions` row，應回 0 rows（複用 `assertOrgAccess` 的既有保證，但要對**新表**驗一次，既有測試不覆蓋新表）
   - `portal.aware-wave.com` 與 `app.aware-wave.com` host 分流互不誤判
2. **Review**：critic 審新 migration RLS + signup API route（service-role key 使用是否安全、有沒有 IDOR）
3. **抓蟲**：
   - grep `user_kind`/`org_id`/`organizations`/`organization_memberships` 全庫，確認新增的 signup 流程沒有繞過 `tenant-guard.ts` 既有邊界，也沒有破壞既有 22 個消費端點的假設
   - grep `sg-deploy.sh`/nginx conf 有無寫死舊 SG/EU IP
4. **WORKLOG**：記錄 migration + signup 流程 + 部署驗證證據，並記錄「這是 `user_kind='client'` 機制第一次接真實外部流量」這件事本身（供未來排查用）

## 9. db-expert 覆審全文摘要（2026-08-29，migration 定案依據）

**Critical（4 項，已全部處理）**：
1. 既有 `0010` 那套「org member 可自己寫 org 表」的 CRUD pattern，套在訂閱表上是客戶可自付費開通——**已排除**，新表 write 全部 `service_role` only。
2. RLS 只是縱深防禦——app 走 service-role client，本來就繞過 RLS；真正邊界在 application 層的 `tenant-guard.ts`。
3. **最高嚴重性**：`resolveTenant()` 對缺身分 header 的預設是 fail-open 給 staff 全權限——portal 是第一個外部呼叫者，任何漏蓋的路由都會讓客戶拿到員工權限。**已修**：新增 `requireClientOrg()`，portal 路由一律用它，絕不 fallback staff。
4. `user_has_org_access()` 有第二條路徑經 `clerk_organization_mappings`（text 比對 `app_metadata.org_id`，跟 portal 用的 claim 同一個），理論上可能撞名。**已查證**：SSH 進 `ks-aw-01` 實跑 `select count(*),status from clerk_organization_mappings group by status;` → 0 rows。但不依賴「現在是空的」，**已改用 `user_has_org_membership()`**，結構性排除這條路徑。

**Major（4 項）**：`profiles.id` 無實體 FK 到 `auth.users(id)`（signup 須為單一 transaction，FK 留待後續 migration）／`organizations` 對 `authenticated` 無 INSERT policy（signup 必須走 service_role endpoint，需 rate limit）／`ON DELETE CASCADE` 會悄悄清掉訂閱歷史（**已改 `RESTRICT`**）／新表未強制 `organizations.type='client'`（已知完整性缺口，記錄不修，留待未來 trigger）。

**Minor/操作性（5 項）**：RLS initplan 效能（沿用既有慣例，非本次引入）／無 migration ledger（沿用既有 `if not exists` 慣例）／撞名檢查=0（`organization_product_subscriptions`／`portal` 均未被佔用）／`apply-lobster-rls-migrations-eu.mjs` 不會撿到 `0062`（**必須手動 apply**，已寫進 migration header）／`public` schema 下 anon 預設可 SELECT 新表（**已加 explicit deny anon policy**，非裝飾用）。

**Verdict**：RLS 設計本身安全，但套用前必須做完 §7 步驟 3-4（signup API route + matcher 排除）才算完整閉環——單獨套 migration 不會有立即風險（純新增表，無現有資料），但沒有 §7 步驟 4 的 `requireClientOrg()` 接線，這張表在 application 層還是可能被漏保護的路由誤讀。

## 10. Codex 覆審失敗 + 誠實自審（2026-08-29）

**`codex-oracle.ps1 -Mode review` 連續 2 次失敗**：`codex produced no final message after 2 attempt(s) (exit=0)`，raw log 檔案本身是空的（`C:\Users\...\codex-oracle-log-0cb4e169.txt` 0 bytes），非本次指令寫錯——是 codex CLI 本體這輪沒有正常運作，原因未查（可能額度/連線，未深入 debug，不在本任務範圍內）。**不重試同一個失效工具**（AGENTS.md §已知信任邊界 + 個人 memory `feedback_self_review_when_oracle_down` 的既定規則）。以下是 Claude 自己做的對抗式自審，**明確標記這不是獨立第二意見**，只是 oracle 掛掉時的補位，可信度低於真正的跨模型覆審。

**自審發現（db-expert 覆審未提到的一項）**：
- `user_has_org_membership(org_id)`（`0018:25-37`）只檢查 `organization_memberships.status = 'active'`，**從未 join `organizations.status`**。也就是說一個已經被停用/離線中的客戶組織（`organizations.status IN ('suspended','inactive')`（`offboarding` 不是合法值——critic 覆審抓到本檔原文誤植，`0001_core.sql:8` 的 CHECK 只允許 `active|inactive|suspended`，已訂正））,其成員的 `active` membership 若沒被同步清掉,`user_has_org_membership()` 仍回傳 true——**此表的 RLS SELECT 政策會照樣放行**。
- **這不是本次 migration 引入的新洞**——`user_has_org_membership()` 是既有共用函式,同一個問題理論上影響其他所有呼叫它的既有表（若有）。**故意不在這次修**：這是共用 infra 函式,改了會影響所有既有消費端點,不在 portal 這次變更的邊界內（見 §5「不做」清單：不修改既有合約）。
- **記錄為已知缺口,不隱藏**：若日後真的要停權一個客戶組織,光改 `organizations.status` 不夠,必須同時把該組織所有 `organization_memberships.status` 改成非 `active`（例如 `disabled`,該欄位已支援此值,`0001:46`）,兩件事要一起做。這件事應該寫進未來「停權客戶」的操作 SOP,不是這次要修的程式碼問題。

**自審其餘檢查（無新發現，僅供記錄）**：`requireClientOrg()` 目前尚未被任何路由呼叫（next-admin 頁面未建），其「fail-closed」屬性現在只是理論上成立，要等 §7 步驟 3-4 真正接線才算數，不能現在就宣稱「風險已排除」；migration 的 `begin`/`commit` 交易邊界正確、`create index`（非 `concurrently`）用在全新空表上是對的選擇；unique partial index 邏輯核對正確（同一 org+product 不可有兩筆非 canceled 併存、`external_tenant_id` 不可跨 org 重複認領）。

## 11. critic 機械閘覆審全文摘要 + 修正狀態（2026-08-29）

`middleware.ts`/`tenant-guard.ts` 觸發 `file-path-router.js` AUTH 路徑機械閘，強制 critic 覆審。critic 讀完整方案文件 + 全部 10 個新/改檔案，**並實際對 `ks-aw-01` 現場資料庫/API 下指令驗證**（非紙上談兵）。裁定：**Overall risk: High，原始狀態不可套 migration 或 deploy**。逐項修正如下：

### 🔴 Critical（3 項，全數修正）

| # | 發現 | 修正 |
|---|---|---|
| **C1** | `revoke all ... from public` 在 Supabase 上不會擋掉 `anon`/`authenticated`——那是**另一組**預設 grant。critic 實測：既有 `0030` 用同款單一 revoke，`proacl` 查詢證實 `anon`/`authenticated` 仍在。若不補，任何持有 `anon` key（就在瀏覽器 bundle 裡）的人可直接 `POST /rest/v1/rpc/portal_complete_signup`，繞過 Turnstile/rate limit/env gate/route.ts 全部防線，以 `supabase_admin` 身分執行四表寫入 | `0063` 加 `revoke all ... from anon, authenticated;`，並在 down 檔加 post-apply 驗證指令（查 `proacl` 確認只剩 `service_role`）|
| **C2** | portal signup 核發的帳號可以直接讀寫內部維運後台——`middleware.ts` 對「已登入但無 `ops_role`」的預設是 `viewer`（不是拒絕），**全站 ~120 條 `/ops/*` 路由沒有任何一條檢查 `user_kind`**。这个假設（「已登入=員工」）在 portal 出現前一直成立，portal signup 是第一個打破它的機制 | `middleware.ts` 加**單一 choke point**：`isClientOutsidePortal()`，client 身分打非 `/portal/*` 路徑一律 403/redirect，套用在快取路徑跟慢速路徑兩處（不是逐一稽核 120 條路由那種補丁式修法）|
| **C3** | `PORTAL_SIGNUP_ENABLED` 只在 `NODE_ENV!=production` 的 dev-bypass 分支裡讀，正式環境永遠讀不到——真正的開關其實是 `TURNSTILE_SECRET_KEY`（跟 `/intake` 表單共用）。且 critic 實測 `curl -X POST https://app.aware-wave.com/portal/api/signup` 能打到這支 app（Next.js file-based routing 天生不分 host）——**光是部署程式碼本身，不必等 DNS/憑證/nginx 任何一步，就會在 `app.aware-wave.com` 上開放公開註冊** | ① `PORTAL_SIGNUP_ENABLED` 改成獨立、任何環境都必查的開關，`docker-compose.yml` 補上這個 env passthrough ② `middleware.ts` 新增 `isWrongHostForPortal()`，`/portal/*` 一律要求 `Host===portal.aware-wave.com` 否則 404——且**把 portal 三個公開頁（login/signup/api/signup）從 matcher 排除清單移進 middleware 函式本體內部判斷**（原本用 matcher 排除會讓這幾個路由完全跳過整個 middleware 函式，host 檢查形同虛設；改成函式內 `PORTAL_PUBLIC_PATHS.has(pathname)` 判斷，host 檢查才真的涵蓋到它們）|

### 🟠 Major（8 項，7 修正 + 1 記錄為 accepted residual）

| # | 發現 | 處置 |
|---|---|---|
| M1 | matcher 原本用未加邊界的字串比對（`portal/login` 會誤放行 `portal/login-anything`）| 用 §11 C3 的架構改動一併解決——這三條路徑改成 middleware 函式內 `Set.has()` 精確比對，不再依賴 matcher 的鬆散字串前綴 |
| M2 | naive nginx rewrite 會把 `/_next/static/*` 也加上 `/portal/` 前綴 → 404 → 兩個表單永遠 hydrate 不了 | §7.2 nginx 片段的 rewrite 規則加排除 `_next/`／`favicon.ico` |
| M3 | launcher 用 service-role client 讀資料，`0062` 的 RLS（`user_has_org_membership()`）整條路徑從未真正執行 | launcher 改用既有的 `lib/supabase/route-client.ts`（house 既有的「S2 migration」user-scoped client pattern，非新發明），RLS 變成真正的執行邊界，不再只是防禦縱深裝飾 |
| M4 | rate limit 全域計數（單一攻擊者可鎖死全球客戶 10 分鐘）+ TOCTOU race | 改成 per-caller salted hash 計數（`rateLimitKey()`），攻擊者只會鎖死自己；race 殘留（見下方 accepted residual）|
| M5 | `email_already_registered` 409 讓匿名呼叫者可以枚舉內部員工 email（同一個 Supabase Auth project） | 一律回傳同款「if this address can sign up...」202，不區分已存在/新建 |
| M6 | 補償刪除邏輯沒考慮「RPC 其實成功但 network/timeout 讓 supabase-js 誤報錯誤」的情況，會刪掉一個真實已建立的帳號並永久卡住那個 email（`profiles.email` UNIQUE）| 刪除前先查 `organizations` row 是否真的存在，存在就不刪，視為成功 |
| M7 | `email_confirm:true` 跳過 email 驗證 | 維持已知限制（V1 範圍內可接受），但**嚴重性因 C2 修正而降級**——即使有人用假冒 email 註冊，也進不了 ops console，只剩「佔用一個 email」的殘留風險 |
| M8 | `requireClientOrg()` 零測試覆蓋 | 新增 `lib/__tests__/tenant-guard.test.ts`，10 條 table-driven tests（每種「應該拒絕」的組合各一條 + 合法案例），`npx vitest run` 666/666 全過 |

**M4 accepted residual（誠實記錄，非隱藏）**：per-caller 計數仍是「先數後做」，非 Postgres 原子操作，同一攻擊者短時間內併發多個請求理論上可以突破自己的上限一點點。但已經從「全球被鎖死」降級成「攻擊者只能突破自己的配額」，且每次嘗試都要過 Turnstile，殘留風險可接受，未做成本更高的 Postgres 唯一鍵原子限流（真要做可另開一輪）。

### 🟡 Minor（8 項，6 修正 + 2 記錄不修）

- `blockedResponse` 對 `/portal/api/*` 誤判成非 API 路徑回 307 redirect（fetch 呼叫端會把登入頁 HTML 當 JSON 解析）→ **已修**（`isApiPath()` 同時涵蓋 `/api/` 與 `/portal/api/`）
- launcher 原本 `const { data } = await ...` 吞掉 `error`，DB 掛掉時會誤顯示成全部產品「即將推出」→ **已修**（明確處理 `error`，顯示錯誤訊息而非假裝正常）
- `portal.aware-wave.com/`（domain root）沒有對應頁面，404 → **已修**（新增 `app/portal/page.tsx` redirect 到 `/launcher`）
- email/org_name/password 沒有長度上限，`.includes('@')` 不是真的 email 驗證 → **已修**（加上限 + regex）
- `0063` 的 `set search_path = public` 跟房規（`public, pg_temp`）不一致 → **已修**
- rate limit 查詢缺索引 → **已修**（新增 partial index，順便改成 RPC 內原子寫入而非事後 UPDATE，一併解決一個潛在的「更新失敗導致漏標記」正確性問題）
- launcher 拒絕頁回 HTTP 200（應該 403，方便 monitoring 分辨）→ **記錄不修**：Next.js App Router 的 page component 不易直接控制狀態碼，非本輪必要项，留待有真需求時再處理
- 本文件 §10 誤寫 `organizations.status` 合法值含 `offboarding` → **已修**（訂正為 `active|inactive|suspended`，對照 `0001_core.sql:8`）

### 🔵 Suggestion（6 項，2 修正 + 4 記錄不修）

- `product_key` 打錯字會被靜默轉成 `cognitive` → **已修**（改明確白名單，不合法直接 422）
- Turnstile helper 兩處重複 → **已修**（`spawn_task` 已完成，`lib/turnstile.ts` 現為共用來源）
- Turnstile 驗證沒檢查 `hostname`／`error-codes` → **不修**：跟既有 `intake-browser` 共用同一份簡化版驗證邏輯，非本輪範圍
- `lib/tenant-guard.ts` 內 `req instanceof Request ? req.headers : req.headers` 死判斷 → **已修**（僅清理本次新增的 `requireClientOrg()` 那份；`resolveTenant`/`effectiveOrgId` 既有那份不動，避免超出邊界）
- launcher 的 `new Request(...)` 多餘配置 → **已修**（改直接傳 `{ headers: await headers() }`）
- `organization_memberships.membership_type` 無 CHECK 約束、舊有 `0030`/`0032`/`upsert_incident_atomic` 也有 C1 同款漏洞 → **不修，已開 `spawn_task`（task_43279c03）**：這是既有系統的既存問題，非 portal 這次變更的邊界，需要獨立一輪稽核+操作者 go-ahead 才能套用到正式庫

### 驗證

- `npx tsc --noEmit`：exit 0（全部修正完成後重跑）
- `npx vitest run`：**58 個測試檔、666 條全過**（含新增 10 條）
- 全部修正均為 repo 內檔案異動，**尚未套用任何 migration、尚未部署**——上面表格中提到的「已驗證」皆指 critic 對現場 DB/API 的唯讀查證（`proacl`、`curl`），不是套用了本次新程式碼後的驗證（那一步在 §7 步驟 5-7 go-ahead 之後才會發生）

## 12. Codex 第二意見（2026-08-29，操作者「Go + Codex review」後執行）

`codex-oracle.ps1 -Mode review` 這次成功跑完（`agency-os/reports/oracle/2026-08-29-review-a3747059.md`，耗時 ~8 分鐘，非本文件手打，Codex 原始輸出存檔）。3 個發現：

**FINDING 1（CONFIRMED，與 §10 自審重複，已知不修）**：`user_has_org_membership()` 不檢查 `organizations.status`，停權組織的 active membership 仍能通過 RLS。獨立於 Codex 之外，Claude 自審已經抓到同一個洞（§10），維持原判斷：既有共用函式，不在 portal 邊界內，記錄為已知缺口。

**FINDING 2（CONFIRMED，真發現，已修，含正式庫修正）**：`org_product_subs_external_tenant_uniq` 索引原本沒有排除 `canceled` 狀態，導致「同一個客戶取消訂閱後想重新啟用同一個 product tenant」這個正常流程會撞唯一索引失敗——舊的 canceled row 永遠佔著那個 `external_tenant_id`。**這是這次三輪覆審（db-expert/自審/critic）都沒抓到的真實 bug**，Codex 獨立找到。**已修**：
- Migration 檔案：索引改成 `where external_tenant_id is not null and status <> 'canceled'`（跟 `org_product_subs_live_uniq` 同一套 scoping 邏輯——canceled row 的歷史 `external_tenant_id` 不再佔用，兩個不同 org 仍然不能同時持有同一個 tenant 的 live claim）
- **正式庫已同步修正**（`0062` 當時已套用到 `ks-aw-01`，桌上型 SQL 修正 + 正式庫 `drop index` + `create index` 兩邊一起做，套用時資料表是空的（0 rows），零資料風險）：
  ```sql
  drop index if exists public.org_product_subs_external_tenant_uniq;
  create unique index org_product_subs_external_tenant_uniq
    on public.organization_product_subscriptions (external_tenant_id)
    where external_tenant_id is not null and status <> 'canceled';
  ```
  已驗證 `pg_indexes.indexdef` 確認正式庫索引定義跟修正後的 migration 檔案一致。

**FINDING 3（PLAUSIBLE，部分已被既有修正覆蓋，殘留記錄）**：客戶 session 快取（`session-cache.ts`）可能在 membership 被撤銷後短暫仍持有舊的身分,加上 service-role client 繞過 RLS,理論上撤銷生效前有個時間差。**現況**：launcher 的實際資料讀取路徑已經在 §11 M3 修正時改用 `createSupabaseUserClient()`（user-scoped，RLS 真正生效，不再是 service-role），所以 Codex 這個發現對「客戶讀自己訂閱清單」這條路徑已經部分被 M3 覆蓋。剩餘殘留：cache 過期窗口本身（既有共用機制,非 portal 引入）+ 任何未來使用 service-role 的 portal 路由都要記得比照 M3 用 user-scoped client——這點寫進本文件備查，不是現在要修的程式碼問題。

## 13. Codex 第三意見（2026-08-29，帶完整 §11 修正上下文的覆審，跑完）

`agency-os/reports/oracle/2026-08-29-review-fe335c00.md`，耗時 ~13 分鐘。3 個發現，**全部 CONFIRMED，全部修正**：

**FINDING 1（真發現，已修）**：`PORTAL_SIGNUP_ENABLED=true` 但忘記設 `TURNSTILE_SECRET_KEY` 時，signup route 會通過 kill switch 但完全跳過 captcha 檢查（原本 captcha 檢查邏輯是 `if (TURNSTILE_SECRET_KEY存在) 才檢查`）——等於一個沒有機器人防護的 service-role 帳號建立端點暴露出去。**已修**：兩個 env var 現在是聯合閘門，`PORTAL_SIGNUP_ENABLED !== "true" || !TURNSTILE_SECRET_KEY` 任一為真就回 503，不存在「開了但沒 captcha」的中間狀態。

**FINDING 2（真發現，已修）**：C2（擋 client 身分讀非 portal 路徑）跟 C3（host 檢查）**各自看起來沒問題，但串起來是個死路**——`clientForbiddenResponse()` 原本用 `new URL("/portal/launcher", request.url)` 組 redirect，這會**保留被擋請求原本的 host**（例如客戶用舊書籤打 `app.aware-wave.com/ops`，會被導去 `app.aware-wave.com/portal/launcher`），下一個請求打到 `isWrongHostForPortal()` 又因為 host 不對被拒絕 404，形成死路。**已修**：redirect 目標改成絕對網址 `new URL("/launcher", "https://portal.aware-wave.com")`，不管被擋請求原本在哪個 host，一律導去正確的 portal 網域。

**FINDING 3（真發現，已修）**：§11 M5 的枚舉修正範圍**修過頭**——原本把「email 已註冊」跟「任何其他 `createUser` 失敗」全部一視同仁回傳「成功」,導致 service-role key 設錯、GoTrue 掛掉等**真正的系統故障**也會被使用者跟營運者誤以為註冊成功,而且永遠查不出來為什麼。**已修**：只對「看起來是 email 重複」這個真正需要防枚舉的情境回傳無區別的 202；其他所有失敗（含 log 記錄）都回傳真實的 500 錯誤，不再隱藏。

### 驗證（三個修正後重跑）

- `npx tsc --noEmit`：exit 0
- `npx vitest run`：58 檔 666 條全過

## 14. `verify-recent` 機械閘第二輪 critic：抓到一個「正在燒」的 Critical + 4 個 Major

**這輪 critic 是對修正後最終版本的獨立 fresh pass（非重工——涵蓋的是 §11-§13 全部修正後的程式碼），實際下指令對 `ks-aw-01` 驗證,不是紙上談兵。**

### 🔴 C-A（Critical，已即時止血 + 已治本）

**發現時已經在燒**：DNS/nginx（§7 步驟 5-6）已上線但 next-admin 尚未部署，critic 用 curl 證實 `portal.aware-wave.com` 是一個**無限重導迴圈**（舊版 middleware 不認得 `/portal/login`，`blockedResponse()` 每一跳多疊一層 `next=`，最終 URL 長度爆炸 502），而且**跟 `app.aware-wave.com` 共用同一個 next-admin container 跟 `limit_req zone=admin`**——等於一個未授權的請求放大器,可以拿 portal 去拖累內部後台。

**即時止血（發現後立刻執行，不等其他修正完成）**：SSH 進 `ks-aw-01`，在 portal server block 最前面插入 `return 503;`，`nginx -t` 驗證後 **`docker restart lobster-nginx`**（`nginx -s reload` 不夠——這個 container 對 `default.conf` 是**單檔 bind mount**，`sed -i` 的 atomic-rename 寫法不會被 bind mount 看到，只有整檔 truncate-write 或重建 container 才會生效；本輪也因此改用 Python 檔案寫入取代後續的 `sed -i`）。驗證：portal 立刻變乾淨的 503（無重導鏈），四個既有網域（app/api/www/oracle）全部 200/301/307 正常，零回歸。

**治本**（`blockedResponse()` loop invariant，`middleware.ts`）：redirect 目標不可能比原請求「更接近再次觸發同一道 gate」——目標已經是 login-shaped path、或已經帶 `next` 參數、或組出來的 URL 超過 512 字元，一律不疊加 `next`，導去乾淨的 `/login`。這是不變量層修正，不是只堵這一次的路徑組合，未來任何 nginx/routing 不同步都不會再變成放大器。

### 🟠 Major（4 項，全部修正）

- **M-A**：nginx rewrite 的 `portal/` 負向前瞻沒有涵蓋**無尾斜線**的 `/portal`（Next.js 308 normalization 又會把 `/portal/` 退化回 `/portal`），導致網域根目錄變成 `/portal/portal` 雙前綴 404——**§11 為了修 domain-root-404 新增的 `app/portal/page.tsx` 因此從未真正執行過**。已修：nginx 片段跟 `middleware.ts` 的 `isPortalPath()` 都改成 `portal(?:/|$)` 邊界，兩處統一（TS 端原本 `isClientOutsidePortal`/`isWrongHostForPortal` 各自用 `startsWith("/portal/")` 也有同一個邊界洞，一併修）。
- **M-B**：M6 的補償刪除 re-check query 原本吞掉自己的 `error`——「查不到」被當成「確定不存在」處理,而造成 rpcErr 的同一個 network/timeout 也可能讓這條 re-check 一起失敗,結果是在不確定的狀態下刪掉一個真實帳號並永久佔用該 email（`profiles.email` UNIQUE 且無 FK 到 `auth.users`,孤兒資料不會自動清）。已修：接住 `error`,查詢失敗時**一律不刪**,回傳 `signup_state_unknown` + CRITICAL log 交人工對帳。
- **M-C**：`createUser` 失敗分支原本完全沒有 log（連非重複 email 的真實故障都沒有任何伺服器端紀錄）。已補 `console.error`（含 rate-limit count 查詢失敗那條）。
- **M-D**：Codex 第三意見 FINDING 1 的同一個問題，critic 獨立找到並確認同一組修正已覆蓋（兩個 env var 聯合閘門）。

### 🟡 Minor（6 項，5 修正 + 1 記錄不修）

`app/portal/login/page.tsx`／`signup/page.tsx` 註解仍寫「matcher 排除」（C3 早就改成函式內判斷,註解沒跟上,已修）／`clientForbiddenResponse` 的 early return 沒有複製 refreshed session cookie（已修,slow path 傳入 `response` 供複製）／`isClientOutsidePortal`/`isWrongHostForPortal` 的 `/portal` 邊界（隨 M-A 一併修）／`PortalSignupForm.tsx` 殘留一個 M5 修正後永遠不會回傳的 `email_already_registered` 死碼分支（已移除,補註解說明為什麼不會有這個 case）／body 讀取沒有先查 `content-length` 就整包讀進記憶體（已加前置檢查,post-read 檢查保留當真正防線）／`PORTAL_SIGNUP_RATE_LIMIT_SALT` 沒接進 `docker-compose.yml`（已修,同時提醒正式環境要設真隨機值,不能沿用原始碼 fallback 常數）。`lib/portal/products.ts` 的 `status` 型別是單一字面值導致 launcher 的 `isReady` 分支靜態不可達（Suggestion 層級,已修正型別為 union）。

### 治理提醒（critic 原話，記錄不隱藏）

文件先前寫「尚未套用任何 migration、尚未部署」對 migration/next-admin 正確，但 §7 步驟 5（CF CNAME）跟步驟 6③（lobster-nginx portal block）**當時已經套用到 prod**——文件跟現場不同步，這正是 C-A 能夠發生的原因之一。本節已訂正：**DNS/憑證/nginx 三項已上線**（現況：portal 暫時 `return 503` 止血中，待 next-admin 部署後才會拿掉），migration `0062`/`0063` 已套用（含本節修正的 index），next-admin 程式碼**待 commit + 部署**。

### 驗證（C-A + 4 Major + 6 Minor 全部修正後）

- `npx tsc --noEmit`：exit 0
- `npx vitest run`：58 檔 666 條全過
- 生產環境即時止血已驗證（curl 確認迴圈消失 + 四個既有網域零回歸）

## 15. 第三輪 critic（窄範圍驗證上一輪修正）：抓到一個「修正本身沒生效」的真發現

**這輪 critic 專門驗證 §14 那批修正是否真的正確**（非重新整篇覆審），SSH 到 `ks-aw-01` 實查即時止血現況、自己重跑 `tsc`/`vitest`。結論：C-A 治本邏輯、M-A nginx 邊界、M-B 補償刪除邏輯、M2 body 讀取順序、`products.ts` 型別修正**全部驗證通過**；但抓到一個 Major：**§14 為 M2（cookie 複製）寫的修正實際上是無效的**。

### 🟠 M-1（Major，真發現，已修）：`clientForbiddenResponse` 的 cookie 複製是空跑

根因在 `lib/supabase/ssr.ts`（**這個檔案本身沒被本次改動過，是既有 bug**）：`createSupabaseMiddlewareClient()` 回傳的 `response` 物件用 `let response = NextResponse.next(...)` 宣告，`setAll()` callback 裡用 `response = NextResponse.next(...)` **重新賦值**這個區域變數——但 `middleware.ts` 在呼叫端是 `const { supabase, response } = createSupabaseMiddlewareClient(request)`，這行執行時 `setAll()` 根本還沒跑（要等後面 `await supabase.auth.getUser()` 才觸發），所以呼叫端拿到的 `response` **永遠是重新賦值前的那個舊物件**——`setAll` 重新綁定的是 `ssr.ts` 內部的區域變數，呼叫端看不到。等於：**每一次 session token 輪替，重新整理過的 cookie 都被靜默丟棄**——不只是這次新加的 `clientForbiddenResponse` 路徑，連原本就存在的成功路徑（`middleware.ts` 既有程式碼）都有同一個洞，只是沒人發現，因為瀏覽器端的 `@supabase/ssr` client 自己也會重新整理 token，一般網頁沒事，但 server-rendered 的 portal 頁面在 idle 一段時間後沒有這層備援。

**已修**（`ssr.ts` + `middleware.ts` 兩處一起改，範圍剛好 = critic 用 grep 確認的唯一呼叫端）：`createSupabaseMiddlewareClient()` 改成回傳一個穩定的陣列（`refreshedCookies: RefreshedCookie[]`），`setAll()` 往陣列裡 push 而不是重新賦值一個物件——陣列的身分永遠不變，呼叫端事後讀取沒有「舊物件」的問題。`middleware.ts` 兩個套用點（成功路徑 + `clientForbiddenResponse`）都改用這個陣列。

### 🟡 Minor（3 項，全部修正）

- **M-2**：`docker-compose.yml` 這輪新加的 `PORTAL_SIGNUP_RATE_LIMIT_SALT: ${PORTAL_SIGNUP_RATE_LIMIT_SALT:-}` 沒設時是空字串**不是 undefined**，`??` 不會 fallback，salt 變成空字串，rate-limit key 可被彩虹表暴力反查——已修 `??` → `||`。
- **M-3**：M5 的重複 email 判斷靠字串比對 `msg.includes("already")`，若 GoTrue 錯誤文案改版就會失效且往錯誤方向失效（新 email 被誤判成失敗,不是舊 email 被誤判成成功）——已修，優先判斷結構化的 `createErr?.code === "email_exists"`，字串比對留作備援。
- **M-4**：C-A 治本邏輯（`blockedResponse`/`isPortalPath`）原本零測試覆蓋——已 export 這幾個純函式 + 新增 `lib/__tests__/middleware-portal-guards.test.ts`（22 條，含直接重現 incident 路徑的案例：`/portal/login` 不疊加 next、已帶 next 不重複疊加、超長 URL 直接丟棄）。

兩個 Suggestion 順手修：`products.ts` 註解路徑打錯（`lib/portal/launcher` → `app/portal/launcher`）；§7.2 的 nginx 片段補上 `return 503;` 這行 + 明確的移除條件註記,避免未來有人重貼這份文件時靜默重新打開流量。

### 驗證

- `npx tsc --noEmit`：exit 0
- `npx vitest run`：**59 檔、688 條全過**（新增 22 條）

## 16. 部署（2026-08-29，成功，含兩個部署期間發現並修正的問題）

`git commit 83277d80` + push → `ks-aw-01` 跑 `sg-deploy.sh next-admin`：

1. **第一次嘗試失敗**：`npm: command not found`。SSH 查證 `ks-aw-01` 自 2026-08-28 SG+EU 整併後**從未裝過 Node.js**（`dpkg`/`find` 全域搜尋確認）。裝 Node 20.20.2（對齊 `next-admin` Dockerfile 的 `node:20-alpine`）。
2. **第二次嘗試**：git pull → npm install → tsc typecheck 過 → npm test 過 → docker build 成功（~114s）→ container 啟動、**next-admin 自己的兩個 smoke 探針都過**，但另外兩個（wordpress／node-api health）非 2xx，**auto-rollback 正確觸發**，新 code 被自動還原。追根因：這兩個探針是整併前（2026-05-21）驗證的，整併後 `ks-aw-01` 同時掛多個 vhost，裸 Host 請求不再落到 WordPress、node-api 真實路徑是 `/health` 非 `/api/health`——**假陽性，不是 portal 程式碼的問題**。修好 `sg-deploy.sh`（獨立 commit `d9206dee`，過程中 critic 又抓到「用 `-L` 跟隨轉址會讓探針經公開 DNS 落到 Cloudflare」的新問題，改用 `--resolve` 強制本機解析）。
3. **第三次嘗試（`--skip-pull` 因鎖檔卡了一次,清掉 stale lock 後）：成功**。4/4 smoke 通過，`deployed commit: d9206dee`，無 rollback。

**移除止血 + 端對端驗證**（拿掉 nginx 的 `return 503`,`docker restart lobster-nginx` 生效)：

| 檢查 | 結果 |
|---|---|
| `portal.aware-wave.com/login` | 200 |
| `portal.aware-wave.com/`（跟隨重導） | 200，2 次重導，**無迴圈** |
| `portal.aware-wave.com/launcher`（無 session） | 307（正確擋下）|
| `portal.aware-wave.com/api/signup` POST | 503（`PORTAL_SIGNUP_ENABLED` 故意留空，V1 範圍界定生效）|
| 真實靜態資源（`_next/static/chunks/*.js`） | 200（M2 hydration 修正確認有效）|
| `app.aware-wave.com`／`api.aware-wave.com`／`www.aware-wave.com`／`oracle.aware-wave.com` | 200/200/301/307，**零回歸** |
| `lobster-next-admin` container logs | 無 error/CRITICAL |

**V1 範圍界定，這裡再次確認成立**：portal 身分層（login/launcher/host 隔離/C2 選擇性阻擋）已經真實上線；`PORTAL_SIGNUP_ENABLED` 刻意留空，所以**現在還沒有任何人能真的註冊**——這是設計好的，不是漏做。要開放真實註冊需要另一輪操作者 go-ahead（設定 env var + Turnstile 金鑰）。
