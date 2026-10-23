param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [string]$TenantId = "",
    [string]$ExpectedTenantId = "",
    [string]$ExpectedTenantSlug = "",
    [ValidateSet("owner", "admin", "operator", "viewer")]
    [string]$OpsRole = "admin",
    [switch]$EnableWriteChecks,
    [switch]$EnableRoleChecks,
    [int]$TimeoutSec = 20,
    [int]$ExpectedMinWorkflowRuns = 0,
    [string]$ExpectedWorkflowSources = "",
    [string]$ReportPath = "",
    [string]$BasicAuthUser = "",
    [string]$BasicAuthPassword = "",
    [string]$OpsProxySecret = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "lib\_detector-contract.ps1")

# measured = checks recorded in the report; overall mirrors $report.result (passed -> PASS, failed -> FAIL).
function Save-Report {
    $fields = @{}
    foreach ($k in $report.Keys) { $fields[$k] = $report[$k] }
    $overall = if ($report.result -eq "passed") { "PASS" } else { "FAIL" }
    Write-DetectorArtifact -Path $ReportPath -Overall $overall -Measured @($report.checks).Count -Fields $fields | Out-Null
    Write-Host ("report_path={0}" -f $ReportPath)
}

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
$report = [ordered]@{
    baseUrl = $root
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    checks = @()
    expected = [ordered]@{
        tenantId = $ExpectedTenantId
        tenantSlug = $ExpectedTenantSlug
        minWorkflowRuns = $ExpectedMinWorkflowRuns
        workflowSources = $ExpectedWorkflowSources
    }
    evidence = [ordered]@{
        tenantCount = $null
        workflowRunsCount = $null
        workflowRunSources = @()
        jobId = $null
        traceId = $null
        auditEventId = $null
        auditEventTargetId = $null
        auditEventTraceId = $null
    }
    result = "pending"
    failedChecks = @()
}

$getHeaders = @{ "Accept" = "application/json" }
if (-not [string]::IsNullOrWhiteSpace($BasicAuthUser)) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("${BasicAuthUser}:${BasicAuthPassword}")
    $encoded = [Convert]::ToBase64String($bytes)
    $getHeaders["Authorization"] = "Basic $encoded"
}

$summary = Invoke-JsonRequest -Method GET -Url "$root/api/ops/summary" -Headers $getHeaders
$summaryPass = $summary.ok -and $summary.json -and ($summary.json.sourceOfTruth -ne $null)
Print-Check -Name "GET /api/ops/summary" -Result $summary -Pass $summaryPass
if (-not $summaryPass) { $failed.Add("summary") | Out-Null }
if ($summaryPass) {
    $report.evidence.tenantCount = @($summary.json.tenants).Count
}
$report.checks += [ordered]@{
    name = "summary"
    pass = $summaryPass
    status = $summary.status
}

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
    $report.checks += [ordered]@{
        name = "summary-tenant-reflect"
        pass = $tenantReflectPass
        status = $summary.status
        details = [ordered]@{
            expectedTenantId = $ExpectedTenantId
            expectedTenantSlug = $ExpectedTenantSlug
            sourceOfTruth = $summary.json.sourceOfTruth
            tenantCount = $tenants.Count
        }
    }
}

$runs = Invoke-JsonRequest -Method GET -Url "$root/api/ops/workflow-runs?limit=5" -Headers $getHeaders
$runsPass = $runs.ok -and $runs.json -and ($runs.json.ok -eq $true)
Print-Check -Name "GET /api/ops/workflow-runs" -Result $runs -Pass $runsPass
if (-not $runsPass) { $failed.Add("workflow-runs") | Out-Null }
if ($runsPass) {
    $runsCount = [int]$runs.json.count
    $report.evidence.workflowRunsCount = $runsCount
    $actualSources = @()
    foreach ($run in @($runs.json.runs)) {
        $source = [string](Get-NestedValue -Object $run -Path "runSource")
        if (-not [string]::IsNullOrWhiteSpace($source)) {
            $actualSources += $source.ToLower()
        }
    }
    $actualSources = @($actualSources | Sort-Object -Unique)
    $report.evidence.workflowRunSources = $actualSources
    if ($ExpectedMinWorkflowRuns -gt 0) {
        $hasEnoughRuns = $runsCount -ge $ExpectedMinWorkflowRuns
        $workflowCountResult = @{
            ok = $runs.ok
            status = $runs.status
            json = [pscustomobject]@{
                expectedMinWorkflowRuns = $ExpectedMinWorkflowRuns
                actualWorkflowRuns = $runsCount
                hint = if ($hasEnoughRuns) { "ok" } else { "No ops_action_runs rows yet. Trigger one staging action first." }
            }
            error = ""
        }
        Print-Check -Name "Workflow runs count >= expected minimum" -Result $workflowCountResult -Pass $hasEnoughRuns
        if (-not $hasEnoughRuns) { $failed.Add("workflow-runs-min-count") | Out-Null }
        $report.checks += [ordered]@{
            name = "workflow-runs-min-count"
            pass = $hasEnoughRuns
            status = $runs.status
            details = $workflowCountResult.json
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpectedWorkflowSources)) {
        $expectedSources = @($ExpectedWorkflowSources -split ',' | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ -ne "" } | Sort-Object -Unique)
        $missingSources = @()
        foreach ($source in $expectedSources) {
            if (-not ($actualSources -contains $source)) {
                $missingSources += $source
            }
        }
        $sourcePass = $missingSources.Count -eq 0
        $sourceResult = @{
            ok = $runs.ok
            status = $runs.status
            json = [pscustomobject]@{
                expectedSources = $expectedSources
                actualSources = $actualSources
                missingSources = $missingSources
                hint = if ($sourcePass) { "ok" } else { "Insert ops_action_runs with metadata.source for missing engines." }
            }
            error = ""
        }
        Print-Check -Name "Workflow runs include expected sources" -Result $sourceResult -Pass $sourcePass
        if (-not $sourcePass) { $failed.Add("workflow-runs-sources") | Out-Null }
        $report.checks += [ordered]@{
            name = "workflow-runs-sources"
            pass = $sourcePass
            status = $runs.status
            details = $sourceResult.json
        }
    }
}
$report.checks += [ordered]@{
    name = "workflow-runs"
    pass = $runsPass
    status = $runs.status
}

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
    $viewerHeaders = @{
        "Accept" = "application/json"
        "x-ops-simulated-role" = "viewer"
        "x-ops-claims-role" = "viewer"
    }
    if ($getHeaders.ContainsKey("Authorization")) {
        $writeHeaders["Authorization"] = $getHeaders["Authorization"]
        $viewerHeaders["Authorization"] = $getHeaders["Authorization"]
    }
    if (-not [string]::IsNullOrWhiteSpace($OpsProxySecret)) {
        $writeHeaders["x-ops-proxy-auth"] = $OpsProxySecret
        $viewerHeaders["x-ops-proxy-auth"] = $OpsProxySecret
    }

    if ($EnableRoleChecks) {
        $viewerTenantPatch = @{
            defaultLocale = "en"
            defaultTimezone = "UTC"
        }
        $viewerTenant = Invoke-JsonRequest -Method PATCH -Url "$root/api/ops/tenants/$TenantId/config" -Headers $viewerHeaders -Body $viewerTenantPatch
        $viewerTenantPass = (-not $viewerTenant.ok) -and ($viewerTenant.status -eq 403)
        Print-Check -Name "PATCH /api/ops/tenants/:id/config as viewer should be forbidden" -Result $viewerTenant -Pass $viewerTenantPass
        if (-not $viewerTenantPass) { $failed.Add("role-check-viewer-tenant") | Out-Null }
        $report.checks += [ordered]@{
            name = "role-check-viewer-tenant"
            pass = $viewerTenantPass
            status = $viewerTenant.status
        }

        $viewerAiJob = @{
            organizationId = $TenantId
            prompt = "viewer should be forbidden"
            modelName = "xai-image-1"
            provider = "xai"
        }
        $viewerJob = Invoke-JsonRequest -Method POST -Url "$root/api/ops/ai-image-jobs" -Headers $viewerHeaders -Body $viewerAiJob
        $viewerJobPass = (-not $viewerJob.ok) -and ($viewerJob.status -eq 403)
        Print-Check -Name "POST /api/ops/ai-image-jobs as viewer should be forbidden" -Result $viewerJob -Pass $viewerJobPass
        if (-not $viewerJobPass) { $failed.Add("role-check-viewer-ai-job") | Out-Null }
        $report.checks += [ordered]@{
            name = "role-check-viewer-ai-job"
            pass = $viewerJobPass
            status = $viewerJob.status
        }
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
    $report.checks += [ordered]@{
        name = "ai-image-jobs"
        pass = $jobPass
        status = $job.status
    }

    if ($jobPass) {
        $jobTraceId = [string](Get-NestedValue -Object $job.json -Path "job.trace_id")
        $jobId = [string](Get-NestedValue -Object $job.json -Path "job.id")
        $report.evidence.traceId = $jobTraceId
        $report.evidence.jobId = $jobId
        $audit = Invoke-JsonRequest -Method GET -Url "$root/api/ops/audit-events?trace_id=$jobTraceId&event_type=ai_image_job_created&limit=5" -Headers $getHeaders
        $auditPass = $audit.ok -and $audit.json -and ($audit.json.ok -eq $true) -and (@($audit.json.events).Count -gt 0)
        Print-Check -Name "GET /api/ops/audit-events (ai_image_job_created)" -Result $audit -Pass $auditPass
        if (-not $auditPass) {
            $failed.Add("audit-events") | Out-Null
        } else {
            $event = @($audit.json.events)[0]
            $report.evidence.auditEventId = $event.id
            $report.evidence.auditEventTargetId = $event.target_id
            $report.evidence.auditEventTraceId = $event.trace_id
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
            $report.checks += [ordered]@{
                name = "audit-event-target"
                pass = $targetPass
                status = $audit.status
                details = $targetResult.json
            }
        }
        $report.checks += [ordered]@{
            name = "audit-events"
            pass = $auditPass
            status = $audit.status
        }
    }
}

if ($failed.Count -gt 0) {
    $report.result = "failed"
    $report.failedChecks = @($failed)
    if (-not [string]::IsNullOrWhiteSpace($ReportPath)) { Save-Report }
    Write-Error ("ops-console-smoke failed: {0}" -f ($failed -join ","))
    exit 1
}

$report.result = "passed"
if (-not [string]::IsNullOrWhiteSpace($ReportPath)) { Save-Report }
Write-Host "ops-console-smoke: ALL PASSED" -ForegroundColor Green
exit 0
