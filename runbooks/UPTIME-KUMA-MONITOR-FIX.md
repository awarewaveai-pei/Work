# Uptime Kuma Monitor Fix

**症狀**：Telegram `/health` 顯示 CRITICAL / open incidents，但服務容器本身 healthy。  
**根因**：Monitor URL 或 headers 設定錯誤，導致 Kuma 收到 403/404/timeout。

---

## 重要限制

**Cloudflare-proxied URL 無法從 EU VPS 直接監控**  
EU VPS → `https://app.aware-wave.com/...` 會被 Cloudflare Bot Fight Mode 擋（403 Managed Challenge）。  
正確做法：直打 SG raw IP + 補 `Host` header + 補 auth header。

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

> 若不知道 `x-ops-proxy-auth` 值，從 SG VPS 的 `.env` 或 vault 取得：  
> `scripts/secrets-vault.ps1 -Action get -Name OPS_PROXY_SHARED_SECRET`

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

---

## 歷史事件

| 日期 | 事件 | 持續時間 | 根因 |
|------|------|---------|------|
| 2026-05-14~15 | Next Admin CRITICAL (monitor ID 7) | 17h 47m | URL 缺 Host+auth header，Uptime Kuma restart 後症狀暫緩，但問題未根治 |
| 2026-05-15 | Netdata EU blip | 6 min | 暫時性，自動恢復，無需處理 |
