# Capacity rig (ops/load-test)

Throwaway compose project `cos-load` on ks-aw-01: its own DB, 127.0.0.1 ports only, no AI/search keys, CPU-capped. Never touches a prod container or account.
`PROD_HEALTH_URL=<public /api/health>` makes sampler.sh watch prod every 3 s and touch `state/ABORT` (the load stops) after 3 slow answers.

```bash
# ~/cos-load2: ship this folder + patched/ai_lego (the worktree's ai_lego) + nginx.rig.conf (python make_nginx_conf.py <repo default.conf>)
./dc.sh up -d db migrate api                                   # dc.sh = docker compose -p cos-load -f docker-compose.load.yml -f docker-compose.patched.yml
./dc.sh exec -T db psql -U cognitive -d cognitive_os -c "CREATE EXTENSION pg_stat_statements"   # preloaded by the compose flags, created per database
./dc.sh run --rm -T loadgen /work/load_test.py seed-db --users 1000
./dc.sh run --rm -T loadgen /work/load_test.py seed-data --users 1000 --cases 2 --cards 8
COS_LOAD_WEB_IMAGE=<web image> ./dc.sh --profile edge --profile web2 --profile web3 up -d web web2 web3 nginx
./run_level.sh L1000 1000 60 180 --base http://nginx --prefix /api --host-header cognitive.aware-wave.com --pages --class-size 50 \
    --login-burst 300 --burst-at 60 --burst-within 30       # think 4-10 s; --think 2,5 = twice the activity
./dc.sh --profile edge --profile web2 --profile web3 down -v   # tear down this project only
```

`--pages` = every action starts with the browser navigation (HTML through nginx and the web tier); `--class-size N` = N people per client address (CF-Connecting-IP; the
rig nginx trusts the rig network), so the per-person and per-address limit zones of prod's cognitive server block are the ones exercised; `--assets` adds each page's
scripts/styles once per person (off: Cloudflare answers `/_next/static` from cache, `cf-cache-status: HIT`, 2026-10-12).

## Results 2026-10-12 (1000 people, think 4-10 s, 8 API workers x pool 10, 3 web replicas, nginx 0.5 CPU as in prod, pages + API through nginx, 300-login burst)

| | 1000 people | 1000 x2 activity (12 workers, 6 web) | 300 behind ONE address | 1000 behind ONE address |
|---|---|---|---|---|
| requests/s | 529 | 1020 | 160 | 238 |
| API reads p95 (worst endpoint) | 96 ms | 146 ms | 83 ms | 83 ms |
| saves p95 | 81 ms | 118 ms | 74 ms | 75 ms |
| page navigations p95 | 323 ms (`/methods`, 504 KB), others <= 215 | 510 ms | 135 ms | 152 ms |
| login burst (300 from one address in 30 s) p95 | 342 ms | 350 ms | (the ramp: 300 logins in 30 s, p95 278 ms) | - |
| 5xx / 429 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 550 (all `POST /auth/login`: one address may log in 5/s + burst 300) |

What limited it, in the order it was found (each fixed above this line, measured before/after in the same rig):
1. web tier: every SSR render fetched and parsed the 392 KB catalog. 1 replica, old: page p50 8.5 s, 263 asset 502s. Cached with ETag: still 66 pages/s per Next.js process.
   1 replica p50 7.9 s, 2 replicas p95 2.6 s, 3 replicas p50 40 ms / p95 230 ms at ~140 pages/s. Twice the activity needs 6.
2. nginx -> API/web opened a new TCP connection per request: ~5 ms nginx CPU per request (0.5 CPU cap reached at ~300 req/s: p95 10 s) and at ~650 req/s the container ran out
   of source ports (`connect() failed (99: Cannot assign requested address)`, 6713 502s). Upstream blocks with keepalive: nginx 25-32 % of 0.5 CPU at 529 req/s.
3. API: 8 workers saturate at ~520 req/s (8 cores); 12 workers on 12 cores carried 1020 req/s. DB pool 12 x 10 = 120 of max_connections 150.

## Deploy order (nothing here is applied by the commit)
1. `ops/cognitive-db`: `max_connections=150`, `mem_limit: 1g` -> README "改 PostgreSQL 旗標" (database restart, ~10 s). Safe in either order with the API (DB_POOL_EXCEEDS_SERVER reads the live value).
2. `deploy/deploy.sh`: builds, migrates (0008: five indexes, plain CREATE INDEX inside deploy's stopped-API window), starts api + web + web-2 + web-3 (all carry the alias `cognitive-os-web-pool`).
3. Only after step 2: nginx `default.conf` (upstreams `cognitive_api`, `cognitive_web`) via `safe-infra-patch.sh nginx`; before step 2 the new upstream name does not resolve and the site 502s.
   Rollback of 3 = the previous default.conf; of 2 = deploy.sh's own rollback (it also stops/tags web-2, web-3).
