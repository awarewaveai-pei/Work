# Verdict for `podOrderInbox` from GET /api/internal/pod-orders/stats (lib/studio/pod-order-inbox.ts getPodOrderInboxStats).
# Paid Woo orders live there until a Printful draft exists; WooCommerce never re-sends, so a row that
# stops moving is a lost sale unless someone sees it. Findings, not a pass, when the field is missing or
# unreadable -- a silent probe is the failure this exists to catch.
$script:PodInboxDeferredMaxSeconds = 3600

# Returns "<what>=<value>" lines, unrolled: callers wrap in @(). Empty = nothing waiting too long.
function Get-PodOrderInboxFindings {
    param([Parameter(Mandatory)] $Modes)
    $names = @($Modes.PSObject.Properties.Name)
    if ($names -notcontains "podOrderInbox" -or $null -eq $Modes.podOrderInbox) { return @("pod_order_inbox=absent") }
    $s = $Modes.podOrderInbox
    if ($s.ok -ne $true) { return @("pod_order_inbox=unreadable") }
    $findings = New-Object System.Collections.Generic.List[string]
    if ($s.deferred -gt 0 -and $s.oldestDeferredAgeSeconds -ge $script:PodInboxDeferredMaxSeconds) {
        $findings.Add("deferred=$($s.deferred)_oldest_$([math]::Floor($s.oldestDeferredAgeSeconds / 60))min")
    }
    # A retry due for 30+ min that nobody ran = no drain trigger is firing (the 10-minute sweep is down).
    if ($s.overdueRetries -gt 0) { $findings.Add("retry_overdue=$($s.overdueRetries)") }
    if ($s.gaveUp -gt 0) { $findings.Add("needs_manual=$($s.gaveUp)") }
    if ($s.stuckPending -gt 0) { $findings.Add("stuck=$($s.stuckPending)") }
    return $findings.ToArray()
}
