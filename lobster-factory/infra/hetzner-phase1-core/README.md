# Hetzner Phase 1 core stack (compose)

**長期營運正本（多週期／可還原／可換人）**：[`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md) — 映像釘選、備份與 RPO/RTO、TLS、升級節奏、汰換判準。部署前先讀 §1～§3。  
**維護日曆（週／月／季／年勾選）**：[`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md)。

**目的**：在 **Supabase 已另機／另 compose 運行** 的前提下，於同一台 Hetzner（或第二台）起 **Nginx + Redis + n8n + WordPress + Node API + Next.js Admin**，形成可驗收的第一階段底座。

**本版預設為「可長期跑」取向**：Node 服務使用 **多階段 Dockerfile**（非每次啟動 `npm install`）、**健康檢查**、Nginx **等 app 健康後**才對外。開發熱重載見下方附錄。

**對應治理文件**：`agency-os/docs/operations/hetzner-full-stack-self-host-runbook.md`  
**堆疊在整體中的位置（Phase A 10 項／平面／連動）**：`agency-os/docs/operations/hetzner-stack-rollout-index.md`

## Cloudflare 邊緣（DNS / WAF / TLS）

Next.js 仍為 **自架 Docker + Nginx**；Cloudflare 只作 **邊緣**。操作步驟、SSL 模式與真實 IP 還原見：**[`agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md`](../../../agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md)**。本 compose 已掛載 **`nginx/cloudflare-real-ip.conf`**（`00-` 前綴確保先載入）。

## 安全（必讀）

- **不要**把 `.env` 或 **service role / root DB 密碼** 提交到 Git，也不要貼到聊天或 Issue。
- 若曾把 **真實 IP、密碼或金鑰** 貼在公開場合，請 **立刻輪替**。
- 本目錄只提供 **`.env.example` 佔位符**；實機請 `cp .env.example .env` 後填入。
- **127.0.0.1 映射**（3000/3001/5678/6379/8080）僅便於 SSH 除錯；對外公開服務應僅 **:80 / :443**，上線後可刪除這些 `ports` 區塊（僅保留 Nginx）。

## 安裝與啟動

```bash
cd lobster-factory/infra/hetzner-phase1-core
cp .env.example .env
# 必填：WORDPRESS_PUBLIC_URL 須與瀏覽器實際網址一致（例如 http://YOUR_IP/wp）
docker compose --env-file .env build
docker compose --env-file .env up -d
```

**變更 `NEXT_PUBLIC_*` 後**必須 **重建 next-admin**（建置期間 baked in）：

```bash
docker compose --env-file .env build next-admin
docker compose --env-file .env up -d next-admin
```

## 驗收

```bash
docker compose ps
curl -sf http://127.0.0.1/health
curl -sf http://127.0.0.1/api/health
curl -sf http://127.0.0.1/
curl -sf http://127.0.0.1:3001/health   # SSH 本機除錯
```

**Sentry（next-admin，可選）**：部署並設定 DSN 後，可對外公開 URL 呼叫 **`GET /api/sentry-test`**（實作：[apps/next-admin/app/api/sentry-test/route.ts](apps/next-admin/app/api/sentry-test/route.ts)），於 Sentry 專案確認收到測試事件。

**PostHog（next-admin，可選，建議雲端）**：於 `.env` 填入 **`NEXT_PUBLIC_POSTHOG_KEY`**（與選填 **`NEXT_PUBLIC_POSTHOG_HOST`**，預設 `https://us.i.posthog.com`）；留空則不初始化。變更後須 **`docker compose build next-admin`** 再 **`up -d next-admin`**（`NEXT_PUBLIC_*` 為建置期注入）。

瀏覽器（將主機名換成實際 IP／網域）：

- Admin：`http://YOUR_HOST/`
- API：`http://YOUR_HOST/api/health`
- n8n：`http://YOUR_HOST/n8n/`
- WordPress：`http://YOUR_HOST/wp/`

WordPress 第一次安裝若耗時較長，`wordpress` 的 `healthcheck` 有較長 `start_period`；若 `nginx` 遲遲不起，看 `docker compose logs wordpress nginx`。若映像檔無 `curl`，將 compose 裡 WordPress `healthcheck` 改為 `wget -qO- http://127.0.0.1/` 同效。

## 備份（Phase 1 最小份）

```bash
chmod +x scripts/backup-phase1.sh   # Linux 上
./scripts/backup-phase1.sh
```

產出壓縮 SQL + `wp-html.tgz`。**Supabase** 請仍依 `supabase-self-hosted-cutover-checklist.md` 等文件排程備份。

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
- **WordPress 子路徑** — 已用 `WORDPRESS_PUBLIC_URL` + `WORDPRESS_CONFIG_EXTRA` 降低錯位；若仍異常，優先改 **子網域** 安裝。
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

- **長期營運契約**：[`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md) · [`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md)
- `agency-os/docs/operations/hetzner-self-host.env.example`
- `agency-os/docs/operations/supabase-self-hosted-cutover-checklist.md`
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`

## Related Documents (Auto-Synced)
- `docs/operations/hetzner-stack-rollout-index.md`

_Last synced: 2026-04-06 07:49:28 UTC_

