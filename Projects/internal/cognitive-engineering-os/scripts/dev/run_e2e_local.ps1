# Run the cognitive Playwright project against the local dev web (:3930 -> API :8420) with the local test identity.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "../../../../.."))   # the repo root, wherever it is checked out
. ./mcp/user-env.ps1 | Out-Null
$env:PLAYWRIGHT_COS_URL = "http://localhost:3930"
./scripts/playwright-runner.ps1 -Mode cognitive
exit $LASTEXITCODE
