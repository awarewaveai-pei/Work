param(
    [string]$SupabaseUrl = "",
    [string]$SupabaseServiceRoleKey = "",
    [string]$EnvFile = "",
    [string]$TenantSlug = "awarewave-ops",
    [string]$TenantName = "AwareWave Ops",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key
    )

    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match ("^\s*" + [regex]::Escape($Key) + "\s*=") } | Select-Object -Last 1
    if (-not $line) { return "" }
    $value = $line -replace ("^\s*" + [regex]::Escape($Key) + "\s*=\s*"), ""
    return $value.Trim().Trim("'`"")
}

function Invoke-SupabaseRest {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("GET", "POST")] [string]$Method,
        [Parameter(Mandatory = $true)][string]$Url,
        [object]$Body
    )

    $headers = @{
        "apikey" = $SupabaseServiceRoleKey
        "Authorization" = "Bearer $SupabaseServiceRoleKey"
        "Accept" = "application/json"
    }

    $params = @{
        Method = $Method
        Uri = $Url
        Headers = $headers
        TimeoutSec = 30
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }

    return Invoke-RestMethod @params
}

function Assert-TableExists {
    param(
        [Parameter(Mandatory = $true)][string]$Table
    )
    $url = "$($SupabaseUrl.TrimEnd('/'))/rest/v1/${Table}?select=*&limit=1"
    try {
        [void](Invoke-SupabaseRest -Method GET -Url $url)
        Write-Host ("[OK] table exists: {0}" -f $Table)
    } catch {
        $message = $_.Exception.Message
        throw ("Table check failed for '{0}'. Migration may be missing. Error: {1}" -f $Table, $message)
    }
}

# Resolve connection settings from explicit args or env file.
$resolvedEnvFile = $EnvFile
if ([string]::IsNullOrWhiteSpace($resolvedEnvFile)) {
    $defaultPhase1Env = Join-Path (Get-Location) "lobster-factory/infra/hetzner-phase1-core/.env"
    if (Test-Path -LiteralPath $defaultPhase1Env) {
        $resolvedEnvFile = $defaultPhase1Env
    }
}

if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -and -not [string]::IsNullOrWhiteSpace($resolvedEnvFile)) {
    $SupabaseUrl = Read-EnvValue -Path $resolvedEnvFile -Key "SUPABASE_URL"
    if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
        $SupabaseUrl = Read-EnvValue -Path $resolvedEnvFile -Key "NEXT_PUBLIC_SUPABASE_URL"
    }
}
if ([string]::IsNullOrWhiteSpace($SupabaseServiceRoleKey) -and -not [string]::IsNullOrWhiteSpace($resolvedEnvFile)) {
    $SupabaseServiceRoleKey = Read-EnvValue -Path $resolvedEnvFile -Key "SUPABASE_SERVICE_ROLE_KEY"
}

if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
    throw "SupabaseUrl not provided and not found in env file. Pass -SupabaseUrl or -EnvFile."
}
if ([string]::IsNullOrWhiteSpace($SupabaseServiceRoleKey)) {
    throw "SupabaseServiceRoleKey not provided and not found in env file. Pass -SupabaseServiceRoleKey or -EnvFile."
}
if ($SupabaseUrl -match "YOUR_VPS_IP_OR_DOMAIN|example\.com|<") {
    $sourceHint = if ([string]::IsNullOrWhiteSpace($resolvedEnvFile)) { "provided argument" } else { "env file: $resolvedEnvFile" }
    throw ("SupabaseUrl still looks like a placeholder ({0}) from {1}. Replace SUPABASE_URL or pass -SupabaseUrl explicitly." -f $SupabaseUrl, $sourceHint)
}

$base = $SupabaseUrl.TrimEnd("/")
if (-not ($base -match "^https?://")) {
    throw "SupabaseUrl must be a full URL, e.g. https://supabase.aware-wave.com"
}
Write-Host "== Ops Console Bootstrap ==" -ForegroundColor Cyan
Write-Host ("Supabase URL: {0}" -f $base)
if (-not [string]::IsNullOrWhiteSpace($resolvedEnvFile)) {
    Write-Host ("Env file: {0}" -f $resolvedEnvFile)
}

# 1) Verify 0011 tables are reachable.
Assert-TableExists -Table "ai_image_jobs"
Assert-TableExists -Table "ops_audit_events"
Assert-TableExists -Table "ops_action_runs"

# 2) Ensure one organization exists and return tenant_id.
$orgQuery = "$base/rest/v1/organizations?select=id,slug,name&slug=eq.$TenantSlug&limit=1"
$existing = @()
try {
    $existing = @(Invoke-SupabaseRest -Method GET -Url $orgQuery)
} catch {
    throw ("Failed querying organizations. Error: {0}" -f $_.Exception.Message)
}

$tenantId = ""
if ($existing.Count -gt 0) {
    $tenantId = [string]$existing[0].id
    Write-Host ("[OK] organization exists: {0} ({1})" -f $TenantSlug, $tenantId)
} else {
    if ($DryRun) {
        Write-Host ("[DRYRUN] organization missing, would create slug={0} name={1}" -f $TenantSlug, $TenantName) -ForegroundColor Yellow
    } else {
        $createUrl = "$base/rest/v1/organizations"
        $payload = @(
            @{
                type = "agency"
                name = $TenantName
                slug = $TenantSlug
                default_locale = "en"
                default_timezone = "UTC"
            }
        )
        try {
            $created = @(Invoke-SupabaseRest -Method POST -Url $createUrl -Body $payload)
            if ($created.Count -eq 0 -or -not $created[0].id) {
                throw "No id returned from organization insert."
            }
            $tenantId = [string]$created[0].id
            Write-Host ("[OK] organization created: {0} ({1})" -f $TenantSlug, $tenantId) -ForegroundColor Green
        } catch {
            throw ("Failed creating organization. Error: {0}" -f $_.Exception.Message)
        }
    }
}

Write-Host ""
Write-Host "== Copy these lines back to me ==" -ForegroundColor Cyan
Write-Host "base_url=https://app.aware-wave.com"
Write-Host ("tenant_id={0}" -f ($(if ($tenantId) { $tenantId } else { "<pending-create>" })))
Write-Host "0011=applied"
Write-Host "OPS_ROLE_RESOLUTION_MODE=claims_only"
Write-Host "OPS_ALLOW_SIMULATED_ROLE_FALLBACK=false"
