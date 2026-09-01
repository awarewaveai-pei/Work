# Hetzner Server 502 / OOM 緊急處理手冊

> **現役連線（2026-08-31）**：所有診斷只連 **ks-aw-01**：`ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47`，需要權限時使用 `sudo`。前任 `149.202.64.114` 與舊 SG/EU 主機都已退場，不得當成回退目標。EU Trigger 與 phase1 stack 同機，以目錄分辨服務，不以 IP 分辨。

> **適用範圍（歷史，機器已整併）**：此手冊針對 **EU Trigger stack**（IP `204.168.175.41`，`trigger.aware-wave.com`）。  
> SG phase1 stack（IP `5.223.93.113`，`aware-wave.com` / `app.aware-wave.com`）的 docker compose 路徑為 `/root/lobster-phase1/`，其餘步驟相同。

**伺服器（現況）：** ks-aw-01 — IP `145.239.195.47`，SSH port `58122`（trigger.aware-wave.com + aware-wave.com 同機）
**伺服器（歷史，已刪除）：** EU Trigger `204.168.175.41` / SG `wordpress-ubuntu-4gb-sin-1` `5.223.93.113`

---

## 症狀：502 Bad Gateway

Cloudflare ✅ → Hetzner Host ❌

**根本原因：** Docker 容器被 OOM Killer 殺掉（記憶體不足）。

---

## Step 1 — 立即診斷

```powershell
# Windows PowerShell 連線
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" -p 58122 ubuntu@145.239.195.47
```

```bash
# 伺服器上確認容器狀態
cd /root/lobster-phase1/trigger
sudo docker compose ps

# 看 OOM 記錄
sudo dmesg -T | grep -i "killed process\|out of memory" | tail -20

# 記憶體狀況
free -h && swapon --show
```

---

## Step 2 — 快速修復（重啟容器）

容器有 `restart: unless-stopped`，通常會自動重啟。如果沒有：

```bash
cd /root/lobster-phase1/trigger
sudo docker compose up -d
```

---

## Step 3 — 如果 SSH 連不進去

**禁止執行本檔舊 Hetzner API、VNC、rescue 指令**：那些只屬於已刪除主機，對 KS-6 無效。依 `/ks-aw-01-reboot` 的 rollback 段改用 **OVH Manager KVM / rescue mode**。這是 High-risk 操作，須先取得操作者明示批准，再按當下 RAID 裝置與 boot 狀態處理；不得套用前任主機的分割區、root 使用者或 key 指令。

---

## 伺服器重要資訊

| 項目 | 值 |
|------|-----|
| IP | `145.239.195.47` |
| SSH | `ubuntu` / port `58122` / key `~/.ssh/id_ed25519` / use `sudo` |
| Out-of-band recovery | OVH Manager KVM / rescue mode; follow `/ks-aw-01-reboot` |
| Trigger stack path | `/root/lobster-phase1/trigger/` |

---

## ClickHouse OOM 永久修復

**問題：** clickhouse 預設無記憶體上限，超出 Docker `mem_limit` 被 cgroup OOM 殺掉。

**已套用的修復：**
- `docker-compose.yml`: `mem_limit: 768m` → `mem_limit: 1024m`
- `clickhouse/override.xml`: `max_server_memory_usage: 800000000`（800MB，低於 1024m 上限）

```bash
# 確認設定已套用
sudo docker inspect trigger-clickhouse | grep -i memory
sudo cat /root/lobster-phase1/trigger/clickhouse/override.xml
```

---

## VNC 鍵盤問題（Caps Lock 卡住）

VNC 輸入特殊字元常出問題（`@` → `2`、`&&` → `77`）。

**解法：**
1. 關閉 VNC 視窗重開（重設鍵盤狀態）
2. 用 Python 避免直接輸入特殊字元：
```bash
# 用 base64 寫入 authorized_keys（繞過鍵盤問題）
python3 -c "import base64; open('/root/.ssh/authorized_keys','w').write(base64.urlsafe_b64decode('c3NoLWVkMjU1MTkgQUFBQUMzTnphQzFsWkRJMU5URTVBQUFBSUs0aWhQaWVrbm5kK204VlZXRW05U092TFkxSlBYVGxnbXVwMUQrYWl2RFAgdXNlckBERVNLVE9QLU4zMzU5NUkK').decode()); print('OK')"
```
3. 最終解法：用 Rescue Mode（見上方）

---

## 附錄：SSH 複雜 bash 指令用 base64 傳輸（避免引號地獄）

**問題**：透過 SSH 執行包含單引號 `'`（如 `grep -E '(pattern)'`）的複雜 bash 腳本時，
`bash -lc "..."` 包裝後單引號失效，`(` 會觸發 `syntax error near unexpected token '('`。

**解法**（PowerShell 端）：
```powershell
$script = @"
set -eu
grep -E '[A-Z_]*(:-|:=)' /path/to/file
"@
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($script))
$cmd = "echo $b64 | base64 -d | bash -l"
& ssh -i $keyPath "root@$host" $cmd
```

**原則**：凡腳本含單引號、`grep -E`、awk、sed 等可能有 `(` 的複雜邏輯，
一律用 base64 pipe，不要用 `bash -lc "..."` 拼接字串。
參考實作：`scripts/check-backup-health.ps1`（lines 86-88）。
