# Local dev launcher for cognitive-os-api (this repo's code) on a local PostgreSQL (docs/platform/STORAGE_SWITCH.md: the
# engine has no SQLite mode any more). Invoked via scripts/secrets-vault.ps1 -Action run -Names ANTHROPIC_API_KEY, which
# puts the key into this process only.
# The database: Docker container cos-dev-db (the image tests/pg.py pins), data in volume cos-dev-db-data, listening on
# 127.0.0.1:55432 only, password in .runtime/cos-dev-db.password (gitignored, made on first start). Created on first start,
# started when stopped, refused when a container of that name is not this one (other image or port); ready = a TCP login
# from here (pg_isready inside the container says yes during the image's socket-only init, tests/pg.py); brought to the
# Alembic head every start (migrate_db; a migration never runs by itself). Its rows came once from the old local .runtime
# SQLite through move_sqlite_to_pg (scripts/dev/README.md "Local database"); files stay where the engine reads them, .runtime.
$ErrorActionPreference = "Stop"
$image = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"
$product = Resolve-Path (Join-Path $PSScriptRoot "../..")   # the product root, wherever the repo is checked out
$secret = Join-Path $product ".runtime/cos-dev-db.password"
if (-not (Test-Path $secret)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $secret) | Out-Null
  $bytes = New-Object byte[] 24; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [IO.File]::WriteAllText($secret, (-join ($bytes | ForEach-Object { $_.ToString("x2") })))
}
$password = ([IO.File]::ReadAllText($secret)).Trim()
$state = docker ps -a --filter "name=^cos-dev-db$" --format "{{.State}}"
if (-not $state) {
  docker run -d --name cos-dev-db --restart unless-stopped -p 127.0.0.1:55432:5432 -e "POSTGRES_PASSWORD=$password" -e POSTGRES_DB=cognitive_os -v cos-dev-db-data:/var/lib/postgresql/data $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker run cos-dev-db failed (is Docker Desktop up? is 127.0.0.1:55432 taken?)" }
} else {
  $found = docker inspect cos-dev-db --format "{{.Config.Image}} {{(index (index .HostConfig.PortBindings \`"5432/tcp\`") 0).HostIp}}:{{(index (index .HostConfig.PortBindings \`"5432/tcp\`") 0).HostPort}}"
  if ($found -ne "$image 127.0.0.1:55432") { throw "a container named cos-dev-db exists but is not this one ($found); remove or rename it first" }
  if ($state -ne "running") { docker start cos-dev-db | Out-Null }
}
$env:COGNITIVE_OS_DATABASE_URLS = "dev=postgresql://postgres:$password@127.0.0.1:55432/cognitive_os"
Set-Location $product
python -c "import os, sys, time, psycopg; url = os.environ['COGNITIVE_OS_DATABASE_URLS'].split('=', 1)[1]; end = time.monotonic() + 90
while True:
    try:
        psycopg.connect(url, connect_timeout=3).close(); break
    except psycopg.OperationalError:
        if time.monotonic() > end: sys.exit('cos-dev-db: no TCP login within 90 s')
        time.sleep(1)"
if ($LASTEXITCODE -ne 0) { throw "cos-dev-db did not accept a login" }
$env:COGNITIVE_OS_NETWORK_EGRESS_ALLOWLIST = "api.anthropic.com"
$env:COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET = "1000000"   # local test runs only (full result pages ~18k tokens each); prod keeps its own
$env:COGNITIVE_OS_ANTHROPIC_API_KEY = $env:ANTHROPIC_API_KEY
python -m ai_lego.apps.cli.migrate_db
if ($LASTEXITCODE -ne 0) { throw "migrate_db failed (exit $LASTEXITCODE)" }
python -m uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8420
