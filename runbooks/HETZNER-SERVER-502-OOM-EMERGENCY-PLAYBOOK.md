# Hetzner Server 502 / OOM 緊急處理手冊

**伺服器：** `wordpress-ubuntu-4gb-sin-1` — IP `5.223.93.113`
**網站：** `trigger.aware-wave.com`

---

## 症狀：502 Bad Gateway

Cloudflare ✅ → Hetzner Host ❌

**根本原因：** Docker 容器被 OOM Killer 殺掉（記憶體不足）。

---

## Step 1 — 立即診斷

```powershell
# Windows PowerShell 連線
ssh -i "$env:USERPROFILE\.ssh\hetzner_trigger" root@5.223.93.113
```

```bash
# 伺服器上確認容器狀態
cd /root/Work/lobster-factory/infra/trigger
docker compose ps

# 看 OOM 記錄
dmesg -T | grep -i "killed process\|out of memory" | tail -20

# 記憶體狀況
free -h && swapon --show
```

---

## Step 2 — 快速修復（重啟容器）

容器有 `restart: unless-stopped`，通常會自動重啟。如果沒有：

```bash
cd /root/Work/lobster-factory/infra/trigger
docker compose up -d
```

---

## Step 3 — 如果 SSH 連不進去

### 方法 A：Hetzner VNC Console
1. 打開 [console.hetzner.cloud](https://console.hetzner.cloud)
2. Servers → `wordpress-ubuntu-4gb-sin-1` → Console（>_ 圖示）
3. 登入：`root` / 密碼見下方

### 方法 B：Hetzner API 重設密碼
```bash
# 重設 root 密碼
curl -X POST \
  -H "Authorization: Bearer <HETZNER_API_TOKEN>" \
  -H "Content-Type: application/json" \
  https://api.hetzner.cloud/v1/servers/125887340/actions/reset_password
# 回傳新密碼，用 VNC 登入
```

### 方法 C：Rescue Mode（最可靠，authorized_keys 壞掉時用）
```bash
# 1. 啟用 rescue mode
curl -X POST \
  -H "Authorization: Bearer <HETZNER_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"linux64"}' \
  https://api.hetzner.cloud/v1/servers/125887340/actions/enable_rescue
# 記下回傳的 root_password

# 2. 重開機
curl -X POST \
  -H "Authorization: Bearer <HETZNER_API_TOKEN>" \
  https://api.hetzner.cloud/v1/servers/125887340/actions/reboot

# 3. 等 30 秒後用 rescue 密碼 SSH 進去
ssh root@5.223.93.113  # 輸入 rescue 密碼

# 4. 掛載主系統、修復 authorized_keys
mount /dev/sda1 /mnt
mkdir -p /mnt/root/.ssh
chmod 700 /mnt/root/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK4ihPieknnd+m8VVWEm9SOvLY1JPXTlgmup1D+aivDP user@DESKTOP-N33595I' > /mnt/root/.ssh/authorized_keys
chmod 600 /mnt/root/.ssh/authorized_keys
umount /mnt

# 5. 關 rescue、重開機回正常系統
curl -X POST -H "Authorization: Bearer <HETZNER_API_TOKEN>" \
  https://api.hetzner.cloud/v1/servers/125887340/actions/disable_rescue
curl -X POST -H "Authorization: Bearer <HETZNER_API_TOKEN>" \
  https://api.hetzner.cloud/v1/servers/125887340/actions/reboot
```

---

## 伺服器重要資訊

| 項目 | 值 |
|------|-----|
| IP | `5.223.93.113` |
| Server ID | `125887340` |
| SSH Key (private) | `C:\Users\USER\.ssh\hetzner_trigger` |
| SSH Public Key | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK4ihPieknnd+m8VVWEm9SOvLY1JPXTlgmup1D+aivDP user@DESKTOP-N33595I` |
| Root 密碼 | `UcxTUVkPdkfP`（原始）/ `PLxPNRueadaw`（2026-04-20 重設） |
| Hetzner API Token | 見 `.env` 或 secrets vault |
| Repo 路徑（伺服器） | `/root/Work/lobster-factory/infra/trigger/` |

---

## ClickHouse OOM 永久修復

**問題：** clickhouse 預設無記憶體上限，超出 Docker `mem_limit` 被 cgroup OOM 殺掉。

**已套用的修復：**
- `docker-compose.yml`: `mem_limit: 768m` → `mem_limit: 1024m`
- `clickhouse/override.xml`: `max_server_memory_usage: 800000000`（800MB，低於 1024m 上限）

```bash
# 確認設定已套用
docker inspect trigger-clickhouse | grep -i memory
cat /root/Work/lobster-factory/infra/trigger/clickhouse/override.xml
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
