#!/usr/bin/env pwsh
# One-shot Trigger.dev deploy: reads secrets from vault/VPS, deploys to EU worker.
#
# Secret sources:
#   TRIGGER_DEPLOY_PAT         ← local vault  (tr_pat_*, NOT tr_prod_*)
#   POSTHOG_API_KEY            ← local vault
#   OPS_INBOX_INGEST_TOKEN     ← local vault
#   LOBSTER_SUPABASE_SERVICE_ROLE_KEY  ← VPS /root/supabase/.env (never leaves VPS)
#
# Execution: writes bash payload to a VPS temp file via stdin (no TTY needed),
# then executes the file with a standard SSH call (no -tt — trigger deploy works
# without a pseudo-terminal when stdin is a file, not a pipe).
#
# Usage: .\scripts\lobster-trigger-deploy.ps1

param(
    # 2026-08-28 consolidation: trigger stack now on ks-aw-01.
    [string]$VpsHost = "145.239.195.47",
    [string]$SshKey  = "$env:USERPROFILE\.ssh\id_ed25519",
    [string]$AoOrgId = "39ad4149-5044-4077-8d9a-b6b916de0e21"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent

# ── 1. Inject vault secrets into this process ──────────────────────────────
if (-not $env:LOBSTER_VAULT_LOADED) {
    $scriptPath = $PSCommandPath
    $argStr     = "-VpsHost '$VpsHost' -SshKey '$SshKey' -AoOrgId '$AoOrgId'"
    $innerCmd   = "Set-Item Env:LOBSTER_VAULT_LOADED 1; & '$scriptPath' $argStr"
    & "$repoRoot\scripts\secrets-vault.ps1" -Action run `
        -Names @("TRIGGER_DEPLOY_PAT", "POSTHOG_API_KEY", "OPS_INBOX_INGEST_TOKEN") `
        -Command $innerCmd
    exit $LASTEXITCODE
}

Write-Host "[deploy] Vault secrets loaded (TRIGGER_DEPLOY_PAT, POSTHOG_API_KEY, OPS_INBOX_INGEST_TOKEN)." -ForegroundColor Green

if (-not $env:TRIGGER_DEPLOY_PAT -or -not $env:TRIGGER_DEPLOY_PAT.StartsWith("tr_pat_")) {
    throw "TRIGGER_DEPLOY_PAT in vault must be a deploy PAT (tr_pat_*).`nRun: scripts\secrets-vault.ps1 -Action set -Name TRIGGER_DEPLOY_PAT -Value <tr_pat_...>"
}
if (-not $env:POSTHOG_API_KEY)        { throw "POSTHOG_API_KEY not set in vault." }
if (-not $env:OPS_INBOX_INGEST_TOKEN) { throw "OPS_INBOX_INGEST_TOKEN not set in vault." }

# ── 2. Read SERVICE_ROLE_KEY from VPS ──────────────────────────────────────
Write-Host "[deploy] Reading SERVICE_ROLE_KEY from VPS..." -ForegroundColor Cyan
$srk = (& ssh -o StrictHostKeyChecking=no -p 58122 -i $SshKey ubuntu@$VpsHost `
    "sudo grep '^SERVICE_ROLE_KEY=' /root/supabase/.env | cut -d= -f2-" 2>&1).Trim()
if (-not $srk -or $srk.StartsWith("ssh:") -or $srk.Length -lt 20) {
    throw "Could not read SERVICE_ROLE_KEY from VPS /root/supabase/.env"
}
Write-Host "[deploy] SERVICE_ROLE_KEY obtained (length=$($srk.Length))." -ForegroundColor Green

Write-Host "[deploy] Reading COLLECT_SCHEDULE_INGEST_TOKEN from VPS..." -ForegroundColor Cyan
$cst = (& ssh -o StrictHostKeyChecking=no -p 58122 -i $SshKey ubuntu@$VpsHost `
    "sudo grep '^COLLECT_SCHEDULE_INGEST_TOKEN=' /root/lobster-phase1/.env | cut -d= -f2-" 2>&1).Trim()
if (-not $cst -or $cst.StartsWith("ssh:") -or $cst.Length -lt 10) {
    throw "Could not read COLLECT_SCHEDULE_INGEST_TOKEN from VPS /root/lobster-phase1/.env"
}
Write-Host "[deploy] COLLECT_SCHEDULE_INGEST_TOKEN obtained (length=$($cst.Length))." -ForegroundColor Green

# ── 3. Build bash deploy script ────────────────────────────────────────────
# PowerShell here-string: $pat/$srk/$phk/$oit/$AoOrgId are expanded by PS.
# Bash variable refs in echo lines use backtick-escaped $: `$VAR → $VAR in output.
$pat        = $env:TRIGGER_DEPLOY_PAT
$phk        = $env:POSTHOG_API_KEY
$oit        = $env:OPS_INBOX_INGEST_TOKEN
$cstTok     = $cst
# Optional — empty string is safe: syncEnvVars skips empty values
$execSteps  = if ($env:LOBSTER_EXECUTE_MANIFEST_STEPS)  { $env:LOBSTER_EXECUTE_MANIFEST_STEPS }  else { "" }
$wpSshKey   = if ($env:LOBSTER_WP_SSH_PRIVATE_KEY)      { $env:LOBSTER_WP_SSH_PRIVATE_KEY }      else { "" }
# Hosting adapter (Stage 0): create-wp-site → real staging WP via provision-staging.
$hostingTok = if ($env:LOBSTER_HOSTING_API_TOKEN)      { $env:LOBSTER_HOSTING_API_TOKEN }      else { "" }
# provision-staging real build ~71s; default 45s adapter timeout fired first -> run stuck.
# Default 95000 (under Cloudflare's ~100s origin ceiling so the adapter fails fast with a clean
# message rather than a CF 524); override via env if provision-staging is later moved off Cloudflare.
$hostingTimeout = if ($env:LOBSTER_HOSTING_HTTP_TIMEOUT_MS) { $env:LOBSTER_HOSTING_HTTP_TIMEOUT_MS } else { "95000" }

$deployBash = @"
#!/bin/bash
set -e
export NVM_DIR=/root/.nvm
# 2026-09-12: /root/.nvm no longer present on ks-aw-01 (node now installed system-wide at
# /usr/bin/node v20.20.2 via apt, reachable through sudo's secure_path). Guard instead of
# hard-requiring nvm so this script keeps working after either provisioning style.
if [ -s "`$NVM_DIR/nvm.sh" ]; then source "`$NVM_DIR/nvm.sh"; fi

# Trigger.dev auth
# TRIGGER_API_URL=localhost:8030 — bypass Cloudflare Bot Fight Mode for CLI deploy.
# trigger-webapp listens on 127.0.0.1:8030 internally; the public HTTPS URL goes through
# Cloudflare which blocks automated CLI requests with a JS challenge.
# LOBSTER_TRIGGER_PUBLIC_API_URL is picked up by trigger.config.ts syncEnvVars to sync
# the correct public URL to the Trigger.dev project env (used by tasks at runtime).
export TRIGGER_ACCESS_TOKEN='$pat'
# Both TRIGGER_API_URL and LOBSTER_TRIGGER_DEPLOY_URL use localhost to bypass Cloudflare
# Bot Fight Mode. TRIGGER_API_URL covers env-var-driven CLI auth; LOBSTER_TRIGGER_DEPLOY_URL
# overrides triggerUrl in trigger.config.ts so ALL CLI API calls stay on localhost.
# LOBSTER_TRIGGER_PUBLIC_API_URL is synced to the Trigger.dev project env via syncEnvVars
# so tasks at runtime have the correct public-facing URL for ao-infrastructure-check, etc.
export TRIGGER_API_URL=http://127.0.0.1:8030
export LOBSTER_TRIGGER_DEPLOY_URL=http://127.0.0.1:8030
export LOBSTER_TRIGGER_PUBLIC_API_URL=https://trigger.aware-wave.com

# Supabase
export LOBSTER_SUPABASE_URL=https://supabase.aware-wave.com
export LOBSTER_SUPABASE_SERVICE_ROLE_KEY='$srk'
export LOBSTER_ENABLE_DB_WRITES=true
export LOBSTER_MANIFEST_EXECUTION_MODE=off

# Hosting adapter (Stage 0): make create-wp-site POST to provision-staging (real staging WP).
# Empty token is safe — syncEnvVars skips empty values (adapter then stays blocked, not silent).
export LOBSTER_HOSTING_ADAPTER=http_json
export LOBSTER_HOSTING_PROVIDER_BASE_URL=https://app.aware-wave.com
export LOBSTER_HOSTING_PROVISION_PATH=/api/internal/hosting/provision-staging
export LOBSTER_HOSTING_API_TOKEN='$hostingTok'
export LOBSTER_HOSTING_HTTP_TIMEOUT_MS='$hostingTimeout'

# AO org + infrastructure endpoints
export LOBSTER_AO_ORG_ID=$AoOrgId
export N8N_URL=https://n8n.aware-wave.com
export N8N_API_BASE_URL=https://n8n.aware-wave.com
export UPTIME_KUMA_URL=https://uptime.aware-wave.com
export SENTRY_URL=https://sentry.io

# Observability
export POSTHOG_API_KEY='$phk'
export POSTHOG_HOST=https://us.i.posthog.com

# Webhooks
export OPS_INBOX_INGEST_TOKEN='$oit'
export AWAREWAVE_WEBHOOK_BASE_URL=https://app.aware-wave.com
export COLLECT_SCHEDULE_INGEST_TOKEN='$cstTok'

# wp-install-plugins: SSH execution gate + global SSH key
export LOBSTER_EXECUTE_MANIFEST_STEPS='$execSteps'
export LOBSTER_WP_SSH_PRIVATE_KEY='$wpSshKey'

# MainWP (create-wp-site addSiteToMainWp) - read here on the host, never leaves it
# One variable at a time (the .env is Docker syntax, not shell): values are never evaluated.
for v in MAINWP_DASHBOARD_URL MAINWP_CONSUMER_KEY MAINWP_CONSUMER_SECRET; do
  export "`$v=`$(grep -m1 "^`$v=" /root/lobster-phase1/.env | cut -d= -f2-)"
done

# site-watch (site-watch-heartbeat / site-watch-run) - read on the host the same way. OPTIONAL, unlike
# COLLECT_SCHEDULE_INGEST_TOKEN above: it is absent until SITE_WATCH_MASTER_PLAN.md step 10a, and a
# required read would block every unrelated Trigger deploy until then. Empty = not synced; the
# heartbeat then skips quietly and check-site-watch-health.ps1 reports the missing heartbeat.
export "SITE_WATCH_INGEST_TOKEN=`$(grep -m1 '^SITE_WATCH_INGEST_TOKEN=' /root/lobster-phase1/.env | cut -d= -f2-)"

echo '=== Env ready ==='
echo "  TRIGGER_API_URL (CLI):          `$TRIGGER_API_URL"
echo "  LOBSTER_TRIGGER_PUBLIC_API_URL: `$LOBSTER_TRIGGER_PUBLIC_API_URL"
echo "  LOBSTER_SUPABASE_URL:           `$LOBSTER_SUPABASE_URL"
echo "  LOBSTER_AO_ORG_ID:              `$LOBSTER_AO_ORG_ID"
echo "  POSTHOG_HOST:                   `$POSTHOG_HOST"
echo "  SENTRY_URL:                     `$SENTRY_URL"
echo "  N8N_URL:                        `$N8N_URL"
echo "  UPTIME_KUMA_URL:                `$UPTIME_KUMA_URL"
echo "  LOBSTER_EXECUTE_MANIFEST_STEPS: `$LOBSTER_EXECUTE_MANIFEST_STEPS"
if [ -n "`$LOBSTER_WP_SSH_PRIVATE_KEY" ]; then echo "  LOBSTER_WP_SSH_PRIVATE_KEY set: yes"; else echo "  LOBSTER_WP_SSH_PRIVATE_KEY set: no"; fi
if [ -n "`$MAINWP_CONSUMER_SECRET" ]; then echo "  MAINWP_* set: yes (`$MAINWP_DASHBOARD_URL)"; else echo "  MAINWP_* set: no"; fi

cd /root/Work/lobster-factory/packages/workflows

echo '=== Git pull ==='
git -C /root/Work pull --ff-only origin main 2>&1 | tail -5

echo '=== npm install ==='
npm install --silent 2>&1 | tail -3

echo '=== Patch buildImage.js (bypass Cloudflare for indexer) ==='
# Root cause: localBuildImage() sets --build-arg TRIGGER_API_URL=<server public URL>
# The managed-index-controller RUN step inside Docker calls that URL — Cloudflare blocks it.
# Direct patch: replace the build-arg value with http://127.0.0.1:8030 (VPS-local port).
# Combined with --network=host the indexer reaches port 8030 without going through Cloudflare.
# Re-applied after every npm install which resets node_modules.
sed -i 's|TRIGGER_API_URL=\`${apiUrl}|TRIGGER_API_URL=http://127.0.0.1:8030|g' \
  ./node_modules/trigger.dev/dist/esm/deploy/buildImage.js
echo "  buildImage.js patched: TRIGGER_API_URL -> http://127.0.0.1:8030"

echo '=== Deploy (trigger v4) ==='
# Force IPv4 for the CLI process itself (auth calls etc.).
# The managed-index-controller inside the Docker build uses --network=host so it
# reaches 127.0.0.1:8030 directly (trigger-webapp internal port, no Cloudflare).
export NODE_OPTIONS='--dns-result-order=ipv4first'
./node_modules/.bin/trigger deploy --api-url http://127.0.0.1:8030 --network=host
"@

# ── 4. Write script to VPS temp file (stdin, no TTY needed) ───────────────
# Convert Windows CRLF to Unix LF so bash doesn't choke on \r.
Write-Host "[deploy] Uploading deploy script to VPS temp file..." -ForegroundColor Cyan
($deployBash -replace "`r`n", "`n") | & ssh -o StrictHostKeyChecking=no -p 58122 -i $SshKey ubuntu@$VpsHost `
    "tr -d '\r' > /tmp/lobster-deploy.sh && chmod 700 /tmp/lobster-deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "Failed to upload deploy script to VPS." }
Write-Host "[deploy] Script uploaded." -ForegroundColor Green

# ── 5. Execute script on VPS (no TTY — trigger deploy works without it) ────
Write-Host "[deploy] Running deploy on VPS..." -ForegroundColor Cyan
& ssh -o StrictHostKeyChecking=no -p 58122 -i $SshKey ubuntu@$VpsHost `
    "sudo bash /tmp/lobster-deploy.sh; EC=`$?; rm -f /tmp/lobster-deploy.sh; exit `$EC"
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host "[deploy] Deploy failed (exit code $exitCode). Temp file cleaned up." -ForegroundColor Red
    exit $exitCode
}

Write-Host "[deploy] Done — all env vars synced and tasks deployed." -ForegroundColor Green
