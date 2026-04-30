param(
    [string]$WorkRoot = "",
    [string]$CommitMessage = "",
    [string]$CommitMessageFile = "",
    [switch]$SkipPush,
    [switch]$SkipVerify,
    [switch]$AllowNonPerfectHealth,
    [switch]$AllowPushWhileBehind,
    [switch]$AllowAheadCommits,
    [switch]$SkipTodayRecap,
    [switch]$SkipAutoTaskCheckmarks,
    [switch]$SkipInboxGuard,
    [ValidateSet("warn", "strict", "off")]
    [string]$InboxGuardMode = "warn",
    [ValidateSet("off", "warn", "strict")]
    [string]$CompletenessGate = "strict",
    [switch]$SkipCompletenessGate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\ao-close.ps1.
$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\ao-close.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "ao-close wrapper: owner script missing at $ownerScript"
    exit 1
}

# PSBoundParameters omits params the caller did not specify, so the owner would still use its
# defaults (strict) unless we forward the wrapper-resolved mode explicitly.
$splat = @{}
foreach ($e in $PSBoundParameters.GetEnumerator()) {
    $splat[$e.Key] = $e.Value
}
$splat["InboxGuardMode"] = $InboxGuardMode

& $ownerScript @splat
exit $LASTEXITCODE
