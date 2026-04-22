# Supabase 自架維運手冊

> Owner: awarewaveai · VPS: 5.223.93.113 (Hetzner `wordpress-ubuntu-4gb-sin-1`)
> 密鑰不入庫 — 本文件不含任何明文 token/password，請從 vault / `mcp/user-env.ps1` 取得。

---

## 1. 架構總覽

```
本機（Windows）
  └─ SSH tunnel（open-supabase-ssh-tunnel.ps1）
       ├─ localhost:5432 → VPS 127.0.0.1:5432  (Postgres)
       ├─ localhost:3000 → VPS 127.0.0.1:3000  (Studio)
       └─ localhost:8000 → VPS 127.0.0.1:8000  (Kong API)

網際網路（Cloudflare DNS-only → nginx SSL termination）
  ├─ https://supabase.aware-wave.com  → VPS 127.0.0.1:8000  (Kong, JWT 保護)
  └─ https://studio.aware-wave.com   → VPS 127.0.0.1:3000  (Studio, basic auth)
```

**Docker stack 位置**：`/root/supabase/docker/`
**compose 啟動**：`cd /root/supabase/docker && docker compose up -d`

---

## 2. Containers

| Container | 功能 | Port（VPS 內部） |
|---|---|---|
| `supabase-db` | PostgreSQL 15 | 127.0.0.1:5432 |
| `supabase-pooler` | Supavisor 連線池 | 127.0.0.1:6543 |
| `supabase-kong` | API Gateway | 127.0.0.1:8000 |
| `supabase-studio` | 管理 UI | 127.0.0.1:3000 |
| `supabase-auth` | GoTrue auth | internal |
| `supabase-rest` | PostgREST | internal |
| `supabase-storage` | Storage API | internal |
| `supabase-meta` | Metadata API | internal |
| `supabase-analytics` | Logflare | internal |
| `supabase-vector` | pgvector / log | internal |
| `supabase-imgproxy` | 圖片轉換 | internal |
| `supabase-edge-functions` | Deno Edge Functions | internal |
| `realtime-dev.supabase-realtime` | Realtime WS | internal |

> 所有對外 port 均綁定 `127.0.0.1`（非 `0.0.0.0`），安全加固後設定。

---

## 3. 對外存取

### 3.1 Studio UI（人類用）

- URL：`https://studio.aware-wave.com`
- 驗證：HTTP Basic Auth
- 帳密：見 `C:\Users\user1115\.claude\projects\d--Work\memory\reference_vps_access.md`
- SSL 到期：2026-07-20（certbot 自動續約）

### 3.2 Kong REST API（程式 / AI 用）

- Base URL：`https://supabase.aware-wave.com`
- 驗證：Header `Authorization: Bearer <SERVICE_ROLE_KEY>` + `apikey: <SERVICE_ROLE_KEY>`
- 密鑰：`SUPABASE_B_SERVICE_ROLE_KEY`（vault）
- 範例：
  ```http
  GET https://supabase.aware-wave.com/rest/v1/<table>?select=*
  Authorization: Bearer <SERVICE_ROLE_KEY>
  apikey: <SERVICE_ROLE_KEY>
  ```

### 3.3 Postgres 直連（需 SSH tunnel）

- 先開 tunnel：
  ```powershell
  .\scripts\open-supabase-ssh-tunnel.ps1 -Background
  ```
- 連線：`postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres`
- 密鑰：`SUPABASE_B_POSTGRES_DSN`（vault）
- 關閉 tunnel：`Get-Process ssh | Stop-Process`

---

## 4. AI 存取方式

### 4.1 REST API（不需 tunnel，隨時可用）

透過 `awarewave-ops` MCP → `supabase_b` 服務：
```
call_service_api: service=supabase_b, method=GET, path=/rest/v1/<table>?select=*
```

### 4.2 Postgres MCP（SQL 完整存取，需 tunnel）

1. 開 tunnel：`.\scripts\open-supabase-ssh-tunnel.ps1 -Background`
2. MCP server：`supabase-b-postgres`（`@modelcontextprotocol/server-postgres`）
3. 使用 DSN：`SUPABASE_B_POSTGRES_DSN`

---

## 5. 密鑰清單

| 變數名稱 | 用途 | 存放位置 |
|---|---|---|
| `SUPABASE_B_URL` | Kong REST base URL | vault / user-env.ps1 |
| `SUPABASE_B_SERVICE_ROLE_KEY` | REST API 全權 JWT | vault / user-env.ps1 |
| `SUPABASE_B_POSTGRES_DSN` | Postgres 直連 DSN | vault / user-env.ps1 |
| `SUPABASE_AUTH_BEARER_TOKEN` | 雲端 Supabase MCP（未用） | vault |
| JWT_SECRET | token 簽發 secret | VPS `/root/supabase/docker/.env` |
| S3_PROTOCOL_ACCESS_KEY_ID/SECRET | Storage S3 協議 | VPS `.env` |

> **密鑰輪替**：見第 7 節。輪替後需重跑 `mcp/user-env.ps1` + `npm run mcp:governance`。

---

## 6. 日常維運指令

### 查狀態
```bash
# SSH 進 VPS
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113

# 所有 Supabase container 狀態
docker ps | grep supabase

# 查 log（例如 kong）
docker logs supabase-kong --tail=50
```

### 重啟單一服務
```bash
cd /root/supabase/docker
docker compose restart supabase-kong
docker compose restart supabase-studio
docker compose restart supabase-db
```

### 重啟整個 stack
```bash
cd /root/supabase/docker
docker compose down && docker compose up -d
```

### 更新 .env 後重啟
```bash
cd /root/supabase/docker
# 修改 .env 後
docker compose up -d --force-recreate
```

---

## 7. 密鑰輪替 SOP

### JWT 輪替（ANON_KEY / SERVICE_ROLE_KEY）

1. SSH 進 VPS
2. 產生新 JWT_SECRET：`openssl rand -hex 40`
3. 更新 `/root/supabase/docker/.env`：`JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY`
4. `docker compose up -d --force-recreate`
5. 本機更新 `mcp/user-env.ps1` → `SUPABASE_B_SERVICE_ROLE_KEY`
6. 執行 `mcp/user-env.ps1` → `npm run mcp:governance`
7. 更新 `memory/reference_vps_access.md`

### Postgres 密碼輪替

1. 新密碼：`openssl rand -base64 32`
2. 更新 VPS `.env` → `POSTGRES_PASSWORD`
3. 在 DB 執行：`ALTER USER postgres PASSWORD '<new>';`（對所有 8 個 DB 用戶執行）
4. `docker compose up -d --force-recreate`
5. 更新 `mcp/user-env.ps1` → `SUPABASE_B_POSTGRES_DSN`

---

## 8. nginx 設定

設定檔：`/etc/nginx/sites-available/supabase-subdomains`（VPS）
Repo 來源：`lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/supabase-subdomains.conf`

SSL 憑證路徑：
- `/etc/letsencrypt/live/supabase.aware-wave.com/fullchain.pem`
- `/etc/letsencrypt/live/supabase.aware-wave.com/privkey.pem`

手動續約：
```bash
certbot renew --nginx
```

---

## 9. 備份

Postgres 備份（手動）：
```bash
docker exec supabase-db pg_dumpall -U postgres > /root/backup-$(date +%Y%m%d).sql
```

Volume 備份：
```bash
docker run --rm -v supabase_db-config:/data -v /root/backups:/backup \
  ubuntu tar czf /backup/supabase-db-$(date +%Y%m%d).tar.gz /data
```

---

## 10. 相關文件

- [hetzner-full-stack-self-host-runbook.md](hetzner-full-stack-self-host-runbook.md) — 整機部署流程
- [supabase-self-hosted-cutover-checklist.md](supabase-self-hosted-cutover-checklist.md) — 換機遷移
- [mcp/SERVICE_MATRIX.md](../../mcp/SERVICE_MATRIX.md) — AI 工具分工表
- `memory/reference_vps_access.md` — 密碼/金鑰 vault（本機 Claude memory）
- `scripts/open-supabase-ssh-tunnel.ps1` — SSH tunnel 腳本

---

_建立：2026-04-22 · 由 Claude Sonnet 4.6 根據實機狀態產生_
