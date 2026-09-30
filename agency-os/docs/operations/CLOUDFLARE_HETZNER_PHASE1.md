# Cloudflare 接入（Hetzner Phase 1 + 自架 Next.js）

> **RETIRED TOPOLOGY（2026-08-31）— 不可照此檔執行。** 內文的 SG/EU 雙機、舊 IP 與 `aware-wave-app-api-subdomains.conf` 已失效；現役唯一拓樸正本是 [`AWAREWAVE_STACK_QUICKREF.md`](AWAREWAVE_STACK_QUICKREF.md)，外層 TLS vhost 正本是 `lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf`。本檔只保留遷移前歷史。

## AwareWave：兩台 VPS 的 DNS 分工（勿刪 EU 記錄）

| 指向 IP | 用途（對外 hostname 範例） | 備註 |
|--------|---------------------------|------|
| **SG `5.223.93.113`** | **apex WordPress**、`www`、`api`、`app`（phase1：對外網站 + `node-api` + `next-admin`） | 見 `nginx/system-sites/aware-wave-app-api-subdomains.conf` |
| **EU `204.168.175.41`** | **`supabase`**、`studio`、`n8n`、`trigger`、`uptime`**…（平台／自動化／觀測入口） | 見 `SUPABASE_SELF_HOSTED_RUNBOOK.md`、`SERVICE_CREDENTIALS_MAP.md` |

**不要在 Cloudflare 刪除指向 EU 的 A 記錄**——那是現行平台入口；僅 SG 主機可下架 **本地** n8n／staging／舊 observability 容器與 Apache 上已無 DNS 指向的反代。

---

## 架構先講清楚（你問的 Next.js）

- **Next.js Admin（`next-admin`）是自架**：跑在 **Docker** 內，由 **phase1 的 Nginx / Apache vhost** 反代到 **`https://app.aware-wave.com/`**（工具總入口；Build Console 在 `/build`）。apex 根路徑 `/` 仍為 WordPress；見 `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf` 與 `nginx/system-sites/aware-wave-app-api-subdomains.conf`。
- **Cloudflare 不做 Next.js 主機**：它只做 **DNS、代理（CDN/WAF）、TLS 邊緣**；流量仍落到你的 **VPS 上的 Nginx（或系統 Nginx）**。
- **不要**把 Next.js 改成 Vercel 才算「接上 Cloudflare」；你現在這種 **自架 + CF 邊緣** 是正式、可長期用的模式。

**`api`／`app` 子網域的長期用途、路由版本、Auth 與 BFF 邊界**（與本檔 DNS 表互補、**git 唯一長篇正文**）：[`../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)；統管入口（連結匯總）：[`../edge-and-domains/EDGE_DOMAINS_INDEX.md`](../edge-and-domains/EDGE_DOMAINS_INDEX.md)。

---

## DNS 雙機對照（SG phase1 vs EU 平台）— 勿誤刪

AwareWave 目前有 **兩台公網 VPS**：**新加坡 phase1**（WordPress／`node-api`／`next-admin` 對外入口）與 **赫爾辛基 EU**（自架 Supabase、自架 n8n、Trigger.dev、Uptime Kuma 等）。**Cloudflare 上出現兩個不同 A 記錄目標 IP 是刻意的**，不是重複或垃圾記錄。

| 子網域（例） | A 記錄應指向 | 說明 |
|--------------|--------------|------|
| `@`（apex）、**api**、**app** | **`5.223.93.113`（SG）** | 官網 WordPress、[`api.aware-wave.com`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)（node-api）、[`app.aware-wave.com`](./CLOUDFLARE_HETZNER_PHASE1.md)（Next 工具入口，含 `/build`） |
| **www** | **CNAME → apex**（或與 apex 同 IP） | 與橘雲／SEO 策略一致即可 |
| **supabase**、**studio**、**n8n**、**trigger**、**uptime** | **`204.168.175.41`（EU）** | 平台層：Kong／Studio、自動化、編排、監控（見 [`SUPABASE_SELF_HOSTED_RUNBOOK.md`](SUPABASE_SELF_HOSTED_RUNBOOK.md)、[`mcp/SERVICE_CREDENTIALS_MAP.md`](../../../mcp/SERVICE_CREDENTIALS_MAP.md)） |

**禁止**：只因「SG 上只剩 WordPress／api／app」就把 **指向 EU 的上述 A 記錄刪掉** — 會造成 Supabase／n8n MCP／Trigger／監控告警全面失效；SG「業務入口精簡」與 **EU 平台 DNS** 是分工，不是二選一。

**可清理**：同一主機名 **重複的舊 A**（例如曾誤指 SG 的 `studio`／`supabase`）、已廢棄主機名、或 **PTR／測試用** 記錄；刪除前用 `dig +short <name>` 與本表交叉確認。

---

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
| **app** | `A` `app` → 同上 | `127.0.0.1:3002`（`next-admin`） | 正式工具入口：`https://app.aware-wave.com/`；Build Console：`https://app.aware-wave.com/build`。舊 `/admin` 書籤可 redirect 到 `/`，但不再作為主要入口。 |

**TLS**：對上述兩名建議 **`certbot`** 一次簽 **SAN**（例：`certbot certonly --nginx -d api.aware-wave.com -d app.aware-wave.com`），再把範本內 **`ssl_certificate`** 路徑改成 `certbot` 實際產生的 `live/` 目錄（常見為第一個 `-d` 主機名資料夾）。**Cloudflare** 仍建議 **Full (strict)**。

**驗收**：`curl -sSI https://api.aware-wave.com/health` 為 **200**；`curl -sSI https://app.aware-wave.com/` 或 `/build` 若未帶內部工具憑證，可能回 **401**（例如 Basic realm `Aware Wave Admin`），這是可接受的保護層。帶憑證或瀏覽器登入後，`https://app.aware-wave.com/build` 應開啟 `next-admin` Build Console。
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

- 瀏覽器：`https://<你的網域>/`（WordPress）、`https://app.<網域>/`（Next 工具入口）、`https://app.<網域>/build`（Build Console，需通過工具保護層）、`/api/health`、`/n8n/` 行為與開 CF 前一致。
- 若有 **`api.*` / `app.*`**：`https://api.<網域>/health` 正常；`https://app.<網域>/` 直接服務受保護的 `next-admin`，不是 302 到 apex `/admin/`。
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
