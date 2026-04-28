# Cloudflare 接入（Hetzner Phase 1 + 自架 Next.js）

## 架構先講清楚（你問的 Next.js）

- **Next.js Admin（`next-admin`）是自架**：跑在 **Docker** 內，由 **phase1 的 Nginx** 反代到 **`/admin/`**（根路徑 `/` 為 WordPress；見 `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`）。
- **Cloudflare 不做 Next.js 主機**：它只做 **DNS、代理（CDN/WAF）、TLS 邊緣**；流量仍落到你的 **VPS 上的 Nginx（或系統 Nginx）**。
- **不要**把 Next.js 改成 Vercel 才算「接上 Cloudflare」；你現在這種 **自架 + CF 邊緣** 是正式、可長期用的模式。

**`api`／`app` 子網域的長期用途、路由版本、Auth 與 BFF 邊界**（與本檔 DNS 表互補、**git 唯一長篇正文**）：[`../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)；統管入口（連結匯總）：[`../edge-and-domains/EDGE_DOMAINS_INDEX.md`](../edge-and-domains/EDGE_DOMAINS_INDEX.md)。

若你目前是 **系統 Nginx** 佔用 `:80/:443`、Docker `lobster-nginx` 僅內網或停用，請把下面「DNS / SSL」套在 **對外那一層 Nginx** 上；repo 內 Docker Nginx 的 snippet 則在 **Docker 那層真的對外** 時才掛載。與 `default.conf` 同構的 **系統站台範本**（apex `aware-wave.com`）：`lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/aware-wave-phase1.conf`。

## 建議接入順序（staging 先、再 prod）

1. **在 Cloudflare 建立 Zone**（例如 `aware-wave.com`），把 DNS 託管切到 Cloudflare（依 CF 精靈改 nameserver）。
2. **DNS 記錄**（依你實際子網域調整）：
   - **A / AAAA**：`@`、或 `app` / `admin` 等 → **Hetzner VPS 公網 IP**（Proxy 狀態先 **僅對要保護的主機名** 開橘雲）。
   - **Trigger / n8n** 等子網域：同樣 **A → 同一台 IP**（或 CNAME 到同一台），與你現有 `trigger.conf` / 系統 Nginx `server_name` 一致。

### 子網域 **`api.aware-wave.com`** / **`app.aware-wave.com`**（與 apex 同機）

典型用途（與 repo 範本一致，見 `lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/aware-wave-app-api-subdomains.conf`）：

| 主機名 | Cloudflare DNS | 源站（本 repo 預設） | 說明 |
|--------|------------------|----------------------|------|
| **api** | `A` `api` → VPS IP（橘雲與否依你 WAF 策略） | `127.0.0.1:3001`（`node-api`） | 瀏覽器／客戶端可打 **`https://api.aware-wave.com/health`** 等，路徑與容器根一致（不必再加 `/api` 前綴）。 |
| **app** | `A` `app` → 同上 | **302** → **`https://aware-wave.com/admin/`** | 與目前 **Next `basePath=/admin`、公開網址以 apex 為準** 對齊；**`app.*` 僅作短網址／書籤入口**，避免換 `Host` 導致 `_next` 靜態資源與 cookie 錯位。若未來要「`app` 直出 Next」需另備建置與 `NEXT_PUBLIC_*`。 |

**TLS**：對上述兩名建議 **`certbot`** 一次簽 **SAN**（例：`certbot certonly --nginx -d api.aware-wave.com -d app.aware-wave.com`），再把範本內 **`ssl_certificate`** 路徑改成 `certbot` 實際產生的 `live/` 目錄（常見為第一個 `-d` 主機名資料夾）。**Cloudflare** 仍建議 **Full (strict)**。

**驗收**：`curl -sSI https://api.aware-wave.com/health` 為 **200**；`curl -sSI https://app.aware-wave.com/` 為 **302** 且 **`Location: https://aware-wave.com/admin/`**。
3. **SSL/TLS 模式**（關鍵）：
   - **首選**：**Full (strict)** — 你的 **源站** 必須有 **有效憑證**（Let’s Encrypt 等），Cloudflare 到源站也用 HTTPS。
   - **可接受過渡**：**Full** — 源站自簽仍可行，但不如 strict 乾淨。
   - **避免長期用 Flexible**：源站只看到 HTTP，`X-Forwarded-Proto` 容易錯，**WordPress / Next 的 URL 與 cookie** 容易出問題。
4. **Always Use HTTPS**、**Automatic HTTPS Rewrites**：建議在 Zone 開啟。
5. **WAF / Bot**：先 **保守規則**，確認 `n8n` Webhook、Trigger、健康檢查不被擋，再逐步加嚴。

## 源站 Nginx（Docker 版）還原真實客戶端 IP

repo 已提供：

- `lobster-factory/infra/hetzner-phase1-core/nginx/cloudflare-real-ip.conf`

`docker-compose.yml` 已掛載為 `/etc/nginx/conf.d/00-cloudflare-real-ip.conf`，讓 `$remote_addr` 等日誌反映 **真實訪客 IP**（透過 `CF-Connecting-IP`）。

若你只用 **系統 Nginx** 對外，請把同檔內容 **合併進** 系統站台的 `http {}`（或依 distro 的 `conf.d`），並保留 `real_ip_header CF-Connecting-IP;`。

## 與現有 `default.conf` 的相容性

- 已保留 `proxy_set_header X-Forwarded-Proto $scheme;`。
- 在 **SSL = Full / Full (strict)** 時，Cloudflare 連源站若為 **HTTPS**，`$scheme` 為 `https`，與 **WordPress `WORDPRESS_PUBLIC_URL`**、Next 行為一致。
- 若暫時必須 **Flexible**，需在源站額外信任 `X-Forwarded-Proto`（建議仍改 **Full** 收斂）。

## 驗收清單（最小）

- 瀏覽器：`https://<你的網域>/`（WordPress）、`/admin/`（Next）、`/api/health`、`/n8n/` 行為與開 CF 前一致。
- 若有 **`api.*` / `app.*`**：`https://api.<網域>/health` 正常；`https://app.<網域>/` **302** 至 apex **`/admin/`**（與範本一致時）。
- `curl -I https://<網域>/` 回應標頭正常（HTTP/2 或 3 皆可）。
- n8n：已知 Webhook URL 仍為公開 HTTPS；抽樣觸發一條測試 workflow **200**。
- Trigger：儀表板與 WS 仍正常（若遇 WS，確認 Cloudflare **WebSockets** 已開、且源站超時足夠）。

## 相關檔案

- Phase1 Nginx 主設定：`lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`
- Apex 系統站台（WP + `/admin` + `/api`）：`lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/aware-wave-phase1.conf`
- **`api` / `app` 子網域範本**：`lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/aware-wave-app-api-subdomains.conf`
- Trigger 子網域：`lobster-factory/infra/hetzner-phase1-core/nginx/trigger.conf`
- Compose：`lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`

## Related Documents (Auto-Synced)

- `docs/operations/hetzner-full-stack-self-host-runbook.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
