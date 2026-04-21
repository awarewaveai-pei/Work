# 伺服器安全事件應變手冊（教學版）

> **真實案例：** 2026-04-20，`wordpress-ubuntu-4gb-sin-1`（IP `5.223.93.113`）
> 因 Supabase PostgreSQL port 5432 暴露公網 + 預設密碼未更改，
> 攻擊者入侵後植入 XMRig 挖礦程式，造成 CPU 99.7%、Swap 91.5%，服務 502。
>
> 本手冊根據該事件整理，可直接用於未來任何類似事件。

---

## 目錄

1. [事件識別：這是入侵嗎？](#1-事件識別)
2. [立即行動（前 30 分鐘）](#2-立即行動)
3. [阻斷入口](#3-阻斷入口)
4. [清除惡意程式](#4-清除惡意程式)
5. [全面換密碼與金鑰](#5-全面換密碼與金鑰)
6. [調查影響範圍](#6-調查影響範圍)
7. [系統根除與重建決策](#7-系統根除與重建決策)
8. [加固，防止再次發生](#8-加固防止再次發生)
9. [事後文件與通報](#9-事後文件與通報)
10. [預防性檢查清單（部署新服務前用）](#10-預防性檢查清單)
11. [本次事件時間線紀錄](#11-本次事件時間線紀錄)
12. [關鍵概念：Docker 繞過 UFW](#12-關鍵概念docker-繞過-ufw)

---

## 1. 事件識別

### 典型入侵徵兆

| 徵兆 | 可能原因 |
|------|---------|
| CPU 持續 > 80% 且無對應業務流量 | 挖礦程式、暴力破解 |
| Swap 飆高、服務 502 / OOM Killed | 惡意程式佔記憶體 |
| 凌晨收到 Netdata / 監控告警 | 非業務時段高負載 |
| `ps aux` 出現不認識的二進位 | 植入程式 |
| `/tmp`、`/var/tmp`、`/root` 出現新資料夾 | 惡意檔案暫存位置 |
| 防火牆規則被修改 | 攻擊者保持入口 |
| `authorized_keys` 出現不認識的 key | SSH 後門 |
| Postgres / MySQL log 出現 `COPY` + `PROGRAM` | 指令注入 |

### 快速確認指令

```bash
# SSH 進去後先跑這幾行
ps aux --sort=-%cpu | head -20          # 找 CPU 高的進程
ls -la /tmp /var/tmp /root              # 找陌生檔案
last | head -20                         # 最近登入紀錄
cat /root/.ssh/authorized_keys          # 確認 SSH key
crontab -l; cat /etc/cron.d/*          # 排程
dmesg -T | grep -i "killed\|oom" | tail -20  # OOM 紀錄
```

---

## 2. 立即行動

**原則：先止血，再診斷。**

### Step 1 — 評估是否需要立即隔離

```bash
# 確認哪些 port 正在對外開放（這台發生事件的）
ss -tlnp
# 或
netstat -tlnp
```

如果看到 `0.0.0.0:5432`、`0.0.0.0:3306`、`0.0.0.0:27017` 等資料庫 port → **高優先度：立刻封鎖**

### Step 2 — 拍快照（如果可以）

在 Hetzner 主控台：Servers → 選取伺服器 → Backups / Snapshots → 建立快照。
原因：保存取證證據，之後可以回頭分析。

### Step 3 — 決定是否先下線

| 情況 | 建議 |
|------|------|
| 有客戶資料、可能資料外洩 | 考慮先關機，保存快照再處理 |
| 只是挖礦、無敏感資料 | 線上直接清除即可 |
| 無法 SSH | 用 Hetzner VNC Console 或 Rescue Mode |

---

## 3. 阻斷入口

**這是最優先的步驟。確認入侵管道後，第一件事是封閉它。**

### 3-1. 找出入侵管道

本次案例：Supabase PostgreSQL 5432 暴露公網 + 預設密碼。

```bash
# 查看所有 Docker 容器的 port 綁定
docker ps --format "table {{.Names}}\t{{.Ports}}"

# 查看哪些 port 綁定到 0.0.0.0（危險）
docker ps --format "{{.Ports}}" | grep "0.0.0.0"
```

### 3-2. 立即封鎖（雙層防護）

**第一層：iptables DOCKER-USER chain（Docker 服務仍運行）**

```bash
# 封鎖所有從外部（eth0）進入 Docker 容器的流量，只開 80/443
iptables -I DOCKER-USER -i eth0 -j DROP
iptables -I DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# 儲存（確保重開機後仍有效）
apt-get install -y iptables-persistent
iptables-save > /etc/iptables/rules.v4
```

**第二層：修改 docker-compose.yml（根本解決）**

```yaml
# 錯誤寫法（對外開放）
ports:
  - "5432:5432"        # 等同 0.0.0.0:5432:5432

# 正確寫法（只允許本機）
ports:
  - "127.0.0.1:5432:5432"
```

> ⚠️ **重要：Docker 會繞過 UFW！** 詳見第 12 節。
> UFW `deny 5432` 對 Docker 容器無效，一定要同時做以上兩層。

### 3-3. 修改後驗證

```bash
# 從外部測試（用另一台機器，或請朋友幫測）
nc -zv 5.223.93.113 5432   # 應該要 Connection refused 或 timeout

# 從本機測試（應該要能連）
nc -zv 127.0.0.1 5432
```

---

## 4. 清除惡意程式

### 4-1. 找到並終止惡意進程

```bash
# 找可疑進程（挖礦程式常見名稱：xmrig, kdevtmpfsi, kinsing, etc.）
ps aux --sort=-%cpu | head -20

# 確認是惡意的，殺掉
kill -9 <PID>

# 確認已終止
ps aux | grep <進程名>
```

### 4-2. 刪除惡意檔案

```bash
# 找最近 24 小時新增的檔案
find /tmp /var/tmp /root /home -newer /etc/passwd -type f 2>/dev/null

# 本次案例：xmrig 在這個位置
ls -la /root/supabase/docker/volumes/db/data/xmrig*/
rm -rf /root/supabase/docker/volumes/db/data/xmrig-6.24.0/

# 找所有 xmrig 相關檔案
find / -name "*xmrig*" 2>/dev/null
find / -name "kinsing" -o -name "kdevtmpfsi" 2>/dev/null
```

### 4-3. 清查持久化機制（攻擊者可能設定的後門）

```bash
# 1. Cron jobs
crontab -l
cat /etc/cron.d/*
cat /etc/crontab
ls -la /etc/cron.*/

# 2. Systemd services（找可疑的）
systemctl list-units --type=service --state=running
systemctl list-timers

# 3. SSH 後門
cat /root/.ssh/authorized_keys
cat /home/*/.ssh/authorized_keys 2>/dev/null

# 4. PostgreSQL 排程（pg_cron）
docker exec supabase-db psql -h 127.0.0.1 -U supabase_admin -d postgres \
  -c "SELECT * FROM cron.job;" 2>/dev/null

# 5. 可疑的系統帳號
cat /etc/passwd | grep -v nologin | grep -v false
getent passwd | awk -F: '$3 >= 1000'
```

### 4-4. 確認 Postgres 沒有留後門

```bash
# 列出所有資料庫使用者（找不認識的）
docker exec supabase-db psql -h 127.0.0.1 -U supabase_admin -d postgres \
  -c "SELECT usename, usesuper, usecreatedb, usecreaterole FROM pg_user;"

# 查看最近執行的 SQL（需要 pg_stat_statements）
docker exec supabase-db psql -h 127.0.0.1 -U supabase_admin -d postgres \
  -c "SELECT query, calls, total_exec_time FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;" 2>/dev/null

# 查看 Postgres audit log（若有啟用）
docker exec supabase-db cat /var/log/postgresql/postgresql*.log 2>/dev/null | grep -i "COPY\|PROGRAM\|CREATE EXTENSION" | tail -50
```

---

## 5. 全面換密碼與金鑰

**原則：凡是在受感染伺服器上跑過的服務，密碼都視為洩漏，一律換掉。**

### 5-1. PostgreSQL 所有使用者

```bash
# Supabase 有 8 個內部使用者，全部換掉
docker exec supabase-db psql -h 127.0.0.1 -U supabase_admin -d postgres -c "
ALTER USER supabase_auth_admin     PASSWORD '$(openssl rand -hex 32)';
ALTER USER supabase_storage_admin  PASSWORD '$(openssl rand -hex 32)';
ALTER USER authenticator           PASSWORD '$(openssl rand -hex 32)';
ALTER USER supabase_functions_admin PASSWORD '$(openssl rand -hex 32)';
ALTER USER supabase_replication_admin PASSWORD '$(openssl rand -hex 32)';
ALTER USER supabase_read_only_user PASSWORD '$(openssl rand -hex 32)';
ALTER USER supabase_admin          PASSWORD '$(openssl rand -hex 32)';
ALTER USER postgres                PASSWORD '$(openssl rand -hex 32)';
"
# 同步更新 .env 檔案，並重啟 stack
```

> ⚠️ 注意：在 Supabase 映像中，`postgres` 不是 superuser；
> `supabase_admin` 才是。要用 `supabase_admin` 身份執行上述指令。
> 連線方式：`-h 127.0.0.1`（走 trust auth），不要用 socket。

### 5-2. 其他服務

```bash
# 產生強密碼的方式
openssl rand -hex 32         # 64 字元 hex
openssl rand -base64 32      # ~44 字元 base64
```

需要 rotate 的項目：
- [ ] PostgreSQL 所有角色
- [ ] Redis（如有設密碼）
- [ ] MinIO root user
- [ ] n8n admin 帳號
- [ ] WordPress admin 帳號
- [ ] Trigger.dev（重新發 magic link）
- [ ] 應用程式 `.env` 中所有 `PASSWORD`、`SECRET`、`KEY` 欄位

### 5-3. SSH Key

```bash
# 如果懷疑 SSH key 洩漏
# 1. 在本機產生新的 key pair
ssh-keygen -t ed25519 -C "hetzner-trigger-new" -f ~/.ssh/hetzner_trigger_new

# 2. 用舊 key 登入，把新公鑰加到 authorized_keys
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 \
  "echo '$(cat ~/.ssh/hetzner_trigger_new.pub)' >> ~/.ssh/authorized_keys"

# 3. 確認新 key 可以登入後，移除舊 key
# 編輯 /root/.ssh/authorized_keys，刪除舊的那一行
```

---

## 6. 調查影響範圍

**目標：確認攻擊者只做了挖礦，還是也讀取/匯出了資料。**

### 6-1. 查 Postgres log（最重要）

```bash
# 找 COPY TO PROGRAM、COPY FROM PROGRAM（指令注入的特徵）
docker logs supabase-db 2>&1 | grep -i "COPY.*PROGRAM\|pg_cron\|CREATE EXTENSION" | tail -50

# 找可疑的 SELECT（大量查詢敏感表）
docker logs supabase-db 2>&1 | grep -i "SELECT.*auth\|SELECT.*users\|SELECT.*email" | tail -50
```

### 6-2. 查防火牆 / 網路 log

```bash
# iptables 計數器（看哪些 port 有流量）
iptables -L -v -n | grep -v "0     0"

# 系統 log 找可疑連線
grep "5432\|3306\|27017" /var/log/syslog 2>/dev/null | tail -50
journalctl --since "2026-04-19" --until "2026-04-21" | grep -i "5432\|denied\|refused" | tail -50
```

### 6-3. 評估等級

| 發現 | 處理方式 |
|------|---------|
| 只有挖礦（CPU 高、無資料存取） | 清除 + 加固即可 |
| 有讀取用戶資料表 | 升級處理（見 6-4） |
| 有 `COPY TO` 匯出資料到外部 | 需要通報（見第 9 節） |
| 發現不明 authorized_keys | 必須換 key，假設攻擊者有完整存取 |

### 6-4. 若懷疑資料外洩

1. 確認受影響的資料表（auth.users、profiles 等）
2. 確認資料筆數與類型（email、姓名、電話？）
3. 記錄事件時間範圍（第一次異常連線到封鎖）
4. 依合約與法規決定是否需要通報（GDPR 72 小時內）

---

## 7. 系統根除與重建決策

### 何時該整台重建？

| 情況 | 建議 |
|------|------|
| 只有挖礦，已找到並清除惡意檔，沒有後門跡象 | 清除 + 加固，不需重建 |
| 發現不明 cron / systemd / authorized_keys | 強烈建議重建 |
| 攻擊者獲得 root 或 shell 存取 | 必須重建 |
| 無法 100% 確認清乾淨 | 重建更安全 |

### 重建流程（Hetzner）

```bash
# 1. 在 Hetzner 主控台建立當前狀態快照（取證用）
# 2. 建立新的乾淨 VM（相同規格）
# 3. 在新 VM 上重新部署，套用本手冊的安全設定
# 4. 把資料庫備份（從事件發生前的備份）恢復
# 5. 確認服務正常後，DNS 切到新 IP
# 6. 舊 VM 保留幾天（取證），確認無誤後刪除
```

---

## 8. 加固，防止再次發生

### 8-1. 部署新 Docker Stack 的強制規則

**所有非對外服務的 port，一律加 `127.0.0.1:` 前綴：**

```yaml
# docker-compose.yml 範例
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"   # ✅ 只有本機能連

  redis:
    ports:
      - "127.0.0.1:6379:6379"   # ✅

  minio:
    ports:
      - "127.0.0.1:9000:9000"   # ✅

  webapp:
    ports:
      - "0.0.0.0:80:80"         # ✅ 這個才對外
      - "0.0.0.0:443:443"       # ✅
```

**危險的 port 絕對不能對外（`0.0.0.0:`）：**

| Port | 服務 | 絕對不能公開 |
|------|------|------------|
| 5432 | PostgreSQL | ✅ |
| 5433 | Supabase Pooler | ✅ |
| 6543 | Supabase Pooler alt | ✅ |
| 3306 | MySQL | ✅ |
| 27017 | MongoDB | ✅ |
| 6379 | Redis | ✅ |
| 9000 | MinIO | ✅ |
| 5678 | n8n | ✅ |
| 3000 | Supabase Studio | ✅ |
| 8123/9000 | ClickHouse | ✅ |

### 8-2. iptables 設定（持久化）

這是防護的第二道牆，即使 Docker compose 設定有疏漏也能擋住。

```bash
# 安裝 iptables-persistent（注意：安裝會移除 UFW）
apt-get install -y iptables-persistent

# INPUT chain：只開 22/80/443
iptables -F INPUT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -P INPUT DROP

# DOCKER-USER chain：防止 Docker 繞過防火牆
iptables -F DOCKER-USER
iptables -I DOCKER-USER -i eth0 -j DROP
iptables -I DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# 儲存（重開機後仍有效）
iptables-save > /etc/iptables/rules.v4
```

### 8-3. 驗證 iptables 已生效

```bash
# 確認 DOCKER-USER 有規則
iptables -L DOCKER-USER -v -n

# 確認 INPUT 只開 22/80/443
iptables -L INPUT -v -n

# 從外部掃描（用另一台機器）
nmap -p 5432,3306,6379,27017,9000 5.223.93.113
# 全部應該顯示 filtered 或 closed
```

### 8-4. 密碼強度要求

- 最短 32 字元
- 使用 `openssl rand -hex 32` 或 `openssl rand -base64 32` 產生
- 不使用任何預設值（`password`、`postgres`、`your-super-secret...` 等）
- 儲存在 secrets vault，不要明文放在 git repo

### 8-5. 監控告警

```bash
# Netdata（已安裝）建議設定的告警閾值
# 位置：/etc/netdata/health.d/

# CPU 使用率 > 85% 持續 5 分鐘
# Swap 使用率 > 70% 持續 5 分鐘
# 磁碟空間 < 10%
# 任何容器 OOM killed

# 快速確認 Netdata 是否在跑
curl -s http://localhost:19999/api/v1/info | python3 -m json.tool | grep version
```

### 8-6. 定期稽核腳本

建議每週執行（可加入 cron）：

```bash
#!/bin/bash
# security-audit.sh
echo "=== $(date) ==="
echo "--- 可疑進程 ---"
ps aux --sort=-%cpu | head -10

echo "--- Docker port 綁定（找 0.0.0.0） ---"
docker ps --format "{{.Names}}: {{.Ports}}" | grep "0.0.0.0" | grep -v ":80\|:443"

echo "--- /tmp 新檔案 ---"
find /tmp /var/tmp -newer /etc/passwd -type f 2>/dev/null

echo "--- authorized_keys ---"
cat /root/.ssh/authorized_keys

echo "--- 登入紀錄 ---"
last | head -10

echo "=== 完成 ==="
```

---

## 9. 事後文件與通報

### 9-1. 事件紀錄範本（自己留存用）

```
事件編號：SEC-2026-001
發現時間：2026-04-20 約 03:00（Netdata 告警）
確認時間：2026-04-20 上午（SSH 進去確認）
封鎖時間：2026-04-20 上午

攻擊向量：
- 公開暴露的 PostgreSQL port 5432（0.0.0.0:5432）
- 使用 Supabase 預設密碼未更改

惡意行為：
- 植入 XMRig 挖礦程式（版本 6.24.0）
- 路徑：/root/supabase/docker/volumes/db/data/xmrig-6.24.0/

資料影響：
- 尚未發現資料外洩跡象
- 影響：CPU/Swap 飆高，trigger.dev 502

已執行的行動：
1. 終止 xmrig 進程
2. 刪除惡意檔案
3. 封鎖 port（iptables DOCKER-USER + compose 綁定改 127.0.0.1）
4. 更換所有 PostgreSQL 密碼
5. 更換所有 Docker stack 的 port 綁定

後續預防：
- iptables 持久化規則
- 所有服務密碼改用 openssl rand 產生
- ClickHouse 加 mem_limit（同時修復 OOM 問題）
```

### 9-2. 何時需要正式通報？

| 條件 | 行動 |
|------|------|
| 有個人資料（email、姓名、電話）可能外洩 | 依 GDPR 在 72 小時內通報監管機關 |
| 有客戶資料外洩 | 通知受影響客戶 |
| 只是挖礦、無敏感資料外洩 | 內部紀錄即可，不需公開通報 |

---

## 10. 預防性檢查清單

**每次部署新的 Docker Stack 之前，逐項確認：**

### 基礎安全

- [ ] 所有預設密碼已更換（PostgreSQL、Redis、MinIO、n8n、WordPress 等）
- [ ] 所有密碼長度 ≥ 32 字元，使用 `openssl rand` 產生
- [ ] 密碼只存在 `.env`（不 commit 到 git）或 secrets vault

### Port 綁定

- [ ] `docker ps --format "{{.Ports}}"` 輸出中，無資料庫 port 綁定到 `0.0.0.0`
- [ ] 5432 / 5433 / 6543（PostgreSQL）→ `127.0.0.1:` 綁定
- [ ] 3306（MySQL）→ `127.0.0.1:` 綁定
- [ ] 6379（Redis）→ `127.0.0.1:` 綁定
- [ ] 9000（MinIO）→ `127.0.0.1:` 綁定
- [ ] 5678（n8n）→ `127.0.0.1:` 綁定
- [ ] 8123 / 9000（ClickHouse）→ `127.0.0.1:` 綁定

### 防火牆

- [ ] iptables INPUT chain：只開 22/80/443，其他 DROP
- [ ] iptables DOCKER-USER chain：只允許 80/443 從 eth0 進入
- [ ] `iptables-save > /etc/iptables/rules.v4` 已儲存（重開機後仍有效）

### 監控

- [ ] Netdata 或其他監控服務在跑
- [ ] CPU > 85% 告警已設定
- [ ] 告警 email 送到有在看的信箱

### 記憶體限制

- [ ] 每個 Docker 服務都設有 `mem_limit`，避免單一服務耗盡記憶體

---

## 11. 本次事件時間線紀錄

| 時間 | 事件 |
|------|------|
| 2026-04-20 ~03:00 | Netdata 發送告警：CPU 99.7%、Swap 91.5% |
| 2026-04-20 ~03:00 | trigger.dev 出現 502（ClickHouse 被 OOM Killer 殺掉）|
| 2026-04-20 上午 | SSH 進入，`ps aux` 發現 xmrig 進程 |
| 2026-04-20 上午 | 確認入侵路徑：5432 公開 + 預設密碼 |
| 2026-04-20 上午 | 終止 xmrig、刪除檔案 |
| 2026-04-20 上午 | 封鎖 port（iptables + compose 127.0.0.1 綁定） |
| 2026-04-20 上午 | 更換 Supabase 所有 PostgreSQL 使用者密碼 |
| 2026-04-20 上午 | 修復 ClickHouse OOM（加 mem_limit + override.xml） |
| 2026-04-20 上午 | trigger.dev 502 解除 |
| 2026-04-20 下午 | 設定 iptables-persistent 規則持久化 |
| 2026-04-20 下午 | 完成安全加固，服務全部恢復正常 |
| 2026-04-21 | 整理本手冊 |

---

## 12. 關鍵概念：Docker 繞過 UFW

這是導致本次入侵的根本機制，每個自架 Docker 的人都必須理解。

### 問題

```
你在 UFW 設定：ufw deny 5432
UFW 顯示：Status: active / 5432 DENY Anywhere

但實際上外面還是連得到 5432！
```

### 原因

```
Docker 啟動容器時 → 直接在 iptables 的 DOCKER chain 寫規則
→ DOCKER chain 在 INPUT chain 之前執行
→ UFW 的 INPUT chain 規則根本輪不到
→ 流量直接進了 DOCKER chain → 到達容器

示意圖：
外部流量 → iptables → DOCKER chain（Docker 控制）→ 容器 ✅
                  ↘ FORWARD chain
                  ↘ INPUT chain（UFW 控制）→ 主機進程
```

### 正確解法

**方法一（推薦）：compose 層綁定 127.0.0.1**

```yaml
ports:
  - "127.0.0.1:5432:5432"  # Docker 根本不會建立對外規則
```

**方法二：DOCKER-USER chain（備用防線）**

DOCKER-USER chain 在 DOCKER chain 之前執行，Docker 自己不會清它：

```bash
iptables -I DOCKER-USER -i eth0 -j DROP                    # 預設擋掉
iptables -I DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```

**兩個方法同時用 = 最安全。**

### UFW 與 iptables-persistent 不相容

安裝 `iptables-persistent` 時會自動移除 `ufw`。
選一個用，不要混用。本機已選用 `iptables-persistent`。

---

## 參考

- 本次事件詳細紀錄：[HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md](HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md)
- 502 / OOM 緊急處理：[HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md](HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md)
- 伺服器資訊：IP `5.223.93.113`、Server ID `125887340`、SSH key `~/.ssh/hetzner_trigger`
