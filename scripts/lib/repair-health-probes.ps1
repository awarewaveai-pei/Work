# Verdict over /api/ops/repairs/health's advisory SSH probes. Dot-sourced by check-smoke-tests.ps1.
# Why: the endpoint's `ok` only means "configured" (health/route.ts `const ok = ...`); the probes are the
# only signal that the Auto-Repair SSH path actually works, and it sat broken 23 days unseen (WORKLOG 2026-09-24).

# Probe object -> host keys it carries. A probe object missing from the response is a finding (endpoint
# changed shape), never a silent pass.
$script:RepairProbeFields = [ordered]@{
    backup_script_probe = @("sg", "eu")
    auto_reboot         = @("sg", "eu")
}

# Returns "<probe>.<host>=<status>" lines, unrolled: callers wrap in @(). Empty = every probe healthy.
function Get-RepairProbeFindings {
    param([Parameter(Mandatory)] $Health)
    $findings = New-Object System.Collections.Generic.List[string]
    $names = @($Health.PSObject.Properties.Name)
    $euOptional = -not (($names -contains "eu_backup_required") -and $Health.eu_backup_required -eq $true)
    foreach ($probe in $script:RepairProbeFields.Keys) {
        if ($names -notcontains $probe -or $null -eq $Health.$probe) { $findings.Add("$probe=absent"); continue }
        $obj = $Health.$probe
        foreach ($hostKey in $script:RepairProbeFields[$probe]) {
            $v = if (@($obj.PSObject.Properties.Name) -contains $hostKey) { [string]$obj.$hostKey } else { "absent" }
            if ($v -eq "ok" -or $v -eq "skipped") { continue }
            if ($hostKey -eq "eu" -and $v -eq "unconfigured" -and $euOptional) { continue }
            $findings.Add("$probe.$hostKey=$v")
        }
    }
    return $findings.ToArray()
}
