# Verdict over /api/ops/repairs/health's advisory SSH probes. Dot-sourced by check-smoke-tests.ps1.
# Why: the endpoint's `ok` only means "configured" (health/route.ts `const ok = ...`); the probes are the
# only signal that the Auto-Repair SSH path actually works, and it sat broken 23 days unseen (WORKLOG 2026-09-24).

# Probe object -> host keys it carries. A probe object missing from the response is a finding (endpoint
# changed shape), never a silent pass.
$script:RepairProbeFields = [ordered]@{
    backup_script_probe = @("sg", "eu")
    auto_reboot         = @("sg", "eu")
}

# GAP-03 (health/route.ts): github_app_status. Single-value, unlike the two multi-host probes above,
# and gated by github_configured -- "not configured" is a real, intentional state there (the route's
# own `ok` already requires github_configured to be true), not a shape regression, so it must not
# read the same as a probe silently vanishing. A fixture that never mentions github_configured at all
# (every one of this file's original 10 cases, T25 2026-09-26) is read as "this fixture does not
# describe github", not as a finding -- only a fixture that says github_configured=true is held to
# the bar of also carrying a real, verified github_app_status. no_issues counts as a finding (not
# "ok"): it means the probe could not determine whether the Claude GitHub App is installed at all,
# which is exactly the kind of unverified state T25's "blind-spot warn, not silent pass" is about --
# treating it as a silent pass would hide the same class of gap this whole file exists to catch.
$script:GithubOkStatuses = @("confirmed_by_operator", "auto_detected")

# Returns "<probe>.<host>=<status>" / "github_app_status=<status>" lines, unrolled: callers wrap in
# @(). Empty = every probe healthy.
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

    if (($names -contains "github_configured") -and $Health.github_configured -eq $true) {
        $v = if ($names -contains "github_app_status") { [string]$Health.github_app_status } else { "absent" }
        if ($script:GithubOkStatuses -notcontains $v) { $findings.Add("github_app_status=$v") }
    }

    return $findings.ToArray()
}
