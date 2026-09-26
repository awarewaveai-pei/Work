# Regression tests for scripts/lib/pod-order-inbox-probe.ps1.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/pod-order-inbox-probe.test.ps1

$ErrorActionPreference = 'Stop'
. (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\scripts\lib\pod-order-inbox-probe.ps1')).Path

$failures = New-Object System.Collections.Generic.List[string]
$script:asserts = 0
function Assert-Eq {
    param($Expected, $Actual, [string]$Message)
    $script:asserts++
    if ("$Expected" -ne "$Actual") { $script:failures.Add("$Message (expected=[$Expected] actual=[$Actual])") }
}
function Findings { param([string]$Json) (@(Get-PodOrderInboxFindings -Modes ($Json | ConvertFrom-Json)) -join ",") }
function Inbox { param([string]$Fields) '{"ok":true,"current":{"mode":"normal"},"podOrderInbox":{"ok":true,"deferred":0,"oldestDeferredAgeSeconds":null,"retrying":0,"overdueRetries":0,"gaveUp":0,"stuckPending":0,"capped":false' + $Fields + '}}' }

Assert-Eq "" (Findings (Inbox "")) "empty inbox -> no findings"
Assert-Eq "" (Findings (Inbox ',"retrying":2')) "retries on schedule are not a finding"
Assert-Eq "retry_overdue=1" (Findings (Inbox ',"retrying":2,"overdueRetries":1')) "a retry nobody ran -> finding (sweep down)"
Assert-Eq "" (Findings (Inbox ',"deferred":3,"oldestDeferredAgeSeconds":3599')) "deferred under an hour -> no finding"
Assert-Eq "deferred=3_oldest_60min" (Findings (Inbox ',"deferred":3,"oldestDeferredAgeSeconds":3600')) "deferred an hour -> finding"
Assert-Eq "needs_manual=1" (Findings (Inbox ',"gaveUp":1')) "gave up -> finding"
Assert-Eq "stuck=2" (Findings (Inbox ',"stuckPending":2')) "stuck pending -> finding"
Assert-Eq "pod_order_inbox=unreadable" (Findings '{"ok":true,"podOrderInbox":{"ok":false,"error":"permission denied"}}') "unreadable table -> finding, not zeros"
Assert-Eq "pod_order_inbox=absent" (Findings '{"ok":true,"current":{"mode":"normal"}}') "endpoint without the field -> finding"

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "FAIL: $_" -ForegroundColor Red }
    exit 1
}
Write-Host ("PASS: pod-order-inbox-probe ({0} cases)" -f $script:asserts) -ForegroundColor Green
