param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [string]$TenantId = "",
    [string]$ExpectedTenantId = "",
    [string]$ExpectedTenantSlug = "",
    [ValidateSet("owner", "admin", "operator", "viewer")]
    [string]$OpsRole = "admin",
    [switch]$EnableWriteChecks,
    [int]$TimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "PATCH")] [string]$Method,
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Headers,
        [object]$Body
    )

    $result = @{
        ok = $false
        status = -1
        json = $null
        error = ""
    }

    try {
        $params = @{
            Method = $Method
            Uri = $Url
            Headers = $Headers
            TimeoutSec = $TimeoutSec
        }
        if ($null -ne $Body) {
            $params.ContentType = "application/json"
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }

        $resp = Invoke-RestMethod @params
        $result.ok = $true
        $result.status = 200
        $result.json = $resp
        return $result
    } catch {
        $ex = $_.Exception
        if ($ex.PSObject.Properties.Name -contains "Response" -and $null -ne $ex.Response) {
            $result.status = [int]$ex.Response.StatusCode
            try {
                $sr = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
                $raw = $sr.ReadToEnd()
                $result.json = if ($raw) { $raw | ConvertFrom-Json } else { $null }
            } catch {
                $result.error = $ex.Message
            }
        } else {
            $result.error = $ex.Message
        }
        return $result
    }
}

function Get-NestedValue {
    param(
        [Parameter(Mandatory = $true)][object]$Object,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $current = $Object
    foreach ($segment in $Path -split '\.') {
        if ($null -eq $current) { return $null }
        if ($current -is [System.Collections.IDictionary]) {
            if (-not $current.Contains($segment)) { return $null }
            $current = $current[$segment]
            continue
        }
        $prop = $current.PSObject.Properties[$segment]
        if ($null -eq $prop) { return $null }
        $current = $prop.Value
    }
    return $current
}

function Print-Check {
    param(
        [string]$Name,
        [hashtable]$Result,
        [bool]$Pass
    )
    $status = if ($Pass) { "OK" } else { "FAIL" }
    Write-Host ("[{0}] {1} -> HTTP {2}" -f $status, $Name, $Result.status)
    if (-not $Pass) {
        if ($Result.json) {
            Write-Host ("      body: {0}" -f (($Result.json | ConvertTo-Json -Depth 6 -Compress)))
        } elseif ($Result.error) {
            Write-Host ("      error: {0}" -f $Result.error)
        }
    }
}

$root = $BaseUrl.TrimEnd("/")
$failed = New-Object System.Collections.Generic.List[string]

$getHeaders = @{ "Accept" = "application/json" }

$summary = Invoke-JsonRequest -Method GET -Url "$root/api/ops/summary" -Headers $getHeaders
$summaryPass = $summary.ok -and $summary.json -and ($summary.json.sourceOfTruth -ne $null)
Print-Check -Name "GET /api/ops/summary" -Result $summary -Pass $summaryPass
if (-not $summaryPass) { $failed.Add("summary") | Out-Null }

if ($summaryPass -and (-not [string]::IsNullOrWhiteSpace($ExpectedTenantId) -or -not [string]::IsNullOrWhiteSpace($ExpectedTenantSlug))) {
    $tenants = @($summary.json.tenants)
    $tenantReflectPass = $false
    foreach ($tenant in $tenants) {
        $idMatch = [string]::IsNullOrWhiteSpace($ExpectedTenantId) -or ($tenant.id -eq $ExpectedTenantId)
        $slugMatch = [string]::IsNullOrWhiteSpace($ExpectedTenantSlug) -or ($tenant.slug -eq $ExpectedTenantSlug)
        if ($idMatch -and $slugMatch) {
            $tenantReflectPass = $true
            break
        }
    }

    $reflectResult = @{
        ok = $summary.ok
        status = $summary.status
        json = [pscustomobject]@{
            expectedTenantId = $ExpectedTenantId
            expectedTenantSlug = $ExpectedTenantSlug
            sourceOfTruth = $summary.json.sourceOfTruth
            tenantCount = $tenants.Count
        }
        error = ""
    }
    Print-Check -Name "UI datasource reflects expected tenant (/api/ops/summary)" -Result $reflectResult -Pass $tenantReflectPass
    if (-not $tenantReflectPass) { $failed.Add("summary-tenant-reflect") | Out-Null }
}

$runs = Invoke-JsonRequest -Method GET -Url "$root/api/ops/workflow-runs?limit=5" -Headers $getHeaders
$runsPass = $runs.ok -and $runs.json -and ($runs.json.ok -eq $true)
Print-Check -Name "GET /api/ops/workflow-runs" -Result $runs -Pass $runsPass
if (-not $runsPass) { $failed.Add("workflow-runs") | Out-Null }

if ($EnableWriteChecks) {
    if ([string]::IsNullOrWhiteSpace($TenantId)) {
        Write-Error "EnableWriteChecks requires -TenantId <organization-uuid>."
        exit 2
    }

    $writeHeaders = @{
        "Accept" = "application/json"
        "x-ops-simulated-role" = $OpsRole
        "x-ops-claims-role" = $OpsRole
    }

    $tenantPatch = @{
        defaultLocale = "en"
        defaultTimezone = "UTC"
    }
    $tenant = Invoke-JsonRequest -Method PATCH -Url "$root/api/ops/tenants/$TenantId/config" -Headers $writeHeaders -Body $tenantPatch
    $tenantPass = $tenant.ok -and $tenant.json -and ($tenant.json.ok -eq $true)
    Print-Check -Name "PATCH /api/ops/tenants/:id/config" -Result $tenant -Pass $tenantPass
    if (-not $tenantPass) { $failed.Add("tenant-config") | Out-Null }

    $aiJob = @{
        organizationId = $TenantId
        prompt = "smoke test placeholder image"
        modelName = "xai-image-1"
        provider = "xai"
    }
    $job = Invoke-JsonRequest -Method POST -Url "$root/api/ops/ai-image-jobs" -Headers $writeHeaders -Body $aiJob
    $jobPass = $job.ok -and $job.json -and ($job.json.ok -eq $true)
    Print-Check -Name "POST /api/ops/ai-image-jobs" -Result $job -Pass $jobPass
    if (-not $jobPass) { $failed.Add("ai-image-jobs") | Out-Null }

    if ($jobPass) {
        $jobTraceId = [string](Get-NestedValue -Object $job.json -Path "job.trace_id")
        $jobId = [string](Get-NestedValue -Object $job.json -Path "job.id")
        $audit = Invoke-JsonRequest -Method GET -Url "$root/api/ops/audit-events?trace_id=$jobTraceId&event_type=ai_image_job_created&limit=5" -Headers $getHeaders
        $auditPass = $audit.ok -and $audit.json -and ($audit.json.ok -eq $true) -and (@($audit.json.events).Count -gt 0)
        Print-Check -Name "GET /api/ops/audit-events (ai_image_job_created)" -Result $audit -Pass $auditPass
        if (-not $auditPass) {
            $failed.Add("audit-events") | Out-Null
        } else {
            $event = @($audit.json.events)[0]
            $targetPass = ($event.target_id -eq $jobId) -or ($event.trace_id -eq $jobTraceId)
            $targetResult = @{
                ok = $audit.ok
                status = $audit.status
                json = [pscustomobject]@{
                    jobId = $jobId
                    traceId = $jobTraceId
                    eventTargetId = $event.target_id
                    eventTraceId = $event.trace_id
                }
                error = ""
            }
            Print-Check -Name "Audit event maps to created AI job" -Result $targetResult -Pass $targetPass
            if (-not $targetPass) { $failed.Add("audit-event-target") | Out-Null }
        }
    }
}

if ($failed.Count -gt 0) {
    Write-Error ("ops-console-smoke failed: {0}" -f ($failed -join ","))
    exit 1
}

Write-Host "ops-console-smoke: ALL PASSED" -ForegroundColor Green
exit 0
