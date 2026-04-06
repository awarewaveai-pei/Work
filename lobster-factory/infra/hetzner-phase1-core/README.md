# Hetzner Phase 1 core stack (compose)

**目的**：在 **Supabase 已另機／另 compose 運行** 的前提下，於同一台 Hetzner（或第二台）起 **Nginx + Redis + n8n + WordPress + Node API + Next.js Admin**，形成可驗收的第一階段底座。

**對應治理文件**：`agency-os/docs/operations/hetzner-full-stack-self-host-runbook.md`

## 安全（必讀）

- **不要**把 `.env` 或 **service role / root DB 密碼** 提交到 Git，也不要貼到聊天或 Issue。
- 若曾把 **真實 IP、密碼或金鑰** 貼在公開場合，請 **立刻輪替**（DB、Supabase keys、OpenAI key）。
- 本目錄只提供 **`.env.example` 佔位符**；實機請 `cp .env.example .env` 後填入。

## 安裝順序（與 runbook 對齊）

1. 主機：Docker / Compose、防火牆、（可選）基本 Nginx。
2. **Data**：Supabase + pgvector（此 compose **不重複內嵌** Supabase）。
3. **本 compose**：Redis → n8n / WordPress / API / Admin，對外由 **單一 Nginx :80** 反代。

## 在主機上的目錄（建議）

你可以把本 repo **同步到** `/opt/lobster-factory`（或讀-only clone），再：

```bash
cd /opt/lobster-factory/lobster-factory/infra/hetzner-phase1-core
cp .env.example .env
# 編輯 .env：SUPABASE_*、WORDPRESS_*、N8N_HOST、N8N_WEBHOOK_URL、OPENAI_API_KEY 等
docker compose --env-file .env up -d
```

## 驗收（由簡到繁）

```bash
docker compose ps
curl -sf http://127.0.0.1/health
curl -sf http://127.0.0.1/api/health
```

瀏覽器（把 `YOUR_VPS_IP` 換成實際 IP 或網域）：

- Admin（root）：`http://YOUR_VPS_IP/`
- Node API（經 Nginx）：`http://YOUR_VPS_IP/api/health`
- n8n：`http://YOUR_VPS_IP/n8n/`
- WordPress：`http://YOUR_VPS_IP/wp/`（子路徑安裝見下）

## 已知限制（刻意第一版不收斂）

- **無 HTTPS / Cloudflare** — 下一階段再加。
- **WordPress 掛在 `/wp/`** — 常需在 WP 內設定 **WordPress 位址** / 或改 **子網域** 較省心；若 404／重導迴圈，優先改子網域方案。
- **Trigger.dev** — 不在此 compose；接入時另照官方 self-host 或雲端部署，並對齊 `MCP_TOOL_ROUTING_SPEC.md`。
- **Redis、DB 埠** — 範本為方便除錯可對外映射；上線請改為 **僅 Docker 網路內可連**。
- **Next / Node 用 `npm run dev`** — 僅適合環境打通；production 應改 **build + 正式啟動**（若你選在 VPS 上跑）。

## Related

- `agency-os/docs/operations/hetzner-self-host.env.example`
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
