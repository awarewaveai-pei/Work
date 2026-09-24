# Regression tests for scripts/lib/repair-health-probes.ps1.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/repair-health-probes.test.ps1

$ErrorActionPreference = 'Stop'
. (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\scripts\lib\repair-health-probes.ps1')).Path

$failures = New-Object System.Collections.Generic.List[string]
function Assert-Eq {
    param($Expected, $Actual, [string]$Message)
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

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "FAIL: $_" -ForegroundColor Red }
    exit 1
}
Write-Host "PASS: repair-health-probes (10 cases)" -ForegroundColor Green
exit 0
