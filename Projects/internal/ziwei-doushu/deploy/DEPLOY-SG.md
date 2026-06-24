# Oracle 部署到 SG — 上線手冊(oracle.aware-wave.com)

> 目標:把 `Projects/internal/ziwei-doushu/` 跑在 SG(5.223.93.113)容器,
> nginx 反代到 **oracle.aware-wave.com**(TLS)。**不碰 aware-wave.com 主站。**
> ⚠️ SG 是共用生產機(WordPress 等),屬 **High-risk** 操作:先備份、上線後健康檢查、
> 失敗即 rollback(見 §6)。

## SG 兩層 nginx 架構（必讀）

SG 有 **兩層 nginx**，容易搞錯：

| 層 | 程序 | Port | 用途 | 設定位置 |
|----|------|------|------|---------|
| Host nginx | `nginx/1.24.0` (Ubuntu 套件) | **443** | SSL termination + CF proxy 流量 | `/etc/nginx/sites-enabled/` |
| Docker nginx | `lobster-nginx` container | **80** | Uptime Kuma 監控 / 低層 health check | `/root/lobster-phase1/nginx/default.conf` |

**CF SSL 模式 = "Full"** → CF 一律連 origin:443 → 必須改 **Host nginx**，不是 Docker nginx。

### SSL 憑證
`/etc/letsencrypt/live/aware-wave.com/fullchain.pem` 是 **wildcard `*.aware-wave.com`**，  
有效期至 2026-08-23。**不需要 certbot**；oracle 子網域直接使用現有憑證。

## 0. 前置(需要的存取權)
- SG SSH 權限(root)。
- Cloudflare 對 `aware-wave.com` 的 DNS 編輯權(加一筆子網域)。
- 此 repo 已含:`Dockerfile`、`docker-compose.yml`、`deploy/nginx/oracle.aware-wave.com.conf`。

## 1. DNS(Cloudflare,加一筆)
- Type **A** ｜ Name **oracle** ｜ Content **5.223.93.113** ｜ Proxy **ON(橘雲)**。
- 等 1–2 分鐘生效:`dig +short oracle.aware-wave.com`。

## 2. 取得程式碼到 SG
```bash
# sparse checkout — 只拉 ziwei-doushu 子目錄(省磁碟)
cd /opt && git clone --depth=1 --filter=blob:none --sparse \
  --branch=<branch-name> \
  "https://<GH_PAT>@github.com/awarewaveai-pei/Work.git" oracle
cd oracle && git sparse-checkout set Projects/internal/ziwei-doushu
ls Projects/internal/ziwei-doushu/   # 確認 Dockerfile 等在
```

**磁碟提醒**：SG 是 75G 機，build 前先清 Docker build cache：
```bash
docker builder prune -f   # 通常可釋出 5–8 GB
```

## 3. 建置 + 啟動容器
```bash
cd /opt/oracle/Projects/internal/ziwei-doushu
docker compose build           # 依 Dockerfile 建 standalone 映像
docker compose up -d           # 啟動；oracle-web 加入 lobster-net
docker compose ps              # 確認 healthy
curl -s http://127.0.0.1:3010/api/health   # 預期 {"ok":true,"service":"ziwei"}
# 確認已加入 lobster-net
docker inspect oracle-web --format "{{json .NetworkSettings.Networks}}"
```

> `docker-compose.yml` 已設定 `networks: lobster-net: external: true`，  
> oracle-web 啟動後自動加入 lobster-net(供 Docker nginx 反代，非 CF 路徑用)。

## 4. Host nginx vhost（SSL）

```bash
# 建立 vhost config(proxy 到 127.0.0.1:3010，用現有 wildcard cert)
sudo tee /etc/nginx/sites-available/oracle.aware-wave.com > /dev/null <<'EOF'
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name oracle.aware-wave.com;

    ssl_certificate     /etc/letsencrypt/live/aware-wave.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aware-wave.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    include /etc/nginx/snippets/security-headers.inc;
    include /etc/nginx/snippets/scanner-block.inc;

    limit_req zone=req_perip burst=50 nodelay;
    limit_req_status 429;
    limit_conn conn_perip 50;

    client_max_body_size 10M;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host               $host;
        proxy_set_header X-Real-IP          $remote_addr;
        proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto  $scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/oracle.aware-wave.com \
            /etc/nginx/sites-enabled/oracle.aware-wave.com
sudo nginx -t && sudo systemctl reload nginx
```

> **不要跑 certbot** — wildcard cert 已涵蓋 `*.aware-wave.com`。

## 5. Smoke check(上線驗證)
```bash
curl -sI https://oracle.aware-wave.com/          # 307 → /zh-TW
curl -s  https://oracle.aware-wave.com/api/health # {"ok":true,"service":"ziwei"}
curl -s  https://oracle.aware-wave.com/zh-TW | grep -o '東西方命理'
```

## 6. Rollback(失敗時)
```bash
# 停容器
cd /opt/oracle/Projects/internal/ziwei-doushu && docker compose down
# 移除 nginx vhost
sudo rm /etc/nginx/sites-enabled/oracle.aware-wave.com
sudo nginx -t && sudo systemctl reload nginx
# DNS 可留著(指向沒服務的埠不影響主站)
```

## 7. 更新(之後每次改版)
```bash
cd /opt/oracle && git pull
cd Projects/internal/ziwei-doushu
docker compose build && docker compose up -d
curl -s http://127.0.0.1:3010/api/health
```

## 備註
- 憑證(OPENAI_API_KEY / 金流 / Supabase / astrology-api.io)到位後:在此目錄建 `.env.production`
  (**勿進 git**),並在 `docker-compose.yml` 取消 `env_file` 註解 → `docker compose up -d` 重啟。
- 遷 EU 機:同一份 compose/nginx/手冊,把主機與 DNS 換成 EU 即可。
- Wildcard cert 續期：Let's Encrypt 自動 renew，cron 在 `/etc/cron.d/certbot`。
  續期後自動 reload nginx，oracle 不受影響。
