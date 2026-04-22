param(
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\init-closeout-inbox.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "init-closeout-inbox wrapper: owner script missing at $ownerScript"
    exit 1
}

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
