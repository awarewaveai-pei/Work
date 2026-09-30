# Hetzner Phase 1 core stack (compose)

> 📍 機器拓樸（誰跑哪台）唯一正本：[`AWAREWAVE_STACK_QUICKREF.md`](../../../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)。本檔 = Phase 1 core（SG）部署/設定正本；改容器時兩邊一起改。

**長期營運正本（多週期／可還原／可換人）**：[`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md) — 映像釘選、備份與 RPO/RTO、TLS、升級節奏、汰換判準。部署前先讀 §1～§3。  
**維護日曆（週／月／季／年勾選）**：[`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md)。

**目的**：在 **Supabase 已另機／另 compose 運行** 的前提下，於 Hetzner 起 **Nginx + Redis + WordPress + Node API + Next.js Admin**（可選本地 **n8n**），形成可驗收的第一階段底座。

### n8n（預設不在本機跑）

對外公開 **`https://n8n.aware-wave.com`** 為 **EU** 自架實例時，**不要在 SG phase1 再跑第二套 n8n**（重複耗 RAM、workflow 分叉）。本 compose 將 **`n8n` 服務標為 profile `local-n8n`**：`docker compose up -d` **預設不會啟動** lobster-n8n。若你確實要在該主機跑本地 n8n（開發或過渡）：

```bash
COMPOSE_PROFILES=local-n8n docker compose --env-file .env up -d
```

見 **`mcp/SERVICE_CREDENTIALS_MAP.md`**（AwareWave DNS／後端分區）。

**本版預設為「可長期跑」取向**：Node 服務使用 **多階段 Dockerfile**（非每次啟動 `npm install`）、**健康檢查**、Nginx **等 app 健康後**才對外。開發熱重載見下方附錄。

**對應治理文件**：`agency-os/docs/operations/hetzner-full-stack-self-host-runbook.md`  
**堆疊在整體中的位置（Phase A 10 項／平面／連動）**：`agency-os/docs/operations/hetzner-stack-rollout-index.md`

## Cloudflare 邊緣（DNS / WAF / TLS）

Next.js 仍為 **自架 Docker + Nginx**；Cloudflare 只作 **邊緣**。操作步驟、SSL 模式與真實 IP 還原見：**[`agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md`](../../../agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md)**。本 compose 已掛載 **`nginx/cloudflare-real-ip.conf`**（`00-` 前綴確保先載入）。  
**`api.aware-wave.com`／`node-api` 演進計畫與子網域統管入口**（**git 唯一正文**，勿與 `~/.cursor/plans/` 重複全文）：[`agency-os/docs/edge-and-domains/EDGE_DOMAINS_INDEX.md`](../../../agency-os/docs/edge-and-domains/EDGE_DOMAINS_INDEX.md)。

## 現役雙層 Nginx（ks-aw-01）

host nginx 佔用 `:80/:443`、終結 TLS，正本是 [`nginx/system-sites/sg-stack.aware-wave.com.conf`](./nginx/system-sites/sg-stack.aware-wave.com.conf)；它只轉給 `127.0.0.1:8083`。lobster-nginx 的 [`nginx/default.conf`](./nginx/default.conf) 才負責各 hostname 的 app routing。`127.0.0.1:3002` 是 next-admin 的本機 health/deploy port，不是公開 TLS 路徑；`aware-wave-phase1.conf`、`aware-wave-app-api-subdomains.conf` 只保留歷史查證，不可部署。

## 安全（必讀）

- **不要**把 `.env` 或 **service role / root DB 密碼** 提交到 Git，也不要貼到聊天或 Issue。
- 若曾把 **真實 IP、密碼或金鑰** 貼在公開場合，請 **立刻輪替**。
- 本目錄只提供 **`.env.example` 佔位符**；實機請 `cp .env.example .env` 後填入。
- **127.0.0.1 映射**（3000/3001/5678/6379/8080）僅便於 SSH 除錯；對外公開服務應僅 **:80 / :443**，上線後可刪除這些 `ports` 區塊（僅保留 Nginx）。

## 安裝與啟動

```bash
cd lobster-factory/infra/hetzner-phase1-core
cp .env.example .env
# 必填：WORDPRESS_PUBLIC_URL 須與瀏覽器實際網址一致（公開 origin，無路徑尾碼；例如 https://aware-wave.com）
docker compose --env-file .env build
docker compose --env-file .env up -d
```

**現役 ks-aw-01 host nginx**：`nginx/system-sites/sg-stack.aware-wave.com.conf` 是外層 TLS vhost 正本，統一轉到 `127.0.0.1:8083` 的 lobster-nginx；只可用 `scripts/safe-infra-patch.sh host-nginx` 做 backup→apply→`nginx -t`→reload→HTTPS smoke→失敗回滾。`nginx/default.conf` 才是內層 app routing 正本。舊 `aware-wave-phase1.conf`／`aware-wave-app-api-subdomains.conf` 不可再部署。

**變更 `NEXT_PUBLIC_*` 後**必須 **重建 next-admin**（建置期間 baked in）：

```bash
docker compose --env-file .env build next-admin
docker compose --env-file .env up -d next-admin
```

## 驗收

```bash
docker compose ps
# --resolve 強制本機解析（不用 -L 跟隨 http->https 轉址——那會讓 curl 重新查公開 DNS，
# 可能落到 Cloudflare edge 而非本機，見 DEPLOY_ROLLBACK_RUNBOOK.md 2026-08-29 訂正）
curl -sfk --resolve aware-wave.com:443:127.0.0.1 https://aware-wave.com/
# node-api：直打 container 自己發布的埠(3001)，不經任何一層 nginx。舊版用
# `-H "Host: api.aware-wave.com" http://127.0.0.1/health` 打的是外層 host-nginx（Certbot 管理，
# 監聽 80），9/12 該層因另一網域的憑證變更開始強制轉址，導致這條探針假陽性——見
# DEPLOY_ROLLBACK_RUNBOOK.md 2026-09-12 訂正，sg-deploy.sh 已同步改用這個形式。
curl -sf http://127.0.0.1:3001/health
```

**Sentry（next-admin，可選）**：部署並設定 DSN 後，可對外公開 URL 呼叫 **`GET /admin/api/sentry-test`**（實作：[apps/next-admin/app/api/sentry-test/route.ts](apps/next-admin/app/api/sentry-test/route.ts)），於 Sentry 專案確認收到測試事件。

**PostHog（next-admin，可選，建議雲端）**：於 `.env` 填入 **`NEXT_PUBLIC_POSTHOG_KEY`**（與選填 **`NEXT_PUBLIC_POSTHOG_HOST`**，預設 `https://us.i.posthog.com`）；留空則不初始化。變更後須 **`docker compose build next-admin`** 再 **`up -d next-admin`**（`NEXT_PUBLIC_*` 為建置期注入）。啟用後：`capture_pageview` 使用 **`history_change`**（適配 App Router 客戶端導覽）、**不自動 autocapture**；並會送出 **`ops_console_viewed` / `ops_inbox_viewed` / `api_check_*`** 等自訂事件，以及經 **`GET /api/ops/analytics-context`** 附加的 **`ops_role`** super-property（無 PII）。單人內網除錯可選 **`NEXT_PUBLIC_POSTHOG_DISTINCT_ID`**（見 `.env.example`）。

瀏覽器（將主機名換成實際 IP／網域）：

- 公開網站（WordPress）：`http://YOUR_HOST/`
- Next 管理介面：`http://YOUR_HOST/admin/`
- API：`http://YOUR_HOST/api/health`
- n8n：`http://YOUR_HOST/n8n/`

**`N8N_PATH`／`N8N_WEBHOOK_URL`／Cursor `N8N_MCP_URL`** 須與 **`.env.example` Pattern A 或 B** 擇一對齊；對照表與 **404／`TRY_ALT`** 說明見 **`agency-os/docs/operations/n8n-self-hosted-mcp-troubleshooting.md`**（勿與反代假設混用兩種型態）。

### n8n 映像升級（Docker）

本 repo 以 **`.env` 的 `N8N_IMAGE_TAG`** 釘選 semver（預設見 **`.env.example`**；與 [npm 最新 stable](https://www.npmjs.com/package/n8n) 對齊時可一併更新該行）。升級前請先掃 [Release notes](https://docs.n8n.io/release-notes/)（跨多個 minor 時注意 DB migration／breaking changes）；備份策略見 **`LONG_TERM_OPS.md`**。

在 **VPS**、Phase 1 compose 目錄內：

```bash
# 編輯 .env → N8N_IMAGE_TAG=<新版本>（與 git pull 後的 .env.example 對齊亦可）
docker compose --env-file .env pull n8n && docker compose --env-file .env up -d n8n
curl -sf http://127.0.0.1:5678/healthz && echo OK
```

升級後請開 n8n UI 抽檢 workflow；若使用 Cursor MCP，於 monorepo 根跑 **`n8n-mcp-smoke`**（見 **`agency-os/docs/operations/n8n-self-hosted-mcp-troubleshooting.md`**）。

WordPress 第一次安裝若耗時較長，`wordpress` 的 `healthcheck` 有較長 `start_period`；若 `nginx` 遲遲不起，看 `docker compose logs wordpress nginx`。若映像檔無 `curl`，將 compose 裡 WordPress `healthcheck` 改為 `wget -qO- http://127.0.0.1/` 同效。

## 備份（自動化，daily cron）

每日 **02:00 UTC** 自動備份 WordPress DB + uploads + n8n volume，**02:30 UTC** 自動驗證完整性（失敗時 Slack 告警）。本機保留 7 天，超過自動清除。

```bash
# 安裝 cron（首次或 server rebuild 後）
bash scripts/install-maintenance-crons.sh --host sg

# 手動執行
./scripts/backup-phase1.sh          # 備份
./scripts/verify-backup.sh          # 驗證
tail -100 /var/log/lobster-backup.log  # 查看日誌

# 啟用異地備份（一次性設定）
bash scripts/setup-offsite-backup.sh <access-key> <secret-key> <bucket-name>
```

備份還原演練證據：[`BACKUP_RESTORE_PROOF.md`](./BACKUP_RESTORE_PROOF.md)。**Supabase** 請仍依 `supabase-self-hosted-cutover-checklist.md` 等文件排程備份。

## 主機資源診斷（慢、卡、疑似 OOM）

我無法從開發機代你 SSH 上 VPS；請在 **VPS 上**執行（**唯讀**，不改系統）：

```bash
cd /root/lobster-phase1   # 或你的實際 compose 目錄
chmod +x scripts/diagnose-host-resources.sh
./scripts/diagnose-host-resources.sh
# 若 compose 不在當前目錄： ./scripts/diagnose-host-resources.sh /path/to/phase1
```

輸出含：`free -h`、`swap`、`df`、`docker stats`、`docker compose ps`、`dmesg` 尾段（OOM 線索）。把**完整輸出**貼回除錯即可判讀 swap／磁碟／哪個容器吃記憶體。

## n8n × Sentry（自託管）

### 建議 DSN 分流命名（清楚版）

建議用「**服務 = 一條 DSN 變數**」命名，避免告警混在一起難查：

- `SENTRY_DSN_NODE_API`：node-api 後端（含 Supabase 代理錯誤）
- `SENTRY_DSN_TRIGGER_WORKFLOWS`：Trigger.dev workflows 任務錯誤（由 workflows 程式讀取）
- `SENTRY_DSN_N8N_BACKEND`：n8n 後端執行錯誤
- `SENTRY_DSN_N8N_FRONTEND`：n8n 編輯器前端錯誤（選填）
- `SENTRY_DSN_NEXT_ADMIN`：Next.js admin 前端錯誤
- `SENTRY_DSN_WORDPRESS`：WordPress/PHP 錯誤

### 推薦 Sentry Project 命名（6 個）

建議在 Sentry 用固定格式：`awarewave-lobster-<service>-<runtime>`，好處是搜尋與權限分組都直覺。

- `awarewave-lobster-node-api-backend`（Node.js）
- `awarewave-lobster-trigger-workflows-backend`（Node.js）
- `awarewave-lobster-n8n-backend`（Node.js）
- `awarewave-lobster-n8n-frontend`（Browser，選填）
- `awarewave-lobster-next-admin-frontend`（Next.js / Browser）
- `awarewave-lobster-wordpress-backend`（PHP）

### `.env` 對照清單（可直接填）

以下 6 條是建議主鍵（空值代表該路徑暫不啟用）：

```dotenv
SENTRY_DSN_NODE_API=
SENTRY_DSN_TRIGGER_WORKFLOWS=
SENTRY_DSN_N8N_BACKEND=
SENTRY_DSN_N8N_FRONTEND=
SENTRY_DSN_NEXT_ADMIN=
SENTRY_DSN_WORDPRESS=
```

**不用在這些「基礎設施本體」裝 Sentry SDK**：Supabase **Kong**（閘道）、**MinIO**（物件儲存）、**Uptime Kuma**（`uptime.*` 監控頁）— 它們不是你自己寫的應用程式；錯誤／可用性請看各服務日誌、健康檢查，或讓 **node-api / next-admin / WordPress** 的 Sentry 代表使用者可見錯誤。若要「斷線也進 Sentry」，可用 Sentry **Cron Monitors** 或監控告警 Webhook，而不是給 Kong 裝 Node SDK。

建議同步加上通用標籤（每個服務至少要有）：

- `environment`: `staging` / `production`
- `service`: `node-api` / `trigger-workflows` / `n8n` / `next-admin` / `wordpress`
- `owner`: `lobster-factory`

目前 compose 已做「新命名優先、舊命名相容」：

- node-api：`SENTRY_DSN_NODE_API` → fallback `SENTRY_DSN`
- Next.js：admin：`SENTRY_DSN_NEXT_ADMIN` → fallback `SENTRY_DSN_NEXT`
- WordPress：`SENTRY_DSN_WORDPRESS` → fallback `SENTRY_DSN_WP`
- n8n backend：`N8N_SENTRY_DSN` → `SENTRY_DSN_N8N_BACKEND` → `SENTRY_DSN_N8N`

n8n 映像讀取 **`N8N_SENTRY_DSN`**（後端）與選填 **`N8N_FRONTEND_SENTRY_DSN`**（編輯器前端）；可選 **`ENVIRONMENT`** / **`DEPLOYMENT_NAME`** 等（與 n8n 原始碼 `packages/@n8n/config/src/configs/sentry.config.ts` 一致）。

1. 在 Sentry 建立專案（類型 **Node.js** 給後端；若要前端再建 **Browser** 或沿用同一專案視需求）。  
2. 在伺服器 `.env` 填入 **`N8N_SENTRY_DSN`**（或舊別名 **`SENTRY_DSN_N8N`**，與選填 **`SENTRY_DSN_N8N_FRONTEND`**），見 **`.env.example`**。  
3. **`docker compose --env-file .env up -d`**（或僅 **`docker compose --env-file .env up -d n8n`**）讓 n8n 重載環境。  

**最小驗證**

- `curl -sf http://127.0.0.1:5678/healthz`（容器本機）或經 Nginx 開啟 `/n8n/` 登入一次。  
- 在 Sentry 該專案查看是否有來自 **`environment`** = `N8N_SENTRY_ENVIRONMENT` 的事件（首次可能僅在後端發生錯誤或特定操作後才有）。  
- 刻意測試：在 n8n 建立一條 **Code** 節點丟錯誤並執行，或觀察執行失敗是否出現在 Sentry（依 n8n 版本與事件類型而定）。

## 已知／刻意邊界

- **無 HTTPS** — 下一階段（Cloudflare / Let’s Encrypt）再接。
- **WordPress 在網域根** — `WORDPRESS_PUBLIC_URL` 必須是公開 origin（**不要**加 `/wp`）；若先前裝在子路徑，請在 WP 後台或 `wp search-replace` 更新站台網址，或參考 WordPress「變更網址」文件。
- **Trigger.dev** — 不在此 compose；對齊 `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` 另接。
- **Next / Node production images** — 若要熱重載，請用附錄或在本機跑 `npm run dev`，不要強求與 production image 混用。

---

## 附錄 A：在 VPS 熱重載（可選，不建議與 production 混用）

**建議**：應用程式在開發機 `npm run dev`，VPS 只跑 **build 過的 image**。

若堅持在 VPS bind-mount 源碼，請在 **分支或本機副本** 手動將 `node-api`／`next-admin` 改回：

- `image: node:20-alpine`（並 **移除** `build:`）
- `volumes: ./apps/...:/app`
- `command: sh -c "npm install && npm run dev"`
- 將 `nginx` 對這兩個服務的 `depends_on` 改為 `service_started`，或暫時關閉對應服務的 `healthcheck`，避免 `nginx` 永遠等不到 `healthy`。

佈署前務必在該主機執行 `docker compose config` 目視確認合併結果。

## Related

- **長期營運契約**：[`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md) · [`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md) · [`BACKUP_RESTORE_PROOF.md`](./BACKUP_RESTORE_PROOF.md)
- `agency-os/docs/operations/hetzner-self-host.env.example`
- `agency-os/docs/operations/supabase-self-hosted-cutover-checklist.md`
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`

## Related Documents (Auto-Synced)
- `docs/operations/hetzner-stack-rollout-index.md`

_Last synced: 2026-04-06 07:49:28 UTC_

