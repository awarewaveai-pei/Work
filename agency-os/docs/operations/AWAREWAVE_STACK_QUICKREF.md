# AwareWave Stack 快速查詢表

> ## 🚨 2026-08-31 現役主機：全部服務在 ks-aw-01（`145.239.195.47`）
> 操作者指示提前整併（原排 11/20）。**現在所有服務都在一台機器上**：
> - **SSH**：`ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47`（sudo；root 僅緊急）
> - **13 筆 aware-wave.com DNS + soulfulexpression.org 全部指向 ks-aw-01**
> - 架構：host nginx 統一終結 TLS（sites-enabled 每域一檔）→ 各服務綁 127.0.0.1 端口。
>   下表的容器名/內部端口**原樣保留**，僅兩處改動：uptime-kuma 改 bridge 網路綁
>   `127.0.0.1:3005`（原 host 網路 3001，讓位給 node-api）；lobster-nginx 綁
>   `127.0.0.1:8083`（host nginx 反代給它，rate limit 靠 default.conf 補了
>   `set_real_ip_from 127.0.0.1` 維持按真實客戶端計數）
> - aware-wave.com LE 憑證已在 ks 重簽（SG 上的那張 8/23 已過期無人察覺——CF Flexible 走 80 所以沒炸）
> - 排程全數移植：endpoint-alert timer、eu-backup cron（`/etc/cron.d/ks-stack-backup`）、
>   mainwp wp-cron、supabase weekly restart、auto-deploy、watchdog、certbot renew
> - **🔴 前任 `149.202.64.114` 已於 2026-08-31 在 OVH Manager 終止；更早 SG/EU 也已刪除。無回滾主機。**
> - **⚠️ 退租 IP 會被供應商重新分配**：2026-09-23 實測 `204.168.175.41:22` 已由第三方 SSH 回應 → 任何設定／腳本都不可再指向或信任三個退租 IP（WORKLOG 2026-09-23 續106）
> - 下方 SG/EU 兩節保留當容器/端口明細參考（內容在 ks 上依然成立），機器歸屬已失效

> 所有伺服器、容器、路徑、端口的事實參考。
> 從 AGENTS.md 移出，避免讓 system prompt 過重。
> 規則（禁止事項、SOP）仍在 AGENTS.md。
> Last updated: 2026-08-26（SSH 實查 `docker ps` + nginx `server_name` 全量比對，非文件推測）
>
> **📍 本檔 = 機器拓樸唯一正本（topology SSOT）。** 「誰跑在哪台、什麼容器、什麼 port」以此為準。
> 各 stack 的**部署/設定細節**另有正本（改容器時這幾處要一起改）：
> - Trigger.dev（EU）→ [`lobster-factory/infra/trigger/README.md`](../../../lobster-factory/infra/trigger/README.md)
> - Supabase（EU）→ [`SUPABASE_SELF_HOSTED_RUNBOOK.md`](SUPABASE_SELF_HOSTED_RUNBOOK.md)
> - Phase 1 core（SG）→ [`lobster-factory/infra/hetzner-phase1-core/README.md`](../../../lobster-factory/infra/hetzner-phase1-core/README.md)
> - SG 雙目錄陷阱 → [`SG_PHASE1_DOCKER_LAYOUT.md`](SG_PHASE1_DOCKER_LAYOUT.md)｜DNS → [`CLOUDFLARE_HETZNER_PHASE1.md`](CLOUDFLARE_HETZNER_PHASE1.md)｜部署 → [`DEPLOY_ROLLBACK_RUNBOOK.md`](DEPLOY_ROLLBACK_RUNBOOK.md)
>
> **🚚 要「搬機 / 上 dedicated / EU→大機、SG→EU」？唯一遷移正本** → [`runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](../../../runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md)（含備份/RAID/還原/遷移 §0–§7）。

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
| `oracle-web` | Next.js（紫微斗數命理 app「Oracle」，`Projects/internal/ziwei-doushu/`）| oracle.aware-wave.com → 127.0.0.1:3010 |
| `lobster-loki` | Loki 2.9.4（日誌儲存）| 內部 127.0.0.1:3100 |
| `lobster-grafana-obs` | Grafana 10.4.3 | 內部 127.0.0.1:3009（SSH tunnel 存取，不對外）|
| `lobster-promtail` | Promtail 2.9.4（日誌收集）| 內部，無對外 port |

> **10 個容器，2026-08-26 `docker ps -a` 實查**（此前表格只列 6 個，漏了 oracle-web + 觀測堆疊三容器）。

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

> **29 個容器分 7 個服務群，2026-08-26 `docker ps -a` + nginx `server_name` + Cloudflare DNS 三方交叉核對**。此前表格只列 3 個服務（Trigger.dev/Supabase/n8n），**Postiz、MainWP、Uptime Kuma、Remotion、Video 五個服務完全沒被記錄**——其中 Remotion/Video 還是有對外網域的真實服務，不是內部輔助容器（見 `agency-os/TASKS.md` EU⑥b）。

| 服務群 | 對外網域 | compose SSOT | VPS 路徑 | 容器 |
|-----|-----|-------------|---------|------|
| Supabase | studio.aware-wave.com / supabase.aware-wave.com | `lobster-factory/infra/supabase/docker-compose.yml` | `/root/supabase/` | supabase-db / -pooler / -studio / -kong / -storage / -edge-functions / -meta / -auth / -rest / -imgproxy / `realtime-dev.supabase-realtime`（11）|
| Trigger.dev | trigger.aware-wave.com | `lobster-factory/infra/trigger/docker-compose.yml` | `/root/trigger/` | trigger-webapp / -clickhouse / -supervisor / -docker-proxy / -electric / -postgres / -redis / -minio / -registry / `buildx_buildkit_trigger0`（10）|
| n8n | n8n.aware-wave.com | `lobster-factory/infra/n8n/docker-compose.yml` | `/root/n8n/` | n8n（1）|
| Postiz | postiz.aware-wave.com | — | `/root/postiz/` | postiz / postiz-redis（2）|
| MainWP | mainwp.aware-wave.com | — | `/root/mainwp/docker-compose.yml` | mainwp-web / mainwp-db（2）|
| Uptime Kuma | uptime.aware-wave.com | — | — | uptime-kuma（1）|
| Remotion/Video | remotion-svc.aware-wave.com / video-svc.aware-wave.com | — | — | lobster-remotion-service / lobster-video-service（2）|

- n8n 網路: `supabase_default`；DB: `supabase-db:5432` database `n8n`
- ClickHouse: `CLICKHOUSE_IMAGE_TAG=25.7.5-debian-12-r0`（**禁升 latest / 降回 24.x**）
- docker logs 特殊容器名: `realtime-dev.supabase-realtime`（含點號）
- EU Uptime Kuma: 負責 public reachability + SSL；canary URL: `https://uptime.aware-wave.com/api/entry-page`

---

## SSH

- Key: `~/.ssh/hetzner_trigger`（SG + EU 兩台共用，password login DISABLED）

---

## Cloudflare Zones（帳號下全部 5 個，2026-08-26 API 實查）

| Zone | 狀態 | 說明 |
|---|---|---|
| aware-wave.com | 使用中 | 13 筆 A/CNAME，全部指向 SG（4）或 EU（9），見上兩節 |
| soulfulexpression.org | 使用中 | 指向 Hostinger `191.101.230.176`，待搬遷（見 TASKS.md A 區）|
| hope-flow.org | **零 DNS 記錄** | 保留網域，未建站，不需搬遷 |
| weartheworld.org | **零 DNS 記錄** | 保留網域，未建站，不需搬遷 |
| wusheng.foundation | **零 DNS 記錄** | 保留網域（品牌防禦，見 memory `project_content_engine_ssot` WuSheng Healing Module™），未建站，不需搬遷 |

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

- Secrets: `scripts/secrets-vault.ps1 -Action get -Name <KEY_NAME>`（輸出 `NAME=遮罩值`，僅供確認存在；實值消費走 `mcp/user-env.ps1` / env）；key names 在 `mcp/user-env.ps1`
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
