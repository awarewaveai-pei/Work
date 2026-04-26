# Closeout inbox（可版控）

**用途**：協作 AI 只寫入本檔 **`---` 以下**之 **`###` 區塊**；**`AO-CLOSE`** 執行 **`ao-close.ps1`** 時會由 **`merge-closeout-inbox-into-progress.ps1`** **verbatim** 併入當日 **`WORKLOG.md`**／**`memory/daily`** 並自本範本**重置**本檔（無須手動清空）。  
**實際路徑**（勿改檔名）：`agency-os/.agency-state/closeout-inbox.md`  
**說明**：本檔為範本；實際 `closeout-inbox.md` **已納入版控**，換機 `git pull` 即同步（收關後清空仍可避免殘稿堆疊）。

## 使用方式

1. 在 monorepo 根執行 `.\scripts\init-closeout-inbox.ps1` 可從本範本建立 `closeout-inbox.md`（若尚不存在）。  
2. **每一則可匯入區塊**使用一個 `###` 標題列。  
3. **插入位置（重要）**：在 **併入區**（檔案中**最後一條**單獨一行的 `---` 之後；範本只放一條，請勿再加第二條以免誤切）內，**把新區塊插在整段內容的最上方**（緊接該 `---` 的下一行開始寫），使 **日期／時間最新的一則永遠在最上面**；較舊的區塊留在下面。  
   - **不要**改寫已存在、較舊區塊的內文（除非修正錯字或補 hash）。  
   - 舊版「一律貼在檔案最末尾」已廢止。  
4. 收關者勿長期保留已合併內容；push 後收件匣會由腳本重置。

### 區塊範本（複製後改內容；新區塊請依上節置頂插入）

```markdown
### <AGENT_ID> <yyyy-MM-dd HH:mm>

- **完成（一句）**:
- **變更路徑**:
  - ``
- **Git**:
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
```

---

### claude-sonnet-4-6 2026-04-27 01:00

- **完成（一句）**: Uptime Kuma 擴充至 20 個監控、修復 4 個失效項、trigger-webapp OOM 修復、EU 伺服器重開機、兩台 Netdata Slack 告警上線、憑證總覽文件建立。
- **變更路徑**:
  - 遠端 EU `/var/lib/docker/volumes/uptime-kuma/_data/kuma.db` — 新增 14 個監控（app, API, Uptime自身, SG/EU Ping, Cloudflare/PostHog/Resend/Sentry status, Netdata x2, Supabase Storage/REST, Redis）；修正 4 個失效監控（Ping→HTTP, Redis TCP→API health, Supabase REST 加 apikey header）
  - 遠端 EU `/root/trigger/docker-compose.yml` — trigger-webapp mem_limit 1280m→1792m；trigger-clickhouse cpus 1.5→2.0
  - 遠端 EU `/etc/netdata/health_alarm_notify.conf` — 啟用 Slack 通知（#alerts-infra）
  - 遠端 SG `/etc/netdata/health_alarm_notify.conf` — 啟用 Slack 通知（#alerts-infra）
  - 本機 `C:\Users\user1115\.ssh\hetzner_trigger` — 修正 CRLF 換行符（`sed -i 's/\r//'`）並 chmod 600
  - 本機桌面 `AWARE_WAVE_CREDENTIALS.md` — 所有服務帳號密碼 SSH API 總覽（未納版控）
- **Git**: `1e70800`（Cursor docs）為本段唯一本機 commit；伺服器端變更均為 SSH 直改，未納版控
- **對應 TASKS 子字串（可選）**: Uptime Kuma 監控擴充、Netdata 通知、trigger-webapp OOM
- **風險／待辦（可選）**:
  - Slack `#infra-alerts` 舊訊息批次刪除尚未完成（User Token scope 問題，需 reinstall app 取得 channels:read 等 scope 再重試）
  - Netdata Centralized Cloud Notifications 尚未設定（目前為 Agent Dispatched）
  - Netdata SG port 19999 外部不可達（防火牆），Uptime Kuma 改以 /health 替代監控
  - Redis TCP 外部不可達（127.0.0.1 綁定），改以 api /health 替代
  - 憑證文件建議轉存 1Password/Bitwarden 後刪除桌面明文檔

### claude-sonnet-4-6 2026-04-26 23:30

- **完成（一句）**: SG 伺服器 Redis maxmemory、Promtail 標籤、Nginx 域名分拆（WordPress vs Next Admin）、Cloudflare WAF wp-login managed_challenge、WordPress 2FA（TOTP）、Redis Object Cache 連線、PostHog/Sentry/Slack env 串接完成。
- **變更路徑**:
  - `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml` — Redis maxmemory 256mb/allkeys-lru（commit `2158085`）
  - `lobster-factory/infra/hetzner-phase1-core/observability/promtail-config.yml` — 加 env: production 標籤（commit `2158085`）
  - `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf` — 拆分為兩個 server block：aware-wave.com→WordPress, app.aware-wave.com→next-admin（commit `dbb4262`）
  - `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml` — next-admin/n8n healthcheck 修正、Sentry DSN fallback（commit `90c4067`）
  - `lobster-factory/apps/next-admin/` — PostHog analytics 整合、Slack/Resend env 串接（commit `87a5ab9`）
  - 遠端 SG WordPress 容器 `/var/www/html/wp-config.php` — 加 WP_REDIS_HOST=redis、WP_REDIS_PORT=6379、WP_CACHE=true
  - Cloudflare WAF ruleset `f290fd58` — wp-login rule 改為 managed_challenge（原 block），移除誤加的 /wp-admin
  - 遠端 EU Netdata Cloud — SG/EU 兩節點均已 claim 並加入 Space
- **Git**: `87a5ab9`, `90c4067`, `2158085`, `dbb4262`（均 push origin main）；WP config 與 Cloudflare WAF 為直改未納版控
- **對應 TASKS 子字串（可選）**: Redis cache、Nginx routing、Cloudflare WAF、WordPress 2FA、PostHog
- **風險／待辦（可選）**:
  - WordPress 2FA 已對所有使用者強制啟用（TOTP via Authy + backup codes）；新增使用者需完成 2FA wizard 才能正常登入
  - Redis Object Cache 已連線（redis:6379），需在 WP 後台確認「Connected」狀態
  - n8n service block 仍在 SG docker-compose.yml（container 已停），可擇日清除

### claude-sonnet-4-6 2026-04-25 13:10

- **完成（一句）**: SG/EU 架構分拆完整完成：EU Helsinki CPX32 承接 Supabase、n8n、Trigger.dev、Uptime Kuma，SG 降規至 CPX22，5 個 subdomain SSL 上線，所有服務健康。
- **變更路徑**:
  - `agency-os/.agency-state/closeout-inbox.md` （本檔）
  - 遠端 SG `/root/lobster-phase1/docker-compose.yml` — 移除 n8n depends_on、trigger.conf volume、修正 next-admin healthcheck、Nginx 加 resolver
  - 遠端 SG `/root/lobster-phase1/nginx/default.conf` — 加 Docker DNS resolver、移除 /n8n/ route
  - 遠端 SG `/root/lobster-phase1/.env` — SUPABASE_URL/keys 改指向 EU
  - 遠端 EU `/root/supabase/docker/.env` — 新 EU Supabase 配置
  - 遠端 EU `/root/trigger/.env` — Trigger.dev EU 配置
  - 遠端 EU `/etc/nginx/sites-available/*` — 5 個 HTTPS reverse proxy configs
  - 遠端 EU `/etc/letsencrypt/` — Let's Encrypt certs (5 domains, 2026-07-24)
- **Git**: 本 commit 為 closeout inbox；伺服器端 infra 變更直接 apply，未納版控（生產伺服器 SSH 直改慣例）
- **對應 TASKS 子字串（可選）**: EU 伺服器遷移、SG 降規、Supabase 遷移、n8n 遷移、Trigger.dev 遷移
- **風險／待辦（可選）**:
  - Uptime Kuma EU：Supabase API（ID 5）和 Studio（ID 6）監控需在 UI 手動加 accepted status 401
  - Netdata EU 尚未加入 Netdata Cloud Space（需 claim token）
  - SSH tunnel script `open-supabase-ssh-tunnel.ps1` 仍指向 SG，需改為 EU server 204.168.175.41
  - SG 系統 nginx 已 stop/disable（Docker nginx 接管 port 80），重開機後應正常（Docker nginx restart:unless-stopped）
  - n8n 在 SG docker-compose.yml 仍定義（service block 存在，但 container 已停），可擇日清除該 service block


### example-agent <yyyy-MM-dd 09:00>

- **完成（一句）**: 已依範本建立收件匣流程
- **變更路徑**:
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
- **Git**: （填 hash 或「未 commit」）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
