# Hetzner 伺服器安全事件：加密貨幣挖礦機入侵 (2026-04-20)

**伺服器：** `wordpress-ubuntu-4gb-sin-1` — IP `5.223.93.113`

---

## 事件摘要

攻擊者透過公開暴露的 PostgreSQL 端口（5432）入侵伺服器，植入 XMRig 加密貨幣挖礦機。這是造成 CPU 99.7%、Swap 91.5% 的根本原因。

---

## 攻擊向量

| 項目 | 說明 |
|------|------|
| 入口 | Supabase Docker `supavisor` 將 port `5432` 暴露到所有網路介面（`0.0.0.0:5432`） |
| 憑證 | Supabase 預設 PostgreSQL 密碼 `your-super-secret-and-long-postgres-password` 從未更改 |
| 攻擊手法 | 連入 PostgreSQL → 透過 COPY 或 pg_cron 執行系統指令 → 下載 xmrig → 執行 |

---

## 已執行的清除步驟

### 1. 找到並終止挖礦程式
```bash
ps aux | grep xmrig
kill -9 <PID>
```

### 2. 刪除挖礦程式檔案
```bash
rm -rf /root/supabase/docker/volumes/db/data/xmrig-6.24.0/
```

### 3. 確認無異常系統排程
```bash
crontab -l
cat /etc/cron.d/*
systemctl list-timers
```

### 4. 確認無惡意資料庫使用者
```bash
docker exec supabase-db psql -h 127.0.0.1 -U supabase_admin -d postgres \
  -c "SELECT usename, usesuper FROM pg_user;"
```

---

## 已套用的修復

### UFW 防火牆規則
```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 5432     # PostgreSQL
ufw deny 5433     # PostgreSQL pooler
ufw enable
```

### 修復 Supabase port 綁定（docker-compose.yml）
```yaml
# 修改前（危險）
ports:
  - ${POSTGRES_PORT}:5432   # 綁定到 0.0.0.0

# 修改後（安全）
ports:
  - 127.0.0.1:${POSTGRES_PORT}:5432  # 只綁定到 localhost
```
檔案：`/root/supabase/docker/docker-compose.yml`

### 更換 PostgreSQL 密碼
所有 Supabase 內部使用者密碼已從預設值更改。更新方式：
```bash
# 透過 localhost 信任連線登入（pg_hba.conf 有 127.0.0.1/32 trust）
docker exec supabase-db psql -h 127.0.0.1 -U supabase_admin -d postgres -c "
ALTER USER supabase_auth_admin PASSWORD '<new_pw>';
ALTER USER supabase_storage_admin PASSWORD '<new_pw>';
ALTER USER authenticator PASSWORD '<new_pw>';
ALTER USER supabase_functions_admin PASSWORD '<new_pw>';
ALTER USER supabase_replication_admin PASSWORD '<new_pw>';
ALTER USER supabase_read_only_user PASSWORD '<new_pw>';
ALTER USER supabase_admin PASSWORD '<new_pw>';
ALTER USER postgres PASSWORD '<new_pw>';
"
# 同時更新 /root/supabase/docker/.env 的 POSTGRES_PASSWORD
# 然後重啟 supabase stack
cd /root/supabase/docker && docker compose down && docker compose up -d
```

---

## 預防措施清單

- [x] Supabase postgres port 改為 `127.0.0.1:` 綁定
- [x] n8n port 5678 改為 `127.0.0.1:` 綁定
- [x] Supabase pooler port 6543 改為 `127.0.0.1:` 綁定
- [x] 更換所有 PostgreSQL 預設密碼
- [x] 刪除 xmrig 程式與目錄
- [x] iptables INPUT chain：只允許 22/80/443，其他 DROP
- [x] iptables DOCKER-USER chain：封鎖外部非 80/443 的 Docker 容器訪問（繞過 UFW 漏洞）
- [ ] 定期稽核 `ps aux` 確認無可疑進程
- [ ] 設定 Netdata 告警閾值（CPU > 80% 持續 5 分鐘）

---

## 重要：Docker 會繞過 UFW！

這是一個常見的 Docker + UFW 安全盲點：

```
Docker 綁定 0.0.0.0:PORT → 直接操作 iptables DOCKER chain
→ UFW 的 INPUT chain 規則無效！
→ UFW 顯示 "deny" 但實際上 port 是對外開放的
```

**正確防護方式（雙層）：**

1. Port 綁定改為 `127.0.0.1:PORT:PORT`（docker-compose.yml）
2. 在 `DOCKER-USER` chain 加規則（在 DOCKER chain 之前執行）：

```bash
# 只允許 80/443 從外部進入 Docker 容器
iptables -I DOCKER-USER -i eth0 -j DROP
iptables -I DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# 儲存規則（使用 iptables-persistent）
iptables-save > /etc/iptables/rules.v4
```

注意：`iptables-persistent` 和 `ufw` 不相容（安裝會移除 ufw）。
使用 `iptables-persistent` 後，要手動設定 INPUT chain：

```bash
iptables -F INPUT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -P INPUT DROP
iptables-save > /etc/iptables/rules.v4
```

---

## 事後分析：為何 CPU/Swap 突然飆高

Netdata 凌晨告警（CPU 99.7%、Swap 91.5%）原因：
1. 挖礦程式 xmrig 持續佔用所有 CPU
2. 同時 ClickHouse 無記憶體上限，壓垮 swap
3. 兩者同時發生，觸發 OOM Killer → trigger-clickhouse 容器被殺 → 502 Bad Gateway

---

## 部署新 Docker Stack 前的安全檢查清單

1. 修改所有預設密碼（PostgreSQL、MinIO、Redis、n8n 等）
2. Port 綁定：非對外服務一律加 `127.0.0.1:` 前綴
3. 確認沒有資料庫 port 直接暴露（5432, 3306, 27017 等）
4. 驗證 DOCKER-USER iptables 規則已生效
