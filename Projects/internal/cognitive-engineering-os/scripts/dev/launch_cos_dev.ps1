# Local dev launcher for cognitive-os-api (this repo's code, local .runtime DB with the COS_TEST identity). Invoked via
# scripts/secrets-vault.ps1 -Action run -Names ANTHROPIC_API_KEY, which puts the key into this process only.
$env:COGNITIVE_OS_NETWORK_EGRESS_ALLOWLIST = "api.anthropic.com"
$env:COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET = "1000000"   # local test runs only (full result pages ~18k tokens each); prod keeps its own
$env:COGNITIVE_OS_ANTHROPIC_API_KEY = $env:ANTHROPIC_API_KEY
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "../.."))   # the product root, wherever the repo is checked out
python -m uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8420
