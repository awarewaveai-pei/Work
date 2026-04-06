# Hetzner Phase 1 core stack (compose)

**長期營運正本（多週期／可還原／可換人）**：[`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md) — 映像釘選、備份與 RPO/RTO、TLS、升級節奏、汰換判準。部署前先讀 §1～§3。  
**維護日曆（週／月／季／年勾選）**：[`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md)。

**目的**：在 **Supabase 已另機／另 compose 運行** 的前提下，於同一台 Hetzner（或第二台）起 **Nginx + Redis + n8n + WordPress + Node API + Next.js Admin**，形成可驗收的第一階段底座。

**本版預設為「可長期跑」取向**：Node 服務使用 **多階段 Dockerfile**（非每次啟動 `npm install`）、**健康檢查**、Nginx **等 app 健康後**才對外。開發熱重載見下方附錄。

**對應治理文件**：`agency-os/docs/operations/hetzner-full-stack-self-host-runbook.md`  
**堆疊在整體中的位置（Phase A 10 項／平面／連動）**：`agency-os/docs/operations/hetzner-stack-rollout-index.md`

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

_Last synced: 2026-04-06 07:34:04 UTC_

