#Requires -Version 5.1
# RETIRED 2026-09-23 -- the only Trigger deploy entry point is scripts/lobster-trigger-deploy.ps1
# (the post-push hook runs it too). This wrapper deployed a worker missing most runtime env: its
# --env-file carried only POSTHOG_*, so syncEnvVars never got the Supabase / ops-inbox / collect /
# site-watch / MainWP values. It also went through public trigger.aware-wave.com (Cloudflare BFM blocks
# the build-time indexer, runbooks/TRIGGER-DEPLOY-CLOUDFLARE-BFM.md) and the retired EU registry tunnel.
# Kept as a tombstone so old instructions fail loudly instead of deploying.

Write-Error "deploy-workflows.ps1 is retired (2026-09-23). From the repo root run: powershell -ExecutionPolicy Bypass -File scripts/lobster-trigger-deploy.ps1"
exit 1
