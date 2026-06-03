# AwareWave Stack 快速查詢表

> 所有伺服器、容器、路徑、端口的事實參考。
> 從 AGENTS.md 移出，避免讓 system prompt 過重。
> 規則（禁止事項、SOP）仍在 AGENTS.md。
> Last updated: 2026-06-03

---

## SG VPS `5.223.93.113` — Phase 1 Core

工作目錄：`/root/lobster-phase1/`

| 容器名稱 | 服務 | 對外端點 |
|---------|------|---------|
| `lobster-nginx` | Reverse proxy (nginx:stable) | Port 80/443 |
| `lobster-wordpress` | WordPress (MariaDB 11 DB) | aware-wave.com → proxy_pass wordpress:80 |
| `lobster-wordpress-db` | MariaDB 11 | 內部 |
| `lobster-node-api` | Node.js API (Express, port 3001) | api.aware-wave.com/api/ → node-api:3001 |
| `lobster-next-admin` | Next.js 15 Admin (port 3000 內部 / 3002 host) | app.aware-wave.com → next-admin:3000 |
| `lobster-redis` | Redis 7 (127.0.0.1:6379) | 內部 |

**nginx**
- rate limits: public 30r/s / admin 20r/s / webhook 10r/s / wplogin 5r/m
- config 正本: `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`

**WordPress**
- web root: `/var/www/html`（named volume `wordpress_data`，非 bind mount）
- 進容器: `docker exec -it lobster-wordpress bash`

**next-admin**
- 套件: `@supabase/supabase-js ^2.49.8`（非 auth-helpers）
- 樣式: CSS 變數（無 Tailwind）

**監控**（SG 本機）
- `endpoint-alert.sh` 打本機端口：WordPress `127.0.0.1:8080/`、Next Admin `127.0.0.1:3002/api/ops/summary`、Node API `127.0.0.1:3001/health`
- 避免 `SG → Cloudflare → SG` hairpin timeout
- nginx drop-in: `/etc/default/awarewave-endpoint-alert.local`（SG 本地，sync 不覆蓋）

---

## EU VPS `204.168.175.41` — Services

| 服務 | compose SSOT | VPS 路徑 |
|-----|-------------|---------|
| Trigger.dev | `lobster-factory/infra/trigger/docker-compose.yml` | `/root/trigger/` |
| Supabase | `lobster-factory/infra/supabase/docker-compose.yml` | `/root/supabase/` |
| n8n | `lobster-factory/infra/n8n/docker-compose.yml` | `/root/n8n/` |

- n8n 網路: `supabase_default`；DB: `supabase-db:5432` database `n8n`
- ClickHouse: `CLICKHOUSE_IMAGE_TAG=25.7.5-debian-12-r0`（**禁升 latest / 降回 24.x**）
- docker logs 特殊容器名: `realtime-dev.supabase-realtime`（含點號）
- EU Uptime Kuma: 負責 public reachability + SSL；canary URL: `https://uptime.aware-wave.com/api/entry-page`

---

## SSH

- Key: `~/.ssh/hetzner_trigger`（SG + EU 兩台共用，password login DISABLED）

---

## Client Tenants

| Slug | 網站 | SSH |
|------|------|-----|
| `soulful` | soulfulexpression.org | 191.101.230.176:65002 / u942075013 |
| `mongolia` | scenery-travel-mongolia | — |
| `p1-pilot` | p1-pilot | — |

- WP 路徑（soulful）: `/home/u942075013/domains/soulfulexpression.org/public_html`
- 所有客戶 tenant 設定: `agency-os/tenants/<slug>/core/`
- Staging URL SSOT: `agency-os/tenants/<slug>/core/ENVIRONMENT_REGISTRY.md`

---

## Secrets / Email / Bot

- Secrets: `scripts/secrets-vault.ps1 -Action get -Key <KEY_NAME>`；key names 在 `mcp/user-env.ps1`
- Email: Resend `noreply@aware-wave.com`
- Telegram bot: 告警 + command plane（token 在 vault）

---

## Cursor Rules

- 正本: `agency-os/.cursor/rules/`
- repo 根 `.cursor/rules/` 是 mirror，**不改正本**

---

## 相關文件

- `docs/operations/SG_PHASE1_DOCKER_LAYOUT.md` — 雙目錄架構說明
- `docs/operations/CLOUDFLARE_HETZNER_PHASE1.md` — DNS 邊界
- `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` — 回滾步驟
- `runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` — 緊急處理
