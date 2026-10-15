# Supabase Self-Hosted Runbook

> 📍 機器拓樸（誰跑哪台）唯一正本：[`AWAREWAVE_STACK_QUICKREF.md`](AWAREWAVE_STACK_QUICKREF.md)。本檔 = Supabase（EU）部署/設定正本；改容器時兩邊一起改。

> Owner: `awarewaveai`  
> **Supabase stack — 2026-08-31 update**: on **ks-aw-01** (`145.239.195.47`, SSH `-p 58122`, `ubuntu@` + `sudo`). The prior host and old EU/SG boxes are retired; connect only to ks-aw-01.
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

原因（官方 **docker** 鏡像與 vanilla Postgres 不同）：

- 在 **`supabase/postgres` docker 映像**裡，`**postgres**` **不是** **`rolsuper`**，**無法讀 **`pg_catalog.pg_shadow`**，即使 **`get_auth`** 標了 **`SECURITY DEFINER`** 但若 **owner** 仍是 **`postgres`**，執行時身分仍無權限 → **`permission denied for view pg_shadow`**。
- 請在 DB 內確認：`SELECT rolname, rolsuper FROM pg_roles WHERE rolname IN ('postgres','supabase_admin');` —— 典型結果是 **僅 **`supabase_admin`** 為 superuser**。
- **`pgbouncer`** schema 若 owner 為 **`pgbouncer`**，以 **`postgres`** 連進去做 **`CREATE OR REPLACE FUNCTION … IN SCHEMA pgbouncer`** 也會出現 **`permission denied for schema pgbouncer`**。
- **`auth_query`** 由 pooler／驅動以 **`pgbouncer`** 角色對 **`postgres` DB** 呼叫 **`pgbouncer.get_auth($1)`**；除 **`EXECUTE` on function** 外，尚需 **`USAGE` on schema **`pgbouncer`**。若將 schema owner 調整為 **`supabase_admin`** 後仍見 **`permission denied for schema pgbouncer`（Postgrex / `:42501`**），補：**`GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer;`**。

修復原則：**`pgbouncer`** schema 與 **`pgbouncer.get_auth`** 的 **OWNER 改為 **`supabase_admin`****，函式 **`SECURITY DEFINER` + `SET search_path = ''`**，並 **`REVOKE` PUBLIC**，再對 **`pgbouncer`** role：**`GRANT USAGE ON SCHEMA pgbouncer` + `GRANT EXECUTE ON FUNCTION`**；完成後 **`docker restart supabase-pooler`**。

**在 EU**（備份／維護窗後），取得 **`/root/supabase/.env`** 的 **`POSTGRES_PASSWORD`**（僅在伺服器上使用，**不入庫／不貼聊天**），並以 **`supabase_admin`** 執行：

```bash
PW=$(grep -E '^POSTGRES_PASSWORD=' /root/supabase/.env | tail -n1 | cut -d= -f2- | tr -d '\r')
docker exec -i -e PGPASSWORD="$PW" supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'EOSQL'
BEGIN;

ALTER SCHEMA pgbouncer OWNER TO supabase_admin;

CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename TEXT)
RETURNS TABLE(username TEXT, password TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  RETURN QUERY
  SELECT usename::TEXT, passwd::TEXT
  FROM pg_catalog.pg_shadow
  WHERE usename = p_usename;
END;
$func$;

ALTER FUNCTION pgbouncer.get_auth(TEXT) OWNER TO supabase_admin;

REVOKE ALL ON FUNCTION pgbouncer.get_auth(TEXT) FROM PUBLIC;

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgbouncer') THEN
    GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer;
    GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(TEXT) TO pgbouncer;
  END IF;
END;
$grant$;

COMMIT;
EOSQL

docker restart supabase-pooler >/dev/null
```

驗證：

```sql
SELECT proname::text, pg_get_userbyid(proowner)::text AS owner, prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'pgbouncer' AND p.proname = 'get_auth';

SELECT n.nspname::text, pg_get_userbyid(n.nspowner)::text AS schema_owner
FROM pg_namespace n WHERE n.nspname = 'pgbouncer';
```

預期：**`get_auth` 的 owner = `supabase_admin`**、`prosecdef = t`；**`pgbouncer` schema owner** 亦為 **`supabase_admin`**（或可寫入／維護之 superuser）。

**請勿**再以 **`docker exec … psql -U postgres`** 套用上述替換並期望能讀 **`pg_shadow`**——在該鏡像下 **`postgres` 非 superuser**。上游 **`pgbouncer_auth_schema.sql`** 仍以 vanilla superuser **`postgres`** 為敘述；自託管 docker 請以 **`supabase_admin`** 為準。

修完後若 pooler 仍報舊錯：在 **`/root/supabase`** 亦可嘗試 **`docker compose restart supabase-pooler`**（與 **`docker restart supabase-pooler`** 等價於單容器名時）。

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

### 6.1 Lobster DB migrations (`lobster-factory/packages/db/migrations`)

Numbered `*.sql` files are the **authoritative** DDL/RLS sequence for the Lobster/AwareWave schema on top of stock Supabase Postgres.

| Topic | Guidance |
| --- | --- |
| Location | Monorepo `lobster-factory/packages/db/migrations/` (`0001_*.sql` … `0017_*.sql`). |
| Apply on EU | Only in a **maintenance window** with a **verified backup** and explicit approval. Run files **in numeric order** exactly once each (no skipping): `psql -v ON_ERROR_STOP=1 -f <file>`. |
| Docker entrypoint | Example: `docker exec -i -e PGPASSWORD="$PW" supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/0016_….sql` after copying the file onto the host/container. Prefer **`supabase_admin`** when `postgres` cannot own DDL (see §3.4). |
| Studio Security Advisor (`0013_rls_disabled_in_public`) | Flags **`public` tables with RLS off** (`relrowsecurity = false`) where **`anon` or `authenticated` has SELECT** (same idea as the linter). **`git` 裡有 `0014` 不代表 EU 資料庫已套用**；若從未對 EU Postgres 跑過 `0014`，Advisor 會一直顯示約 17 筆 ERROR。套用 **`0014`**（再 **`0016`**）後，到 Studio **Security Advisor 手動重新整理／稍候重掃**；套用前後可用 repo 內 **`lobster-factory/packages/db/scripts/verify-public-rls-supabase-advisor.sql`** 在 SQL Editor 跑，結果應為 **0 rows**。 |
| Drift / linter | Partial stacks produce Studio **RLS disabled in public** and runtime surprises; redeploy from repo order instead of hand-fixing individual tables. |
| RLS vs policies | `0014` enables RLS broadly; `0016_ops_console_and_permission_catalog_rls_policies.sql` adds **authenticated** policies for ops-console tables and permission catalogs so JWT clients keep intended reads; **`service_role` bypasses RLS** for jobs and admin automation. |
| PostgREST | `scripts/apply-db-migration.mjs` sends `NOTIFY pgrst, 'reload schema';` after every committed batch. SQL applied any other way: run it yourself, or `docker compose restart supabase-rest` — until then new columns/tables are invisible to supabase-js ("not in the schema cache"). |

Do **not** run production DDL from IDE agents without the same gates as human operators.

SSH to VPS:

```bash
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47
sudo -i
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
