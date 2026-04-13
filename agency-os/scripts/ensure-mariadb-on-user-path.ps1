param(
    [string]$MariaDbBin = "C:\Program Files\MariaDB 12.2\bin"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\ensure-mariadb-on-user-path.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "ensure-mariadb-on-user-path wrapper: owner script missing at $ownerScript"
    exit 1
}

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
