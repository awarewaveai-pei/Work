# app.aware-wave.com — 目前狀態權威文件（CURRENT STATE）

> **這份檔的用途**：任何 AI / 工程師要改 app.aware-wave.com（Lobster Factory Admin Console）**之前先讀這份**，了解網站「現在」長怎樣、怎麼登入、怎麼部署、有哪些陷阱。
> **與其他文件分工**：
> - 本檔 = **現況 + 怎麼操作**（live state，每次重大改動後更新）。
> - [`APP_AWARE_WAVE_COMPLETE_REFERENCE.md`](APP_AWARE_WAVE_COMPLETE_REFERENCE.md) = **完整 code 級參考**（每頁/API/lib/DB schema 1800 行）+ §14 12 問題的歷史分析與修法。
> **Last updated**: 2026-06-05（大修後：Supabase Auth 上線 + 12 問題處理完畢）

---

## 0. 一句話 + 怎麼登入（最重要）

app.aware-wave.com = AwareWave 的維運後台（Next.js 15 + React 19，部署在 SG VPS container `lobster-next-admin`）。

**登入**：
- 開 `https://app.aware-wave.com` → 單一登入頁（Supabase Auth）。
- 帳號：`awarewaveai@gmail.com`（role = **owner**）。密碼真值在本機 `mcp\user-env.ps1` 的 `APP_AWARE_WAVE_ADMIN_PASSWORD`（`secrets-vault.ps1 -Action get` 只印遮罩，僅供確認存在）。
- 登入後完整存取。改密碼：Supabase Studio（`studio.aware-wave.com/project/default`）→ Authentication → Users。

---

## 1. 認證架構（2026-06-05 大修核心 — Supabase Auth）

> **這是整個網站最關鍵的安全邊界。改 auth 前務必完整理解這節。**

### 1.1 機制
- **身分層 = Supabase Auth（email + 密碼）**。Auth project = **`https://supabase.aware-wave.com`**（= next-admin 容器的 `NEXT_PUBLIC_SUPABASE_URL`；**不是** soulfulexpression 那個 project）。
- 使用者角色存在 Supabase user 的 **`app_metadata.ops_role`**（值 = `owner|admin|operator|viewer`；伺服器控制，使用者不可改）。
- **員工逐工具權限（2026-10-24，ADR 019）**：`app_metadata.staff_tools`＝勾選的工具 key（沒有此欄＝從沒設定）。擁有者在 `/ops/staff` 設定（只有擁有者能改、擁有者永遠全部、最後一位擁有者不能降級）。middleware 讀它、注入 `x-ops-tools`（先剝除偽造值），每頁每 API 用 `lib/staff-access.ts staffDenial` 判斷；側欄、首頁、客戶中心分頁同一判斷。`STAFF_TOOLS_MODE` 只認 `enforce`；預設 shadow 只記 `[staff-tools] would_deny`、不擋。
- **登入流程**：`/login`（client）→ `signInWithPassword`（`@supabase/ssr` browser client，cookie session）→ 成功後 **`window.location.assign(next)` 完整頁面跳轉**（不可用 router.replace soft-nav，會 hang）。
- **middleware**（`middleware.ts`，Edge runtime）：驗 Supabase session（`getUser()`）→ 解析 `app_metadata.ops_role` → 注入 `x-ops-claims-role` header → 既有 RBAC（`lib/ops-role.ts`）照舊消費，**下游全不改**。

### 1.2 安全性質（不可破壞）
- **Fail-closed**：getUser 失敗 / 無 session / auth 未設定（prod 或 NODE_ENV unset）→ 一律擋（page → 302/login，API → 401）。
- **Anti-spoof**：middleware **無條件先剝除** inbound `x-ops-claims-role` / `x-user-role` / `x-clerk-role` / `x-ops-simulated-role`，再依 session 注入真實角色。**已實測**：帶 `x-ops-claims-role: admin` 經公開 CF 路徑仍 307→/login。
- **CSRF（2026-09-26）**：靠 session cookie 的 API 寫入（非 GET/HEAD/OPTIONS、`/api/*`、`/portal/api/*`）只在有同源正面證據時放行——`Sec-Fetch-Site: same-origin`；沒有 Fetch Metadata 時 `Origin` 的 scheme＋host 須等於 `x-forwarded-proto`／`x-forwarded-host`；兩者都無但帶 session cookie → 擋。否則 403 `cross_site_request_blocked`，容器 log 記 `[csrf] blocked`（`middleware.ts` `isCrossSiteWrite`）。原因：staging 在 `aware-wave.com/staging/`，與 app 同站，SameSite=Lax cookie 會被帶上。§1.3 的 token 呼叫端在這之前放行，不受影響。
- **保護範圍**：整個 console（matcher 排除 `_next/static`、`login`、`api/auth`、`api/webhooks`、`api/internal`）。首頁 `/`、`/build`、`/onboard`、`/ops-console` 等全部 gate（大修前這些頁從未 gate = 已修補的安全洞）。

### 1.3 Server-to-server 端點（豁免 session gate，各有自有 token）
middleware `PUBLIC_API_PATHS` + 特殊規則放行（**仍會剝除 claim header**）：
| 端點 | 自有認證 |
|---|---|
| `/api/ops/summary` | Uptime Kuma 心跳（公開）|
| `/api/ops/inbox/{health,digest,incidents}` | Bearer `OPS_INBOX_INGEST_TOKEN` |
| `/api/ops/probe` | Bearer（SG cron 心跳）|
| `/api/ops/repairs/health` | 公開健康端點（探測已 TTL cache）|
| `/api/webhooks/*` | 各自 Bearer / HMAC（matcher 排除）|
| `/api/internal/*`（telegram/slack/dispatch/provision-staging）| 各自 secret（matcher 排除）|
| `/api/ops/clients/[slug]/wp-update`、`wp-report` | `x-ops-sync-key == OPS_PROXY_SHARED_SECRET`（middleware timing-safe 放行）|

> **改 matcher 或 PUBLIC_API_PATHS 時務必小心**：擴大 gate 會誤擋 server-to-server 端點（2026-06-05 大修時 critic 抓到 3 個此類 regression：Telegram 指令、probe 心跳、WP 自動化）。每次改 auth 後**必跑 server-to-server smoke**（見 §3.4）。

### 1.4 nginx（已移除 basic-auth）
- 現役路徑：Cloudflare → ks-aw-01 host nginx `/etc/nginx/sites-enabled/sg-stack.aware-wave.com`（TLS）→ `127.0.0.1:8083` lobster-nginx → next-admin。
- **HTTP Basic Auth 已於 2026-06-05 移除**（原 `.htpasswd_studio` 是舊臨時擋板，Supabase Auth 取代後變多餘，造成兩層登入）。backup：`<file>.bak-20260605-authcutover`。
- nginx 仍注入 `proxy_set_header x-ops-claims-role admin/operator`（**已被 middleware 無條件剝除，無害但語意過時**，可後續清理）。
- repo SSOT：外層 `nginx/system-sites/sg-stack.aware-wave.com.conf`；內層 `nginx/default.conf`。舊 `aware-wave-app-api-subdomains.conf` 已標示 retired，不再是部署來源。

### 1.5 關鍵檔案
- `lib/supabase/ssr.ts` — browser + middleware Supabase client（與既有 `lib/supabase-server.ts` data client 分離）。
- `middleware.ts` — session gate + 角色注入 + anti-spoof。
- `app/login/{page,LoginForm}.tsx` — 登入頁（fixed overlay 蓋 sidebar、hard-nav）。
- `app/LogoutButton.tsx` — sidebar footer 登出。

---

## 2. 視覺 / 導覽現況（2026-06-05）

- **Sidebar = 淺色背景 + 深色字**，hover / 選中 = indigo 色塊 + 左側 indigo bar（`globals.css` `--sidebar-*`）。code 區塊 `<pre>` 用獨立 `--code-bg`（深色）。
- 導覽分區：Overview / Repair OS / Actions / Provisioning / Content Tools / System / External。
- **命名統一**：`/ops/inbox` 一律稱 **「Ops Inbox」**（sidebar + Dashboard + 頁內 header 一致；不再有「Incident Engine」）。
- **即時更新**：Repair Center（15s）/ Ops Inbox（20s）/ Approvals（20s）有 `AutoRefresh`（分頁可見時 `router.refresh()`，無 SSE）。

---

## 3. 部署流程 + 陷阱（每次改 next-admin 必讀）

### 3.1 正規部署
SSH 進 SG → `/root/lobster-phase1/scripts/sg-deploy.sh next-admin`。內建 gate：git pull → **tsc typecheck** → npm test → docker build → healthcheck → **HTTP smoke** → 失敗自動 rollback。

### 3.2 已踩過的陷阱（血淚）
1. **新增 npm 依賴**：sg-deploy 的 typecheck gate 跑 `$REPO_DIR/lobster-factory/.../next-admin`，**`REPO_DIR=/root/Work`**（不是 rsync 目標 `/root/lobster-phase1/apps/next-admin`）。新 dep 要先在 `/root/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin` 跑 `npm ci`，否則 typecheck 報 `Cannot find module`。
2. **SSH build 時常 Connection reset**（4GB box build 記憶體壓力）→ 用 **`setsid` detached** 跑部署，SSH 斷不影響：`setsid bash -c "sg-deploy.sh next-admin > log 2>&1" < /dev/null &`，再輪詢 log / `.deployed-commit`。
3. **NEXT_PUBLIC_* build-time bake**：改了要**重 build**（不只 restart）。auth 用的 `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` 已 bake 進 browser bundle。
4. **跨 session 撞車**：typecheck gate 跑整個 next-admin，**別人未過 typecheck 的 WIP 會擋住你的部署**（2026-06-05 Tarot 功能 jszip/型別錯擋過一次）。

### 3.3 smoke check（auth 後已調整）
`sg-deploy.sh` Step 7 next-admin liveness 探 **`/login`（200）** + `/api/ops/summary`（豁免，200）—— **不可探 `/`**（已 gate，未登入回 302→/login，會誤觸 auto-rollback）。

### 3.4 改 auth 後必跑的 server-to-server smoke
```bash
# 在 SG localhost:3002 跑（容器內 env 提供 token）
/ops/repairs 無 session → 期望 307→/login
/api/ops/repairs 無 session → 期望 401
POST /api/ops/probe +Bearer OPS_INBOX_INGEST_TOKEN → 期望 200（GET = 405；無 Bearer = 401）
/api/internal/commands/telegram → 期望非 middleware-401
spoof x-ops-claims-role:admin 於 /ops/repairs → 期望 307（被剝除）
POST /api/ops/repairs + Sec-Fetch-Site: same-site → 期望 403 cross_site_request_blocked
POST /api/ops/clients/<slug>/wp-report + Sec-Fetch-Site: same-site + x-ops-sync-key → 期望非 403
```

---

## 4. 12 問題現況（2026-06-05 大修後）

| # | 問題 | 狀態 | commit |
|---|------|------|--------|
| P1 | Auth production 403 | ✅ 已解（Supabase Auth 身分層上線）| 多 commit（見 §1）|
| P2 | WpUpdateButtons 無樣式 | ✅ 已解（globals.css `.wp-up-*` class）| `cbe6d6e3` |
| P3 | 三名一頁（Incident Engine/Ops Inbox）| ✅ 已解（統一「Ops Inbox」）| `04869f73` |
| P4 | 兩個 Onboarding 入口 | ✅ 已釐清：兩者非重複，是建站兩階段 —— `/ops/onboarding`=客戶 intake 問卷、`/onboard`=技術建站精靈。sidebar 標籤改清楚（第1步/第2步）| `（待部署）` |
| P5 | Repair 佇列邏輯洞 | ✅ 已解（只隱藏 active/human_only run 的 incident）| `a831efd5` |
| P6 | repairs/health 每 GET SSH | ✅ 已解（60s TTL cache）| `95e80904` |
| P7 | GitHub PR 棄案不處理 | ✅ 已解（closed-not-merged→human_only）| `a831efd5` |
| P8 | 無即時更新 | ✅ 已解（AutoRefresh polling）| `04869f73`（部署待 Tarot typecheck）|
| P9 | AI label 寫死 Gemini | ✅ 已解（AutoSummary 動態 provider）| `a831efd5` |
| P10 | Approvals 幾乎永遠空 | ✅ 已改善（空狀態誠實說明 + 導向 System Modes）| `04869f73`（部署待）|
| P11 | Ops Console 孤兒頁 | ✅ 已改善（導向 banner，非破壞性保留）| `04869f73`（部署待）|
| P12 | Inbox→Repair 單向導覽 | ✅ 已解（RepairPanel：狀態+連結 / 啟動修復）| `a831efd5` |

> **12 問題全數處理。** P4 的釐清：原分析「兩入口做同樣的事」其實不準 —— `/ops/onboarding` 是客戶探索式 intake 問卷（`IntakeForm` type，對齊 [Client Onboarding Portal 規格](../architecture/client-onboarding-portal-spec.md)），`/onboard` 是 operator 技術建站精靈（slug/部門→Build Console），兩者是建站的**不同階段**。修法 = sidebar 標籤分清（「Onboarding（客戶 Intake）」第1步 / 「建站精靈（技術）」第2步），保留兩工具。未來 Onboarding Portal 完整實作時可再串成單一導引流程。

---

## 5. 關鍵營運事實（一覽）

| 項目 | 值 |
|---|---|
| 公開 URL | `https://app.aware-wave.com`（CF → host nginx :443 → lobster-nginx :8083 → next-admin :3002）|
| Admin 帳號 | `awarewaveai@gmail.com`（owner）；密碼 vault `APP_AWARE_WAVE_ADMIN_PASSWORD` |
| Auth / DB project | `supabase.aware-wave.com`（Studio `studio.aware-wave.com/project/default`）|
| 容器 | ks-aw-01 `145.239.195.47` / `lobster-next-admin`（:3002）|
| 部署 | `/root/lobster-phase1/scripts/sg-deploy.sh next-admin`（REPO_DIR=`/root/Work`）|
| 主機 SSH | `ssh -p 58122 ubuntu@145.239.195.47`（root 操作加 sudo；腳本一律經 `scripts/lib/prod-host.ps1`，不用 ssh 別名）|
| 角色矩陣 | viewer/operator/admin/owner（見 COMPLETE_REFERENCE §3）|

---

## 6. 改動前 checklist / rollback

**改 auth / middleware / nginx 前**：完整讀 §1 + 跑 §3.4 server-to-server smoke（改前後對照）。
**改 next-admin code**：本機 `npx tsc --noEmit` + `npm run build` 綠才 push；部署用 detached（§3.2）。
**rollback**：
- code：`git revert <commit>` + sg-deploy（自動回上一個 image snapshot）。
- nginx：`cp <file>.bak-20260605-authcutover <file> && nginx -t && systemctl reload nginx`。
- admin 帳號：Supabase GoTrue admin API DELETE / 改密碼。

---

*維護：每次 app.aware-wave.com 重大改動後更新本檔（尤其 §1 auth / §2 導覽 / §4 問題現況）。*
