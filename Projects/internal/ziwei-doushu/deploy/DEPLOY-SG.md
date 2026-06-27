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

## 7. 更新(之後每次改版)— 2026-06-26 實測流程
> ⚠️ `/opt/oracle` 是 **partial clone(blob:none)**,且現已切到 **main** 分支(原為
> `claude/ziwei-doushu-chart-site-55fdaa`,已 consolidate 上 main)。`git pull` 在此會
> 因無 `origin/main` 本地 ref 而失敗 → 用 fetch + reset。
```bash
cd /opt/oracle
docker tag oracle-web:latest oracle-web:rollback   # 先留回滾鏡像
git fetch origin main && git reset --hard FETCH_HEAD   # 取最新 main(非 git pull)
git log -1 --oneline                                   # 確認 HEAD = 預期 commit
cd Projects/internal/ziwei-doushu
docker compose build && docker compose up -d           # 滾動更新(override + .env.production 自動帶入)
docker inspect -f '{{.State.Health.Status}}' oracle-web # 等 healthy
curl -s http://127.0.0.1:3010/api/health               # {"ok":true,"service":"ziwei"}
docker image prune -f                                   # 清 dangling(勿動 :rollback)
```
**回滾**:`docker tag oracle-web:rollback oracle-web:latest && docker compose up -d`(或 `git reset --hard <舊commit>` 後重 build)。

## 備註
- **憑證注入(2026-06-26 實際做法)**:secrets 走兩個 **untracked** 檔(勿進 git):
  - `.env.production`(`chmod 600`):`OPENAI_API_KEY=...` + `OPENAI_MODEL_DEEP=gpt-4o-2024-11-20`
    (⚠️ deep/premium 必須釘 16384-輸出快照如 `-2024-11-20`,裸 `gpt-4o` 輸出上限 4096 → max_completion_tokens 5000/12000 會 400)。
  - `docker-compose.override.yml`:`services.oracle-web.env_file: [.env.production]`(避免改 tracked compose)。
  - 寫 key 勿留命令列字面量:本機 `... | ssh root@SG 'umask 077; cat > .../.env.production'`(從 vault 管線進 stdin)。
- **付費牆**:`/api/interpret` premium → 402(免費需訂閱);light/deep 放行;每日計量待 Supabase store。
- 磁碟:每次 build 約 +2G;SG 已 86%,定期 `docker image prune -f`;留意空間。
- 遷 EU 機:同一份 compose/nginx/手冊,把主機與 DNS 換成 EU 即可。
- 與既有 `sg-deploy.sh` 整合(test gate→healthcheck→smoke→rollback→通知)為後續優化;
  本手冊為手動上線的最小安全路徑。
