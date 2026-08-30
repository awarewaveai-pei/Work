# Uptime Kuma Monitor Fix

> **🚨 2026-08-30**：下文「SSH 進 EU VPS」`204.168.175.41` 已失效（主機刪除退租）。改連 ks-aw-01：`ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@149.202.64.114`。Kuma 容器現跑在同一台機器上。

**症狀**：Telegram `/health` 顯示 CRITICAL / open incidents，但服務容器本身 healthy。  
**根因**：Monitor URL 或 headers 設定錯誤，導致 Kuma 收到 403/404/timeout。

---

## 重要限制

**Cloudflare-proxied URL 無法從 EU VPS 直接監控**  
EU VPS → `https://app.aware-wave.com/...` 會被 Cloudflare Bot Fight Mode 擋（403 Managed Challenge）。  
正確做法：直打 SG raw IP + 補 `Host` header + 補 auth header。

**不要把 SG endpoint-alert.sh 和 Uptime Kuma 混在一起。**  
SG 本機的 `awarewave-endpoint-alert.service` 應該打 `127.0.0.1` / 本機 port，避免
`SG -> Cloudflare -> SG` hairpin timeout。EU Uptime Kuma 才負責外部/public 視角與 SSL。

---

## 修復步驟

### 1. SSH 進 EU VPS
```bash
ssh -i ~/.ssh/hetzner_trigger root@204.168.175.41
```

### 2. 找出有問題的 monitor
```bash
sqlite3 /var/lib/docker/volumes/uptime-kuma/_data/kuma.db \
  "SELECT id, name, url, headers FROM monitor WHERE active=1;"
```

### 3. 確認正確的 endpoint 可通
```bash
# 從 EU VPS 測試（模擬 Kuma 發的請求）
curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: app.aware-wave.com" \
  -H "x-ops-proxy-auth: $(grep OPS_PROXY_SHARED_SECRET /root/.env 2>/dev/null | cut -d= -f2)" \
  http://5.223.93.113/api/ops/summary
# 預期：200
```

> 若不知道 `x-ops-proxy-auth` 值，從 SG VPS 的 `.env`，或本機 `mcp\user-env.ps1` 的 `OPS_PROXY_SHARED_SECRET` 取得。  
> **不要**用 `secrets-vault.ps1 -Action get`：那是確認存在用，只印遮罩值。

### 4. 備份 DB 再修改
```bash
cp /var/lib/docker/volumes/uptime-kuma/_data/kuma.db \
   /var/lib/docker/volumes/uptime-kuma/_data/kuma.db.bak.$(date +%Y%m%d)

sqlite3 /var/lib/docker/volumes/uptime-kuma/_data/kuma.db \
  "UPDATE monitor SET
     url     = 'http://5.223.93.113/api/ops/summary',
     headers = '{\"Host\":\"app.aware-wave.com\",\"x-ops-proxy-auth\":\"<SECRET>\"}'
   WHERE id = <MONITOR_ID>;"
```

### 5. 重啟 Kuma 讓 DB 生效
```bash
docker restart uptime-kuma
sleep 10
```

### 6. 驗證
```bash
sqlite3 /var/lib/docker/volumes/uptime-kuma/_data/kuma.db \
  "SELECT status, msg, time FROM heartbeat WHERE monitor_id=<ID> ORDER BY time DESC LIMIT 5;"
# 預期：status=1, msg='200 - OK'，連續 5 筆
```

---

## 其他 monitor 設定原則

| Endpoint 類型 | 正確 URL | 需要 headers？ |
|---|---|---|
| `/api/ops/summary` | `http://5.223.93.113/api/ops/summary` | ✅ `Host` + `x-ops-proxy-auth` |
| `/health`（SG nginx）| `http://5.223.93.113/health` | ❌ 不需要 |
| Supabase / Trigger / n8n | 直打 EU VPS 內部 127.0.0.1:PORT | 視 endpoint 而定 |
| **禁止** | `https://app.aware-wave.com/...` 從 EU VPS 監控 | Cloudflare 會擋 |

## SG endpoint-alert 正確分工

`/etc/default/awarewave-endpoint-alert.local` 是 SG 本機 drop-in，sync 腳本不覆蓋。

目前 fast checks 應為本機端口：

```bash
CHECK_URLS="http://127.0.0.1:8080/ http://127.0.0.1:3002/api/ops/summary http://127.0.0.1:3001/health"
```

EU dead-man canary 保留一條 public URL，但避免 `/` redirect chain：

```bash
CHECK_URLS_SLOW="https://uptime.aware-wave.com/api/entry-page"
```

驗證：

```bash
systemctl start awarewave-endpoint-alert.service
journalctl -u awarewave-endpoint-alert.service --since "5 minutes ago" --no-pager
cat /var/lib/awarewave-alert/last_state
cat /var/lib/awarewave-alert/fail_streak
```

預期：service `SUCCESS`、`last_state=ok`、`fail_streak=0`。

---

## 歷史事件

| 日期 | 事件 | 持續時間 | 根因 |
|------|------|---------|------|
| 2026-05-14~15 | Next Admin CRITICAL (monitor ID 7) | 17h 47m | URL 缺 Host+auth header，Uptime Kuma restart 後症狀暫緩，但問題未根治 |
| 2026-05-15 | Netdata EU blip | 6 min | 暫時性，自動恢復，無需處理 |
