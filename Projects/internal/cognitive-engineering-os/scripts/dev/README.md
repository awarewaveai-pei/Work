# Dev and verification helpers (Cognitive OS)

Local stack: API on :8420 (this repo; rows in the local PostgreSQL `cos-dev-db`, files in `.runtime/`), Next dev on :3930 (`apps/cognitive-web`,
`/api/*` proxied to :8420). Credentials come from `D:/Work/mcp/user-env.ps1` (`COS_TEST_TENANT_ID`, `COS_TEST_EMAIL`,
`COS_TEST_PASSWORD`, `ANTHROPIC_API_KEY`); no script prints them. Playwright lives in
`D:/Work/lobster-factory/infra/hetzner-phase1-core/tests/node_modules` → run the `.cjs` scripts with
`NODE_PATH=<that path>` from that `hetzner-phase1-core` folder.

**One local address** (operator 2026-10-15: two local copies invite mistakes): to look at the app, use the dev web on :3930
only. The compose pair of docker-compose.yml (`cognitive-os-web` on :8421, `cognitive-os-api` on :8422) is the host's image
run locally, for one purpose -- trying a built image before a deploy -- and is removed right after (`docker compose -f
docker-compose.yml down`); never left running, never used to look at pages (its image is whatever was last built, days old).
`docker ps --format '{{.Names}}' | grep cognitive` should print nothing when no image trial is in progress.

**Local database** (since the PostgreSQL switch the engine has no SQLite mode): `launch_cos_dev.ps1` creates or starts the Docker
container `cos-dev-db` (postgres 17, the image `tests/pg.py` pins; 127.0.0.1:55432 only; trust auth, local only; volume
`cos-dev-db-data`) and runs `migrate_db` before uvicorn. Its rows came once (2026-10-15) from the old local SQLite with
`move_sqlite_to_pg` on a COPY of `.runtime` (`--region-map APAC=dev --region-map local-dev=dev`, `--files-root` a scratch folder
deleted after the proof: the engine keeps reading files from `.runtime`); folders of deleted test tenants were removed from the
copy first (the move names each as FILES_ORPHAN / FILES_UNKNOWN). Start over: `docker rm -f cos-dev-db` and
`docker volume rm cos-dev-db-data`, then run the move again.

| Script | Does | Run |
|---|---|---|
| `launch_cos_dev.ps1` | starts the API with the key injected and a local-only daily budget | `.claude/launch.json` config `cognitive-api-dev` (`secrets-vault.ps1 -Action run -Names ANTHROPIC_API_KEY -Command "& scripts/dev/launch_cos_dev.ps1"`) |
| `run_e2e_local.ps1` | the cognitive Playwright project against :3930 (real model) | `powershell -File scripts/dev/run_e2e_local.ps1` → exit code = result |
| `result_shots.cjs <outdir>` | run page `#demo` → 執行分析 (real model) → screenshots, `result_main.html`, `result_expert.json` | `node result_shots.cjs <outdir>`; then `python docs/mockups/check-mocks.py --page result <outdir>/result_main.html --lesson /learn/systems.iceberg_model --parity` (use `MSYS_NO_PATHCONV=1` in Git Bash) |
| `demo_fixture.cjs <method_id> <domain>…` | the free 示範分析 data: run page `#demo[=<domain>]` → 執行分析 (real model, real cost, ~NT$3 each) → `apps/cognitive-web/fixtures/demo/<method_id>.<domain>.json`; then `python docs/mockups/sync-design-system.py` (lists it in `DEMOS`, links the lesson) | same as above; exit 3 = a domain failed (the others are written) |
| `project_shots.cjs <outdir>` | 我的專案 → project → saved result at desktop and phone width; page errors, overflow, lesson-HTML-in-JS check | same as above |
| `console_check.cjs` | console errors on the project pages | same |
| `live_check.sh` | the live site's public paths + markers + 401 without a session | `bash scripts/dev/live_check.sh` |
| `cos_predeploy_trial.sh <sha>` | on the host: backup (SQLite backup API) + trial of `<sha>` on copies (row counts, read-back, analyses' status, /health, /catalog) | `ssh -p 58122 ubuntu@145.239.195.47 'bash -s <sha>' < scripts/dev/cos_predeploy_trial.sh` |
| `cos_live_counts.sh` | live row counts + integrity, read-only | `ssh … 'bash -s' < scripts/dev/cos_live_counts.sh` |
| `prod_interpret_check.py` | one real analysis inside the live API container, nothing written | `ssh … 'docker exec -i -w /app/Projects/internal/cognitive-engineering-os cognitive-os-api python -' < scripts/dev/prod_interpret_check.py` |
| `prod_projects_check.py` | what GET /projects shows per tenant, through the deployed code | same pattern |
| `prod_read_analyses.py` | every stored analysis as GET /interpretations returns it (JSON lines) | same pattern, redirect stdout to a file |

Deploy (High risk, operator go-ahead each time): trial → `git merge --ff-only <sha>` on the host in `/opt/cognitive-os` →
`bash Projects/internal/cognitive-engineering-os/deploy/deploy.sh` (test gate, build, healthcheck, smoke, rollback tag) →
`live_check.sh` + `cos_live_counts.sh` + `prod_interpret_check.py` → delete the backup folder (`find … -delete`, no `rm -rf`).
The host checkout fetches over SSH with a read-only deploy key (`~/.ssh/cognitive-os-deploy`, repo `core.sshCommand`, GitHub
deploy key id 165068099, 2026-10-01). Never put a token in a remote URL: git stores it in `.git/config` in clear text (the
2026-09-12 clone did, with the account's main personal token).
