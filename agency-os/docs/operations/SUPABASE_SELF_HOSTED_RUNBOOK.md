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

DSN:

```text
postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres
```

Machine-local env:

- Preferred: `SUPABASE_AWAREWAVE_POSTGRES_DSN`
- Legacy fallback: `SUPABASE_B_POSTGRES_DSN`

Stop tunnel:

```powershell
Get-Process ssh | Stop-Process
```

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

本機跑 **`scripts/open-supabase-ssh-tunnel.ps1`** 時若出現此行，代表 **EU 的 `sshd` 拒絕 `-L` 轉發**（常見：`AllowTcpForwarding no`，或 **`PermitOpen`** 白名單未包含 `127.0.0.1:5432` / `:3000` / `:8000`）。

**在 EU VPS（已 SSH 登入）檢查並修正**（需 root）：

```bash
grep -nE '^(AllowTcpForwarding|PermitOpen|GatewayPorts)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
```

- 若為 **`AllowTcpForwarding no`** → 改為 **`AllowTcpForwarding yes`**（或刪除該行採預設）。
- 若有 **`PermitOpen`** 且過窄 → 註解掉、改寬，或明確列出：`127.0.0.1:5432 127.0.0.1:3000 127.0.0.1:8000`（語法以 `man sshd_config` 為準）。

然後：

```bash
sshd -t && systemctl reload ssh
```

**不改 sshd 的繞道**：直接用 **`https://studio.aware-wave.com`**（不需 tunnel）。

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

_Last updated: 2026-04-23_
