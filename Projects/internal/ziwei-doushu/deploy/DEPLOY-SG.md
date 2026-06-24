# Oracle 部署到 SG — 上線手冊(oracle.aware-wave.com)

> 目標:把 `Projects/internal/ziwei-doushu/` 跑在 SG(5.223.93.113)容器,
> nginx 反代到 **oracle.aware-wave.com**(TLS)。**不碰 aware-wave.com 主站。**
> ⚠️ SG 是共用生產機(WordPress 等),屬 **High-risk** 操作:先備份、上線後健康檢查、
> 失敗即 rollback(見 §5)。

## 0. 前置(需要的存取權)
- SG SSH 權限(root 或 docker/nginx 權限)。
- Cloudflare 對 `aware-wave.com` 的 DNS 編輯權(加一筆子網域)。
- 此 repo 已含:`Dockerfile`、`docker-compose.yml`、`deploy/nginx/oracle.aware-wave.com.conf`。

## 1. DNS(Cloudflare,加一筆)
- Type **A** ｜ Name **oracle** ｜ Content **5.223.93.113** ｜ Proxy **ON(橘雲)**。
- 等 1–2 分鐘生效:`dig +short oracle.aware-wave.com`。

## 2. 取得程式碼到 SG
```bash
# SG 上,選一個部署目錄(勿放主站目錄)
cd /opt && git clone <repo-url> oracle && cd oracle/Projects/internal/ziwei-doushu
# 或已 clone → git pull
```

## 3. 建置 + 啟動容器
```bash
cd /opt/oracle/Projects/internal/ziwei-doushu
docker compose build           # 依 Dockerfile 建 standalone 映像
docker compose up -d           # 啟動,綁 127.0.0.1:3010
docker compose ps              # 確認 healthy
curl -s http://127.0.0.1:3010/api/health   # 預期 {"ok":true,"service":"ziwei"}
```

## 4. nginx vhost + TLS
```bash
sudo cp deploy/nginx/oracle.aware-wave.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/oracle.aware-wave.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d oracle.aware-wave.com   # 簽發 TLS + 自動補 443/轉址
```

## 5. Smoke check(上線驗證)
```bash
curl -sI https://oracle.aware-wave.com/                 # 200 或 307→/zh-TW
curl -s https://oracle.aware-wave.com/zh-TW | grep -o '東西方命理'
curl -s https://oracle.aware-wave.com/api/health        # {"ok":true,...}
```

## 6. Rollback(失敗時)
```bash
docker compose down            # 停容器
sudo rm /etc/nginx/sites-enabled/oracle.aware-wave.com.conf
sudo nginx -t && sudo systemctl reload nginx   # 還原 nginx
# DNS 可留著(指向沒服務的埠不影響主站)
```

## 7. 更新(之後每次改版)
```bash
cd /opt/oracle && git pull
cd Projects/internal/ziwei-doushu
docker compose build && docker compose up -d   # 滾動更新
curl -s http://127.0.0.1:3010/api/health
```

## 備註
- 憑證(OPENAI_API_KEY / 金流 / Supabase / astrology-api.io)到位後:在此目錄建 `.env.production`
  (**勿進 git**),並在 `docker-compose.yml` 取消 `env_file` 註解 → `docker compose up -d` 重啟。
- 遷 EU 機:同一份 compose/nginx/手冊,把主機與 DNS 換成 EU 即可。
- 與既有 `sg-deploy.sh` 整合(test gate→healthcheck→smoke→rollback→通知)為後續優化;
  本手冊為首次手動上線的最小安全路徑。
