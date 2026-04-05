param(
    [Parameter(Mandatory = $true)][string]$TenantSlug,
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Command,
    [string]$NotBeforeUtc = "",
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) { return (Resolve-Path $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

function Read-Json {
    param([string]$Path)
    return (Get-Content -Raw -Path $Path -Encoding UTF8 | ConvertFrom-Json)
}

function Write-Json {
    param([string]$Path, [object]$Data)
    Set-Content -Path $Path -Value ($Data | ConvertTo-Json -Depth 10) -Encoding UTF8
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$tenantDir = Join-Path $root ("tenants/" + $TenantSlug)
$queuePath = Join-Path $tenantDir "OPS_QUEUE.json"
if (-not (Test-Path $tenantDir)) { throw "Missing tenant directory: $tenantDir" }

if (-not (Test-Path $queuePath)) {
    Write-Json -Path $queuePath -Data @{ items = @() }
}

$queue = Read-Json -Path $queuePath
$id = "adhoc-" + (Get-Date).ToString("yyyyMMddHHmmss")
$item = [ordered]@{
    id = $id
    title = $Title
    command = $Command
    status = "pending"
    created_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    not_before_utc = $NotBeforeUtc
    executed_at_utc = ""
    result = ""
}

$queue.items = @($queue.items) + @($item)
Write-Json -Path $queuePath -Data $queue
Write-Output ("Queued task: " + $id)
