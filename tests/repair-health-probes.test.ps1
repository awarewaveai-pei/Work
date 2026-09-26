# Regression tests for scripts/lib/repair-health-probes.ps1.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/repair-health-probes.test.ps1

$ErrorActionPreference = 'Stop'
. (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\scripts\lib\repair-health-probes.ps1')).Path

$failures = New-Object System.Collections.Generic.List[string]
$script:asserts = 0
function Assert-Eq {
    param($Expected, $Actual, [string]$Message)
    $script:asserts++
    if ("$Expected" -ne "$Actual") { $script:failures.Add("$Message (expected=[$Expected] actual=[$Actual])") }
}
# Same object shape Invoke-RestMethod hands check-smoke-tests.ps1.
function New-Health { param([string]$Json) $Json | ConvertFrom-Json }
function Findings { param($H) (@(Get-RepairProbeFindings -Health $H) -join ",") }

$healthy = '{"ok":true,"eu_backup_required":true,"backup_script_probe":{"sg":"ok","eu":"ok"},"auto_reboot":{"enabled_policy":true,"sg":"ok","eu":"ok"}}'
Assert-Eq "" (Findings (New-Health $healthy)) "all ok -> no findings"

# The 23-day incident shape: ok=true, probes ssh_error.
$dead = '{"ok":true,"eu_backup_required":true,"backup_script_probe":{"sg":"ssh_error","eu":"ssh_error"},"auto_reboot":{"sg":"ssh_error","eu":"ok"}}'
Assert-Eq "backup_script_probe.sg=ssh_error,backup_script_probe.eu=ssh_error,auto_reboot.sg=ssh_error" (Findings (New-Health $dead)) "ssh_error surfaces"

Assert-Eq "backup_script_probe.sg=not_found,auto_reboot.eu=missing" (Findings (New-Health '{"eu_backup_required":true,"backup_script_probe":{"sg":"not_found","eu":"ok"},"auto_reboot":{"sg":"ok","eu":"missing"}}')) "not_found / missing surface"

Assert-Eq "" (Findings (New-Health '{"backup_script_probe":{"sg":"skipped","eu":"skipped","note":"webhook_mode"},"auto_reboot":{"sg":"skipped","eu":"skipped"}}')) "webhook mode skipped -> no findings"

# EU unconfigured: fine only when EU backup is not required.
Assert-Eq "" (Findings (New-Health '{"eu_backup_required":false,"backup_script_probe":{"sg":"ok","eu":"unconfigured"},"auto_reboot":{"sg":"ok","eu":"unconfigured"}}')) "eu unconfigured + not required -> ok"
Assert-Eq "backup_script_probe.eu=unconfigured,auto_reboot.eu=unconfigured" (Findings (New-Health '{"eu_backup_required":true,"backup_script_probe":{"sg":"ok","eu":"unconfigured"},"auto_reboot":{"sg":"ok","eu":"unconfigured"}}')) "eu unconfigured + required -> finding"
Assert-Eq "backup_script_probe.sg=unconfigured" (Findings (New-Health '{"eu_backup_required":false,"backup_script_probe":{"sg":"unconfigured","eu":"ok"},"auto_reboot":{"sg":"ok","eu":"ok"}}')) "sg unconfigured is always a finding"

# Endpoint shape drift is never a silent pass.
Assert-Eq "backup_script_probe=absent,auto_reboot=absent" (Findings (New-Health '{"ok":true}')) "probe objects absent"
Assert-Eq "backup_script_probe.eu=absent" (Findings (New-Health '{"backup_script_probe":{"sg":"ok"},"auto_reboot":{"sg":"ok","eu":"ok"},"eu_backup_required":true}')) "host key absent"
# Cloudflare interstitial: a non-JSON 200 arrives as a string.
Assert-Eq "backup_script_probe=absent,auto_reboot=absent" (Findings "<html>challenge</html>") "string body"

# --- T25 (2026-09-26): GAP-03 -- with GitHub configured, the repo must be reachable (repairs file
# their issue there). app_status is cosmetic and never a finding, whatever its value.
$healthyBase = '"backup_script_probe":{"sg":"ok","eu":"ok"},"auto_reboot":{"sg":"ok","eu":"ok"},"eu_backup_required":true'
Assert-Eq "" (Findings (New-Health ("{$healthyBase,`"github_configured`":true,`"github_repo_accessible`":true,`"github_app_status`":`"unverified`"}"))) "github reachable + app unverified -> ok (prod steady state)"
Assert-Eq "github_repo_accessible=False" (Findings (New-Health ("{$healthyBase,`"github_configured`":true,`"github_repo_accessible`":false}"))) "github repo 404 -> finding"
Assert-Eq "github_repo_accessible=null" (Findings (New-Health ("{$healthyBase,`"github_configured`":true,`"github_repo_accessible`":null}"))) "github token/network error (null) -> finding"
Assert-Eq "" (Findings (New-Health ("{$healthyBase,`"github_configured`":false,`"github_repo_accessible`":null}"))) "github not configured -> no finding"
# Endpoint shape drift: configured but the field is gone is never a silent pass.
Assert-Eq "github_repo_accessible=absent" (Findings (New-Health ("{$healthyBase,`"github_configured`":true}"))) "github_repo_accessible absent while configured=true -> finding"

# A fixture that never mentions github at all (pre-T25 shape) must produce IDENTICAL findings to
# before this change -- the github check is skipped entirely, not evaluated-and-passed.
Assert-Eq "" (Findings (New-Health ("{$healthyBase}"))) "fixture omitting github entirely -> unaffected (backward compatible)"

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "FAIL: $_" -ForegroundColor Red }
    exit 1
}
Write-Host ("PASS: repair-health-probes ({0} cases)" -f $script:asserts) -ForegroundColor Green
exit 0
