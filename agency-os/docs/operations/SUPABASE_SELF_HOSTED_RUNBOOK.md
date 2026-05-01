# Supabase Self-Hosted Runbook

> Owner: `awarewaveai`  
> **Supabase stack (EU)**: `204.168.175.41` (Hetzner Helsinki; SG host `5.223.93.113` no longer carries `/root/supabase` compose — lobster-phase1 only).  
> Secrets policy: live tokens and passwords stay in vault or machine-local env only; do not commit them into repo-tracked files.

---

## 1. Topology

Windows clients reach the self-hosted stack in two ways:

- SSH tunnel via `.\scripts\open-supabase-ssh-tunnel.ps1`
  - `localhost:5432` -> VPS `127.0.0.1:5432` (Postgres)
  - `localhost:3000` -> VPS `127.0.0.1:3000` (Studio)
  - `localhost:8000` -> VPS `127.0.0.1:8000` (Kong API)
- Public HTTPS endpoints through Cloudflare DNS-only + nginx TLS termination
  - `https://supabase.aware-wave.com` -> VPS `127.0.0.1:8000` (Kong API)
  - `https://studio.aware-wave.com` -> VPS `127.0.0.1:3000` (Studio, Basic Auth)

Docker stack path (EU): `/root/supabase/` (`docker-compose.yml` lives next to `.env`; not a `git` checkout — **`git pull` does not apply** unless you manage deploy from a repo).  
Compose command: `cd /root/supabase && docker compose up -d`

---

## 2. Containers

| Container | Purpose | VPS Port |
|---|---|---|
| `supabase-db` | PostgreSQL 15 | `127.0.0.1:5432` |
| `supabase-pooler` | Supavisor pooler | `127.0.0.1:6543` |
| `supabase-kong` | API gateway | `127.0.0.1:8000` |
| `supabase-studio` | Admin UI | `127.0.0.1:3000` |
| `supabase-auth` | GoTrue auth | internal |
| `supabase-rest` | PostgREST | internal |
| `supabase-storage` | Storage API | internal |
| `supabase-meta` | Metadata API | internal |
| `supabase-analytics` | Logflare | internal |
| `supabase-vector` | pgvector / logs | internal |
| `supabase-imgproxy` | Image proxy | internal |
| `supabase-edge-functions` | Deno Edge Functions | internal |
| `realtime-dev.supabase-realtime` | Realtime WS | internal |

All exposed ports should stay bound to `127.0.0.1`, not `0.0.0.0`.

---

## 3. Access Paths

### 3.1 Studio UI

- URL: `https://studio.aware-wave.com`
- Auth: HTTP Basic Auth
- Credentials source: `memory/reference_vps_access.md`

### 3.2 Kong REST API

- Base URL: `https://supabase.aware-wave.com`
- Headers:

```http
Authorization: Bearer <SERVICE_ROLE_KEY>
apikey: <SERVICE_ROLE_KEY>
```

- Machine-local env:
  - `SUPABASE_AWAREWAVE_URL`
  - `SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY`

Example:

```http
GET https://supabase.aware-wave.com/rest/v1/<table>?select=*
Authorization: Bearer <SERVICE_ROLE_KEY>
apikey: <SERVICE_ROLE_KEY>
```

### 3.3 Postgres via SSH Tunnel

Start tunnel:

```powershell
.\scripts\open-supabase-ssh-tunnel.ps1 -Background
```

#### 3.3.1 你連到的是 **Supavisor（pooler）**，不是裸露的 `supabase-db`

在官方 **`docker-compose.yml` 版型**（與 **`lobster-factory/infra/supabase/docker-compose.yml`** 對齊思考）裡，**對外綁在 EU 宿主機 `127.0.0.1:5432` 的通常是 `supabase-pooler`（Supavisor）**，**不是**把 `supabase-db` 裸露在宿主機 `:5432`。

因此經過 `open-supabase-ssh-tunnel.ps1` 打到本機 `localhost:5432` 的流量，多半是 **進 pooler**。Supavisor 會用形如 **`postgres.<POOLER_TENANT_ID>`** 的使用者名稱做租戶路由；若只看見 **`Tenant or user not found`**，先核對 VPS **`/root/supabase/.env`** 的 **`POOLER_TENANT_ID`**（與 URI 使用者名 **`postgres`** 後半段一致）。

較安全的 **MCP／IDE DSN（經預設 tunnel）** 形狀（密碼仍只放 vault／`user-env`，**不入庫**）：

```text
postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres
```

若要 **繞過 pooler**、直接用角色 **`postgres`** 連資料庫，必須在 **EU** 另行把 **`supabase-db` 綁回 `127.0.0.1`（建議次要埠，例如 15432）** 並在 SSH `-L` 多轉一條次要本機埠—此為進階 hardening／操作話題，本篇不強制。

#### 3.3.2 仍舊的備援形狀（僅在未啟用 pooler 對外、或你已改埠對 `db` 時）

```text
postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres
```

Machine-local env:

- Preferred: `SUPABASE_AWAREWAVE_POSTGRES_DSN`
- Legacy fallback: `SUPABASE_B_POSTGRES_DSN`

#### 3.3.3 Smoke（本機）

```powershell
npm run smoke:supabase-tunnel
npm run smoke:supabase-tunnel -- --sql
```

`-sql` 需 **`SUPABASE_AWAREWAVE_POSTGRES_DSN`** 已載入（與 MCP 同源）；預期最後 **`SQL smoke: SELECT 1 ok`**。

Stop tunnel:

```powershell
Get-Process ssh | Stop-Process
```

---

### 3.4 Supavisor auth：`permission denied for view pg_shadow` / `pgbouncer.get_auth`

症狀：TCP `5432/3000/8000` 已通，`smoke --sql` 或客戶端連 pooler 時出現 **`pgbouncer.get_auth`** 失敗、`pg_shadow` 權限錯誤。

原因：pooler 會在 Postgres 內呼叫 **`pgbouncer.get_auth(text)`** 查密碼；此函式必須對 **`pg_catalog.pg_shadow`** 以 **`SECURITY DEFINER`** 並由 **superuser（通常 `postgres`）owned**，與 **[supabase/postgres：`pgbouncer_auth_schema.sql`](https://github.com/supabase/postgres/blob/develop/ansible/files/pgbouncer_config/pgbouncer_auth_schema.sql)** 一致。若過去手動變更 owner／定義不完整，會變成你看到的 **`permission denied for view pg_shadow`**。

**在 EU**（備份／維護窗後），以 superuser 進 **`postgres` 資料庫修復**。與 **[supabase/postgres：`pgbouncer_auth_schema.sql`](https://github.com/supabase/postgres/blob/develop/ansible/files/pgbouncer_config/pgbouncer_auth_schema.sql)** 同構；請先 `\df pgbouncer.*` 確認現有簽章。

建議用互動式 `psql` 貼上（避免 heredoc／Windows 終端轉義問題）：

```bash
docker exec -it supabase-db psql -U postgres -d postgres
```

在 `psql` 內：

```sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS pgbouncer AUTHORIZATION postgres;

CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename TEXT)
RETURNS TABLE(username TEXT, password TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT usename::TEXT, passwd::TEXT
  FROM pg_catalog.pg_shadow
  WHERE usename = p_usename;
END;
$$;

ALTER FUNCTION pgbouncer.get_auth(TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION pgbouncer.get_auth(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgbouncer') THEN
    GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(TEXT) TO pgbouncer;
  END IF;
END $$;

COMMIT;
```

驗證：

```sql
SELECT n.nspname, p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'pgbouncer' AND p.proname = 'get_auth';
```

預期：**owner = postgres**、`prosecdef = t`。

修完後通常 **無需重建** `supabase-db`；若 pooler 仍報舊錯：在 **`/root/supabase`** 執行 `docker compose restart supabase-pooler`。

---

## 4. AI Access Model

### 4.1 REST Path

Standard path for all AI clients:

- `awarewave-ops` MCP -> `supabase_awarewave`

Example:

```text
call_service_api: service=supabase_awarewave, method=GET, path=/rest/v1/<table>?select=*
```

This path does not require the SSH tunnel.

### 4.2 SQL Path

Standard SQL path:

1. Start tunnel: `.\scripts\open-supabase-ssh-tunnel.ps1 -Background`
2. Use MCP server: `supabase-awarewave-postgres`
3. Wrapper script: `scripts/run-postgres-mcp.ps1`
4. DSN env: `SUPABASE_AWAREWAVE_POSTGRES_DSN`

Do not configure self-hosted AwareWave Supabase through `mcp.supabase.com`; that hosted MCP is for Supabase Cloud projects only.

---

## 5. Secret Inventory

| Env Var / Secret | Meaning | Source |
|---|---|---|
| `SUPABASE_AWAREWAVE_URL` | Kong REST base URL | vault / user env |
| `SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY` | REST API service role key | vault / user env |
| `SUPABASE_AWAREWAVE_POSTGRES_DSN` | Postgres DSN for MCP / SQL tools | vault / user env |
| `JWT_SECRET` | JWT signing secret | VPS `/root/supabase/.env` |
| `S3_PROTOCOL_ACCESS_KEY_ID` / `S3_PROTOCOL_ACCESS_KEY_SECRET` | Storage S3 access | VPS `.env` |

When keys rotate:

1. Update vault or machine-local env.
2. Rerun `npm run mcp:governance` if shared MCP outputs depend on the changed env.

---

## 6. Common Ops

SSH to VPS:

```bash
ssh -i ~/.ssh/hetzner_trigger root@204.168.175.41
```

List containers:

```bash
docker ps | grep supabase
```

Check Kong logs:

```bash
docker logs supabase-kong --tail=50
```

Restart selected services:

```bash
cd /root/supabase
docker compose restart supabase-kong
docker compose restart supabase-studio
docker compose restart supabase-db
```

Restart full stack:

```bash
cd /root/supabase
docker compose down && docker compose up -d
```

### SSH tunnel: `channel N: open failed: administratively prohibited`

本機跑 **`scripts/open-supabase-ssh-tunnel.ps1`** 時若出現此行，代表 **EU 的 `sshd` 拒絕 `-L` 本機端口轉發**（TCP forward）。

Common causes:

- **`AllowTcpForwarding no`** (global or inside a **`Match`** block — `Match` can override loose defaults).
- **`PermitOpen`** allowlist omitting **`127.0.0.1:5432`**, **`127.0.0.1:3000`**, **`127.0.0.1:8000`** (spaces between host:port pairs; see `man sshd_config`).
- Rare: **`DisableForwarding yes`** — must be cleared for `-L` to work.

**在 EU VPS（已 SSH 登入）檢查並修正**（需 root）：

```bash
grep -nE '^(AllowTcpForwarding|PermitOpen|GatewayPorts|DisableForwarding|Match)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
```

- 若為 **`AllowTcpForwarding no`**（含 **`Match User …`** 區塊內）→ 改為 **`AllowTcpForwarding yes`** 或刪除該行採預設 **yes**。
- 若有 **`PermitOpen`** 且過窄 → 註解掉、改寬，或明確列出：`127.0.0.1:5432 127.0.0.1:3000 127.0.0.1:8000`。
- 若設定 **`AllowStreamLocalForwarding no`** 僅影響 Unix socket 轉發；Supabase 腳本使用 TCP **`-L`**，仍以 **`AllowTcpForwarding`** / **`PermitOpen`** 為主。

**客戶端（本機）**： tunnel 腳本已帶 **`ExitOnForwardFailure=yes`**，轉發被拒時會**快速失敗**，不必猜測「以為連上但其實沒轉發」。

然後：

```bash
sshd -t && systemctl reload ssh
```

**穩定 smoke（本機，tunnel 已開）** — monorepo 根：

```powershell
npm ci
npm run smoke:supabase-tunnel
# 若已設定 SUPABASE_AWAREWAVE_POSTGRES_DSN（vault / user-env）：
npm run smoke:supabase-tunnel -- --sql
```

**不改 sshd 的繞道**：直接用 **`https://studio.aware-wave.com`**（不需 tunnel）；SQL 工具仍建議 tunnel + DSN 或 REST 路徑（`awarewave-ops`）。

After editing `.env`:

```bash
cd /root/supabase
docker compose up -d --force-recreate
```

---

## 7. Rotation SOP

### 7.1 JWT Rotation

1. SSH to VPS.
2. Generate a new secret: `openssl rand -hex 40`
3. Update `/root/supabase/.env`:
   - `JWT_SECRET`
   - `ANON_KEY`
   - `SERVICE_ROLE_KEY`
4. Recreate containers:

```bash
docker compose up -d --force-recreate
```

5. Update machine-local env / vault for:
   - `SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY`
6. Rerun:

```powershell
npm run mcp:governance
```

7. Update any private access notes outside git.

### 7.2 Postgres Password Rotation

1. Generate a new password: `openssl rand -base64 32`
2. Update VPS `.env` -> `POSTGRES_PASSWORD`
3. Update DB users as needed
4. Recreate containers
5. Update `SUPABASE_AWAREWAVE_POSTGRES_DSN` in vault / machine-local env

---

## 8. Nginx

Live config:

- `/etc/nginx/sites-available/supabase-subdomains.conf`

Repo source:

- `lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/supabase-subdomains.conf`

TLS files:

- `/etc/letsencrypt/live/supabase.aware-wave.com/fullchain.pem`
- `/etc/letsencrypt/live/supabase.aware-wave.com/privkey.pem`

Renew:

```bash
certbot renew --nginx
```

---

## 9. Backups

Postgres logical backup:

```bash
docker exec supabase-db pg_dumpall -U postgres > /root/backup-$(date +%Y%m%d).sql
```

Volume backup example:

```bash
docker run --rm -v supabase_db-config:/data -v /root/backups:/backup \
  ubuntu tar czf /backup/supabase-db-$(date +%Y%m%d).tar.gz /data
```

---

## 10. Related

- [hetzner-full-stack-self-host-runbook.md](hetzner-full-stack-self-host-runbook.md)
- [supabase-self-hosted-cutover-checklist.md](supabase-self-hosted-cutover-checklist.md)
- [SERVICE_MATRIX.md](../../../mcp/SERVICE_MATRIX.md)
- `memory/reference_vps_access.md`
- `scripts/open-supabase-ssh-tunnel.ps1`

---

_Last updated: 2026-05-01_
