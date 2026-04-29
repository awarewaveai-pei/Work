# aware-wave.com WordPress 完整架構文件

整合來源：Gemini、GPT、Copilot、Perplexity、Claude 建議  
適用伺服器：SG（新加坡）Hetzner CX22，4GB RAM

---

## 架構總覽

```
使用者
  ↓
Cloudflare Edge（全球）
  ├── WAF + DDoS 防護
  ├── CDN 快取（靜態資源）
  ├── Turnstile（機器人過濾）
  ├── Image Resizing / Images（WebP/AVIF 轉換）
  └── R2（媒體原圖儲存）
  ↓
SG 伺服器（Nginx → Docker）
  ├── WordPress + WooCommerce（動態頁面）
  ├── MariaDB（資料庫）
  └── Redis（Object Cache）
  ↓
EU 伺服器（背景服務）
  ├── n8n（自動化）
  ├── Trigger.dev（背景任務）
  └── Supabase（知識庫）
```

**核心原則：WordPress origin 只處理動態頁面，真正的全球層在 Cloudflare Edge。**

---

## 一、Cloudflare 設定

### 1.1 基本設定

| 項目 | 設定值 | 說明 |
|------|--------|------|
| SSL/TLS 模式 | **Full (Strict)** | 必須，避免 MITM 攻擊 |
| Always Use HTTPS | 開啟 | 強制 HTTPS |
| HTTP/2 | 開啟 | 效能提升 |
| Brotli 壓縮 | 開啟 | 靜態資源壓縮 |
| Rocket Loader | **關閉** | WooCommerce 不相容 |
| Minify | HTML/CSS/JS 全開 | 但 FlyingPress 也會做，擇一即可 |

### 1.2 WAF 與安全

- 啟用 **Cloudflare WAF**（Managed Rules）
- 啟用 **Turnstile** 取代 CAPTCHA，套用在：
  - WordPress 登入頁 `/wp-login.php`
  - WooCommerce checkout
  - 聯絡表單
- 啟用 **Bot Fight Mode**
- 啟用 **Rate Limiting**：
  - `/wp-login.php` → 10 次/分鐘
  - `/wp-json/` → 60 次/分鐘
  - `/checkout` → 20 次/分鐘

### 1.3 快取規則（Cache Rules）

WooCommerce 以下頁面**不能全頁快取**，需設定 Bypass：

```
/cart
/checkout
/my-account
/wp-admin
/wp-login.php
/?wc-ajax=*
Cookie 包含：woocommerce_cart_hash、woocommerce_items_in_cart、wp_woocommerce_session_*
```

FlyingPress 與 Cloudflare 快取搭配時，建議讓 FlyingPress 控制 WP 層快取，Cloudflare 控制邊緣快取，不要雙重快取同一頁面。

### 1.4 R2 + Cloudflare Images

- **R2**：存放 WordPress 媒體庫原圖，零 egress 成本
- **Cloudflare Images**：即時轉換 WebP / AVIF / 多尺寸，全球傳遞

> 不要只用 R2，R2 不會自動產生多版本圖片。必須搭配 Cloudflare Images 才能做格式轉換與尺寸縮放。

WordPress 外掛選擇：**WP Offload Media** 或 **Media Cloud** 搭配 R2 bucket。

---

## 二、SG 伺服器 Docker Compose 架構

### 2.1 建議服務結構

```yaml
# docker-compose.yml（SG 伺服器）
services:

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - wordpress_data:/var/www/html
    depends_on:
      - wordpress
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  wordpress:
    image: wordpress:php8.2-fpm
    environment:
      WORDPRESS_DB_HOST: mariadb
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wp_user
      WORDPRESS_DB_PASSWORD: ${DB_PASSWORD}
      WORDPRESS_CONFIG_EXTRA: |
        define('WP_REDIS_HOST', 'redis');
        define('WP_REDIS_PORT', 6379);
        define('WP_CACHE', true);
    volumes:
      - wordpress_data:/var/www/html
      - ./php/www.conf:/usr/local/etc/php-fpm.d/www.conf   # PHP-FPM 調優
    depends_on:
      mariadb:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "php-fpm", "-t"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  mariadb:
    image: mariadb:10.11
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wp_user
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mariadb_data:/var/lib/mysql      # Named Volume，不要用 Bind Mount
      - ./mariadb/my.cnf:/etc/mysql/conf.d/custom.cnf
    deploy:
      resources:
        limits:
          memory: 1.5G                   # 明確限制，防止 OOM
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 30s
      timeout: 10s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          memory: 300M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  db-backup:
    image: mariadb:10.11
    entrypoint: /backup.sh
    environment:
      MYSQL_HOST: mariadb
      MYSQL_USER: wp_user
      MYSQL_PASSWORD: ${DB_PASSWORD}
      R2_BUCKET: ${R2_BUCKET}
      R2_ACCESS_KEY: ${R2_ACCESS_KEY}
      R2_SECRET_KEY: ${R2_SECRET_KEY}
    volumes:
      - ./scripts/backup.sh:/backup.sh
    depends_on:
      mariadb:
        condition: service_healthy
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"

volumes:
  wordpress_data:
  mariadb_data:
  redis_data:
```

### 2.2 MariaDB 效能調優（my.cnf）

```ini
# ./mariadb/my.cnf
[mysqld]
# InnoDB Buffer Pool：設為資料庫容器分配記憶體的 70-80%
# 容器限制 1.5GB → 設 1GB
innodb_buffer_pool_size = 1G
innodb_buffer_pool_instances = 2
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2    # 效能優先（可接受 1 秒資料損失）
innodb_flush_method = O_DIRECT

# 連線
max_connections = 100
wait_timeout = 300
interactive_timeout = 300

# 慢查詢日誌（餵給 Loki 分析）
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1

# 字元集
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

### 2.3 PHP-FPM 調優（針對 4GB RAM）

```ini
# ./php/www.conf
[www]
; 動態模式：依流量自動調整 worker 數量
pm = dynamic

; 最大同時 PHP worker 數：防止 OOM 的關鍵
; 4GB RAM 下建議 20-25，超過這個流量排隊，不會 crash
pm.max_children = 20

; 常駐 worker 數（低流量時）
pm.start_servers = 4
pm.min_spare_servers = 2
pm.max_spare_servers = 6

; 每個 worker 最多處理 500 個請求後重啟（防記憶體洩漏）
pm.max_requests = 500
```

```ini
# ./php/php.ini
memory_limit = 256M
max_execution_time = 60
upload_max_filesize = 64M
post_max_size = 64M
```

> 每個 PHP worker 約佔 30–60MB。`pm.max_children = 20` 代表最多佔 ~1.2GB，搭配 MariaDB 1.5GB + Redis 300MB，4GB 剛好夠用。流量尖峰時系統會排隊而不是 crash。



```bash
#!/bin/bash
# ./scripts/backup.sh
# 每天凌晨 2 點執行（透過 cron 或 n8n 觸發）

set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/wp_backup_${DATE}.sql.gz"

echo "開始備份..."
mysqldump \
  -h ${MYSQL_HOST} \
  -u ${MYSQL_USER} \
  -p${MYSQL_PASSWORD} \
  --single-transaction \
  --quick \
  --lock-tables=false \
  wordpress | gzip > ${BACKUP_FILE}

echo "上傳到 R2..."
# 使用 rclone 上傳到 Cloudflare R2
rclone copy ${BACKUP_FILE} r2:${R2_BUCKET}/db-backups/

# 清理本地暫存
rm ${BACKUP_FILE}

# 清理 R2 上 30 天前的備份
rclone delete r2:${R2_BUCKET}/db-backups/ \
  --min-age 30d

echo "備份完成：${DATE}"
```

> R2 備份讓你就算 Hetzner 整台爆炸，訂單資料還在，隨時可以還原。

---

## 四、WordPress 外掛清單

### 最終定案

| 類別 | 外掛 | 說明 |
|------|------|------|
| 頁面 / 商店 | Kadence + WooCommerce | 主題與電商核心 |
| 支付 | 藍新金流（newebpay-payment-gateway）、Stripe | 台灣本地金流 + 國際信用卡 |
| CRM / 表單 | Fluent Forms、FluentCRM、FluentSMTP | 完整 CRM 方案 |
| 快取 / 效能 | FlyingPress、Perfmatters、Redis Object Cache | 目前 WP 最佳效能組合 |
| 媒體 | WP Offload Media 或 Media Cloud | 搭配 R2 |
| 圖片轉換 | Cloudflare Images（官方 plugin） | 建議優先用 Images，非單純 Resizing |
| 安全 | Patchstack、Cloudflare Turnstile、Limit Login Attempts Reloaded | 三層防護 |
| SEO | Rank Math | 功能全面 |
| 自動化 | WP Webhooks | 與 n8n 串接 |
| 除錯 / 監控 | Query Monitor、WP Activity Log、Health Check & Troubleshooting | 開發與維運用 |

### Perfmatters 重點設定

- **Disable Cart Fragments**：開啟（WooCommerce 最常見效能瓶頸）
- **Disable Emoji**：開啟
- **Disable Embeds**：開啟
- **Remove Query Strings**：開啟
- **Heartbeat Control**：限制 frontend / backend

---

## 五、WooCommerce 快取策略

### 絕對不能快取的頁面

```
URL 路徑：
/cart
/checkout
/my-account
/wp-admin/*
/wp-login.php

Cookie（有這些 cookie 時 bypass 快取）：
woocommerce_cart_hash
woocommerce_items_in_cart
wp_woocommerce_session_*
woocommerce_recently_viewed

Query String：
?wc-ajax=*
?add-to-cart=*
```

### FlyingPress 設定

- Cache Logged-in Users：**關閉**
- Exclude WooCommerce pages：**開啟**（自動排除 cart/checkout/my-account）
- Cache Lifespan：建議 24 小時

---

## 六、監控整合

### 6.1 Netdata（SG + EU 兩台）

- SG 監控：WordPress、MariaDB、Redis、Nginx
- EU 監控：Supabase、n8n、Trigger.dev、Uptime Kuma

兩台都 claim 進同一個 Netdata Cloud Space，統一 dashboard 查看。

### 6.2 Loki + Grafana（慢查詢分析）

將 MariaDB slow query log 透過 Promtail 收進 Loki：

```yaml
# promtail config 片段
scrape_configs:
  - job_name: mysql-slow
    static_configs:
      - targets:
          - localhost
        labels:
          job: mysql-slow-query
          __path__: /var/log/mysql/slow.log
```

在 Grafana 建立 dashboard，查詢：
```
{job="mysql-slow-query"} |= "Query_time"
```

這樣可以看出**哪個外掛或哪個查詢在拖慢結帳速度**。

### 6.3 Uptime Kuma 監控清單

| 監控項目 | URL |
|---------|-----|
| 主網站 | https://aware-wave.com |
| Next.js Admin | https://app.aware-wave.com |
| Node.js API | https://api.aware-wave.com/health |
| Supabase | https://supabase.aware-wave.com |
| n8n | https://n8n.aware-wave.com |
| Trigger.dev | https://trigger.aware-wave.com |
| WordPress REST API | https://aware-wave.com/wp-json/wp/v2/ |

### 6.4 Sentry（錯誤追蹤）

- WordPress PHP 錯誤：安裝 WP Sentry 外掛
- Next.js：`@sentry/nextjs`
- Node.js API：`@sentry/node`

---

## 七、n8n 自動化建議

| 工作流程 | 觸發 | 動作 |
|---------|------|------|
| 新訂單通知 | WooCommerce Webhook | 發 Email + LINE/Slack 通知 |
| 資料庫備份完成通知 | 備份腳本完成 | 發 Slack 通知 |
| 伺服器異常警報 | Uptime Kuma Webhook | 發緊急通知 |
| 每日銷售報表 | Cron 每天 9:00 | 查 WooCommerce API，整理後寄 Email |
| FluentCRM 同步 | 新會員註冊 | 新增到 CRM 分群 |

---

## 八、安全加固 Checklist

部署完成後確認以下項目：

```
[ ] Cloudflare SSL/TLS 設為 Full (Strict)
[ ] WordPress 管理員帳號不是 "admin"
[ ] wp-config.php 設定 DB_PREFIX 非預設 "wp_"
[ ] 關閉 WordPress XML-RPC（Perfmatters 可設定）
[ ] /wp-login.php 設 Cloudflare Rate Limiting
[ ] studio.aware-wave.com 設 Cloudflare Access 保護
[ ] MariaDB 不對外開放 port 3306
[ ] Redis 不對外開放 port 6379
[ ] 伺服器 UFW 只開 80、443、SSH
[ ] SSH 禁止 root 登入，改用 key-based auth
[ ] 設定 swap（2GB）
[ ] 設定 fail2ban（SSH brute force 防護）
```

---

## 九、記憶體配置參考（SG CX22，4GB RAM）

| 服務 | 配置上限 | 預估使用 |
|------|---------|---------|
| MariaDB 容器 | 1.5GB | 800MB–1.2GB |
| Redis 容器 | 300MB | 50–256MB |
| WordPress + PHP-FPM | — | 300–600MB |
| Nginx | — | 50MB |
| 系統本身 | — | 300–400MB |
| Swap（保險） | 2GB | 只在尖峰時用 |

流量平穩時約用 2–2.5GB，尖峰時靠 Swap 頂著。若 Swap 持續被用超過 500MB，考慮升級到 CX32（8GB）。

---

## 十、評估與後續規劃

### 目前架構評分

| 面向 | 評估 |
|------|------|
| 效能 | ⭐⭐⭐⭐⭐ Cloudflare Edge + Redis + FlyingPress 是目前 WP 最強組合 |
| 安全性 | ⭐⭐⭐⭐⭐ WAF + Turnstile + Patchstack 三層防護 |
| 維運複雜度 | ⭐⭐⭐⭐ Docker 化讓部署可重複，但服務數量多，需要熟悉 |
| 成本效益 | ⭐⭐⭐⭐⭐ SG 跑輕量服務，EU 跑重量服務，成本最佳化 |
| 資料安全 | ⭐⭐⭐⭐ mysqldump → R2 異地備份，可再加 Hetzner Snapshot |

### 未來升級路徑

1. **流量變大**：SG 升級到 CX32（8GB），或把 MariaDB 獨立到第三台
2. **Supabase 成為瓶頸**：AwareWave 自架 **Supabase 固定 EU**（與 SG WordPress 分離）；跨洲延遲優先考慮 **連線池／API 快取／读副本**，而非把 SoR 搬回 SG
3. **HA 需求**：Cloudflare Load Balancer + 兩台 SG origin（目前不需要）
4. **搜尋功能**：可在 EU 加 Meilisearch，WooCommerce 搜尋走 Supabase vector
