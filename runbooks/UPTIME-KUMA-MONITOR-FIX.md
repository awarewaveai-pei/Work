# Uptime Kuma Monitor Fix

> **現況（2026-09-01）**：Uptime Kuma 與所有受監測服務已整併至單一 `ks-aw-01`。Kuma 的 persistent DB 位於 container 的 `/app/data/kuma.db`；管理面經 `uptime.aware-wave.com` 反向代理。下文若仍出現 SG／EU、舊 IP 或舊機 loopback，均為歷史脈絡，**不可照做**。

**症狀**：Telegram `/health` 顯示 CRITICAL / open incidents，但服務容器本身 healthy。  
**根因**：Monitor URL 或 headers 設定錯誤，導致 Kuma 收到 403/404/timeout。

---

## 重要限制

**HTTP monitor 一律使用現役 canonical hostname，不得指向舊 Hetzner raw IP 或舊機 loopback port。**
目前 Kuma 與服務同機，HTTP monitors 仍刻意驗證 public URL，作為外部可達性與 TLS 視角；若 endpoint 需要認證，從現役 secret store 取得 header，切勿把值寫進文件或 shell history。

**不要把 KS-6 endpoint-alert 和 Uptime Kuma 混在一起。**
`awarewave-endpoint-alert.timer` 是現役主機的 local fast checks，並上報 Kuma 的 push monitor `AwareWave endpoint-alert (KS-6)`；Kuma 的 HTTP monitors 則負責 public 視角與 SSL。

---

## 修復步驟

### 1. SSH 進現役 ks-aw-01
```bash
# 使用目前的 ks-aw-01 SSH alias/連線資訊；不要重用舊 EU／SG 的 host 或 IP。
```

### 2. 找出有問題的 monitor
```bash
sudo docker exec uptime-kuma sqlite3 /app/data/kuma.db \
  "SELECT id,name,type,active,COALESCE(url,'(push/local)') AS target,
          CASE WHEN headers IS NULL THEN 'no' ELSE 'configured' END AS headers
   FROM monitor WHERE active=1 ORDER BY id;"
```

### 3. 確認正確的 endpoint 可通
```bash
# 從 Kuma container 以相同 canonical URL 做唯讀測試。
sudo docker exec uptime-kuma curl -fsS -o /dev/null -w "%{http_code}\\n" \
  https://<current-canonical-hostname>/<health-path>
# 預期：該 monitor 設定的成功狀態碼
```

> 有認證 header 的 monitor，保留在 Kuma 設定／現役 secret store；不可為了手動 curl 將 secret 貼到 shell history、文件或 chat。

### 4. 備份 DB 再修改
```bash
sudo docker exec uptime-kuma sqlite3 /app/data/kuma.db \
  ".backup '/app/data/kuma.db.bak-<YYYYMMDD>-<reason>'"

# 首選 Kuma UI 修改；只有 UI 無法使用且 SQL 已 review 時，才用 `BEGIN IMMEDIATE` 的短 transaction 改最小欄位。不得從本文件複製通用 re-target SQL，先以本節的唯讀 query 確認 monitor ID、現役 URL、預期 status 與 rollback backup。
```

### 5. 重啟 Kuma 讓 DB 生效
```bash
sudo docker restart uptime-kuma
sudo docker inspect -f '{{.State.Health.Status}}' uptime-kuma  # 應為 healthy
```

### 6. 驗證
```bash
sudo docker exec uptime-kuma sqlite3 /app/data/kuma.db \
  "SELECT status, msg, time FROM heartbeat WHERE monitor_id=<ID> ORDER BY time DESC LIMIT 5;"
# 預期：status=1, msg='200 - OK'，連續 5 筆
```

---

## 其他 monitor 設定原則

| Endpoint 類型 | 正確 URL | 需要 headers？ |
|---|---|---|
| Public HTTP service | 現役 canonical hostname + 明確 health path | 依 monitor 原設定；不得在文件明碼記錄 secret |
| Push / local service | Kuma push monitor；由現役 KS-6 timer 上報 | 不適用 |
| Supabase / Trigger / n8n | 各自現役 public hostname + health/login path | 視 endpoint 而定 |
| **禁止** | 已撤除 Hetzner IP、舊機 `127.0.0.1:PORT`、名稱 `(EU)`／`(SG)` | 會指向不存在的拓樸或製造錯誤歸屬 |

## KS-6 endpoint-alert 正確分工

`/etc/default/awarewave-endpoint-alert.local` 是 KS-6 本機 drop-in，sync 腳本不覆蓋。

不直接手動覆寫 `CHECK_URLS`；先讀現役 drop-in 與 service unit，確認 URL 都是 KS-6 上實際存在的 listener：

```bash
sudo systemctl cat awarewave-endpoint-alert.service
sudo sed -n '1,160p' /etc/default/awarewave-endpoint-alert.local
```

驗證：

```bash
systemctl is-active awarewave-endpoint-alert.timer
systemctl is-enabled awarewave-endpoint-alert.timer
journalctl -u awarewave-endpoint-alert.service --since "5 minutes ago" --no-pager
```

預期：timer 為 `active`、`enabled`，最近執行無失敗；Kuma 對應的 push monitor 為 UP。

---

## 歷史事件

| 日期 | 事件 | 持續時間 | 根因 |
|------|------|---------|------|
| 2026-05-14~15 | Next Admin CRITICAL (monitor ID 7) | 17h 47m | URL 缺 Host+auth header，Uptime Kuma restart 後症狀暫緩，但問題未根治 |
| 2026-05-15 | Netdata EU blip | 6 min | 暫時性，自動恢復，無需處理 |
