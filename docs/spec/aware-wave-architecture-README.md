# aware-wave.com 架構遷移任務

## 任務說明

原本所有服務集中在新加坡單一伺服器（Hetzner CX32，8GB RAM）。
現在拆分為雙伺服器架構，請依照以下步驟完整執行。

---

## 執行前：請先確認以下資訊

執行任何步驟前，請先向使用者確認這些值：

```
SG_IP         = 新加坡 Hetzner CX22（4GB）IP
EU_IP         = 芬蘭 Hetzner CX32（8GB）IP
CF_API_TOKEN  = Cloudflare API Token（需有 DNS Edit 權限）
CF_ZONE_ID    = aware-wave.com 的 Cloudflare Zone ID
SG_SSH_KEY    = SSH 進 SG 伺服器的金鑰路徑
EU_SSH_KEY    = SSH 進 EU 伺服器的金鑰路徑
SG_SSH_USER   = SG 伺服器的 SSH 使用者名稱（通常是 root 或 ubuntu）
EU_SSH_USER   = EU 伺服器的 SSH 使用者名稱
```

---

## 架構總覽

| 伺服器 | 規格 | 負責服務 |
|--------|------|----------|
| SG（新加坡） | Hetzner CX22，4GB RAM | WordPress、Next.js Admin、Node.js API |
| EU（芬蘭） | Hetzner CX32，8GB RAM | Supabase、n8n、Trigger.dev、Uptime Kuma |

### 網域對應

| 網域 | 服務 | 伺服器 |
|------|------|--------|
| `aware-wave.com` | WordPress 主網站 | SG |
| `www.aware-wave.com` | 301 轉址至主網域 | SG |
| `app.aware-wave.com` | Next.js Admin（Lobster） | SG |
| `api.aware-wave.com` | Node.js API（Lobster） | SG |
| `supabase.aware-wave.com` | Supabase API / Kong | EU |
| `studio.aware-wave.com` | Supabase Studio | EU |
| `n8n.aware-wave.com` | n8n | EU |
| `trigger.aware-wave.com` | Trigger.dev | EU |
| `uptime.aware-wave.com` | Uptime Kuma | EU |

---

## 步驟 1：更新 Cloudflare DNS

使用 Cloudflare API 設定以下 A records。
若該 record 已存在請更新，不存在則新增。

```bash
# SG 的 A records
for NAME in "@" "www" "app" "api"; do
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${NAME}\",\"content\":\"${SG_IP}\",\"proxied\":true}"
  echo ""
done

# EU 的 A records
for NAME in "supabase" "studio" "n8n" "trigger" "uptime"; do
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${NAME}\",\"content\":\"${EU_IP}\",\"proxied\":true}"
  echo ""
done
```

> **注意**：`studio.aware-wave.com` 設定完成後，請在 Cloudflare Access 加上保護規則，不要讓登入頁公開。

---

## 步驟 2：設定 SG 伺服器 Nginx

SSH 進 SG 伺服器，寫入 Nginx 設定：

```bash
ssh -i ${SG_SSH_KEY} ${SG_SSH_USER}@${SG_IP} << 'ENDSSH'

# WordPress
cat > /etc/nginx/sites-available/aware-wave.com << 'EOF'
server {
    listen 80;
    server_name aware-wave.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# www → 301 轉址
cat > /etc/nginx/sites-available/www.aware-wave.com << 'EOF'
server {
    listen 80;
    server_name www.aware-wave.com;
    return 301 https://aware-wave.com$request_uri;
}
EOF

# Next.js Admin
cat > /etc/nginx/sites-available/app.aware-wave.com << 'EOF'
server {
    listen 80;
    server_name app.aware-wave.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# Node.js API
cat > /etc/nginx/sites-available/api.aware-wave.com << 'EOF'
server {
    listen 80;
    server_name api.aware-wave.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# 啟用設定
for SITE in aware-wave.com www.aware-wave.com app.aware-wave.com api.aware-wave.com; do
  ln -sf /etc/nginx/sites-available/$SITE /etc/nginx/sites-enabled/$SITE
done

nginx -t && systemctl reload nginx
ENDSSH
```

---

## 步驟 3：設定 EU 伺服器 Nginx

SSH 進 EU 伺服器，寫入 Nginx 設定：

```bash
ssh -i ${EU_SSH_KEY} ${EU_SSH_USER}@${EU_IP} << 'ENDSSH'

declare -A SERVICES
SERVICES["supabase.aware-wave.com"]="8000"
SERVICES["studio.aware-wave.com"]="3000"
SERVICES["n8n.aware-wave.com"]="5678"
SERVICES["trigger.aware-wave.com"]="3030"
SERVICES["uptime.aware-wave.com"]="3001"

for DOMAIN in "${!SERVICES[@]}"; do
  PORT=${SERVICES[$DOMAIN]}
  cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
  ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
done

nginx -t && systemctl reload nginx
ENDSSH
```

> **Port 對應說明**：Trigger.dev 的 port 以實際 Docker Compose 設定為準，若不是 3030 請先確認再執行。

---

## 步驟 4：確認 SG 伺服器的環境變數

SSH 進 SG，確認 Next.js / Node.js API 的 `.env` 包含以下值：

```bash
ssh -i ${SG_SSH_KEY} ${SG_SSH_USER}@${SG_IP} << 'ENDSSH'
# 請確認這些路徑是否正確，依實際專案目錄調整
echo "=== Next.js .env ==="
grep -E "NEXT_PUBLIC_API_URL|SUPABASE_URL|POSTHOG|SENTRY|RESEND" ~/lobster/.env 2>/dev/null || echo "找不到 .env，請確認路徑"

echo "=== Node.js API .env ==="
grep -E "SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|RESEND|SENTRY" ~/lobster-api/.env 2>/dev/null || echo "找不到 .env，請確認路徑"
ENDSSH
```

確認下列變數值正確：

```env
NEXT_PUBLIC_API_URL=https://api.aware-wave.com
SUPABASE_URL=https://supabase.aware-wave.com
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
SENTRY_DSN=...
POSTHOG_KEY=...
```

若有錯誤值，請更新後重啟服務。

---

## 步驟 5：在 EU 伺服器安裝 Netdata

若 EU 伺服器尚未安裝 Netdata，請執行：

```bash
ssh -i ${EU_SSH_KEY} ${EU_SSH_USER}@${EU_IP} << 'ENDSSH'
if command -v netdata &> /dev/null; then
  echo "Netdata 已安裝，跳過"
else
  wget -O /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh
  sh /tmp/netdata-kickstart.sh --non-interactive
fi

systemctl enable netdata
systemctl start netdata
echo "Netdata 狀態："
systemctl status netdata --no-pager
ENDSSH
```

安裝完成後：
1. 登入 Netdata Cloud（https://app.netdata.cloud）
2. 將 EU 伺服器 claim 進同一個 Space
3. 確認 SG 和 EU 兩台都出現在 dashboard

---

## 步驟 6：確認 Grafana 資料來源

登入 Grafana 後：
1. 前往 **Connections → Data Sources**
2. 確認現有 data source 對應的 IP 正確（SG 服務不應指向 EU IP）
3. 若需要監控 EU 服務，新增 EU 伺服器的資料來源

---

## 步驟 7：驗證所有服務

執行以下指令確認每個網域可正常回應：

```bash
for DOMAIN in \
  "aware-wave.com" \
  "www.aware-wave.com" \
  "app.aware-wave.com" \
  "api.aware-wave.com" \
  "supabase.aware-wave.com" \
  "studio.aware-wave.com" \
  "n8n.aware-wave.com" \
  "trigger.aware-wave.com" \
  "uptime.aware-wave.com"; do
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 10 https://$DOMAIN)
  echo "$DOMAIN → HTTP $STATUS"
done
```

預期狀態碼：

| 網域 | 預期 |
|------|------|
| `aware-wave.com` | 200 |
| `www.aware-wave.com` | 301 |
| `app.aware-wave.com` | 200 |
| `api.aware-wave.com` | 200 或 404（依 API 設計） |
| `supabase.aware-wave.com` | 200 |
| `studio.aware-wave.com` | 200 或 401（有保護時） |
| `n8n.aware-wave.com` | 200 |
| `trigger.aware-wave.com` | 200 |
| `uptime.aware-wave.com` | 200 |

---

## 步驟 8：更新 Uptime Kuma 監控清單

登入 `https://uptime.aware-wave.com`，確認以下網址都在監控清單，缺少請手動新增：

```
https://aware-wave.com
https://app.aware-wave.com
https://api.aware-wave.com/health
https://supabase.aware-wave.com
https://n8n.aware-wave.com
https://trigger.aware-wave.com
```

---

## 注意事項

**跨洲延遲**：SG 的 Node.js API 查詢 EU 的 Supabase 會有跨洲延遲，影響 RAG / vector search 效能。目前可接受，若未來成為瓶頸再考慮將 Supabase 遷移至 SG。

**Supabase Studio 保護**：`studio.aware-wave.com` 不應公開，步驟 1 完成後請立即在 Cloudflare Access 設定存取規則。

**Resend**：寄件網域驗證在 Cloudflare DNS 層，只要沒有改發信網域就不受影響，無需額外動作。

**PostHog / Sentry**：API key 和 DSN 不變，確認 SG 服務的 `.env` 有正確設定即可，EU 的後台服務通常不需要埋這兩個。
