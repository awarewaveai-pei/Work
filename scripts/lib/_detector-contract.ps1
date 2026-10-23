# Detector artifact contract. Every agency-os/reports/status/*-LATEST.json carries `overall`,
# `measured` (count of things actually observed) and `generated_utc`. A detector that observed nothing
# cannot say PASS -- "measured nothing" and "all good" looked identical until now (TASKS.md L882).
# Audit: scripts/audit-detector-contract.ps1. Writers dot-source this file and call Write-DetectorArtifact.
. (Join-Path $PSScriptRoot 'repo-text.ps1')

$script:DetectorPassVerdicts = @('PASS', 'OK')

function Test-DetectorPassVerdict {
    param([string]$Overall)
    return ($script:DetectorPassVerdicts -contains $Overall.ToUpperInvariant())
}

# measured=0 with a PASS verdict is stored as UNKNOWN (+ downgraded_from), never as PASS.
function Write-DetectorArtifact {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Overall,
        [Parameter(Mandatory = $true)][int]$Measured,
        [hashtable]$Fields = @{}
    )
    $doc = [ordered]@{
        overall       = $Overall
        measured      = $Measured
        generated_utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    if ($Measured -le 0 -and (Test-DetectorPassVerdict -Overall $Overall)) {
        $doc.overall = 'UNKNOWN'
        $doc.downgraded_from = $Overall
    }
    foreach ($k in $Fields.Keys) {
        if (-not $doc.Contains($k)) { $doc[$k] = $Fields[$k] }
    }
    Write-RepoTextFile -Path $Path -Content ($doc | ConvertTo-Json -Depth 8) -Atomic
    return [pscustomobject]$doc
}
