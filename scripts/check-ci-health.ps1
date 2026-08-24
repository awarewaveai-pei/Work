#requires -Version 5.1
<#
.SYNOPSIS
Report the state of GitHub Actions workflows on main; write reports/status/ci-LATEST.md (+ .json).

.DESCRIPTION
Auto-called by ao-resume.ps1 alongside check-backup-health.ps1 / check-cloudflare-security.ps1 /
check-vps-auto-reboot-health.ps1 / check-clickhouse-health.ps1. Follows the pattern in
runbooks/ADD-PERIODIC-HEALTH-CHECK.md.

WHY THIS EXISTS
Nothing in this repo looked at CI. Discovered 2026-08-25 while root-causing the fifth
ClickHouse incident: the workflow `Trigger infra config guard` had been FAILING on every
push since 2026-08-15 08:04:50Z - four consecutive red runs across ten days - and nobody
noticed. The commit that turned it red was the fix for the FOURTH ClickHouse incident, and
the assertion it tripped was a stale one from ClickHouse 24.8. So the guard that existed to
stop ClickHouse config regressions was itself broken, silently, for the entire window in
which the next ClickHouse incident developed.

That is the whole argument for this check. A gate nobody watches is not a gate, and the
repo had no mechanism at all for noticing one had gone red. Per
memory/feedback_operator_zero_memory_automation.md, a slash command would not have fixed
this either - the operator has to be told without remembering to ask, which means it has to
ride an already-running flow. AO-RESUME is that flow.

WHAT THIS CHECKS
For each workflow, the most recent run on the default branch:
  - conclusion of the latest run (success / failure / cancelled / timed_out / ...)
  - how many consecutive runs have failed, and for how long
An entrenched failure is treated as worse than a fresh one: a single red run is often a
flake or a work-in-progress, while a workflow that has been red for days is a gate that has
been switched off without anyone deciding to switch it off.

Verdict:
  GREEN healthy - every workflow's latest run on the default branch succeeded (or is pending)
  YELLOW drift  - at least one workflow's latest run failed
  RED broken    - a workflow has been failing for >= 3 consecutive runs or >= 7 days
                  (the 2026-08-15 case was 4 runs / 10 days), or gh itself could not answer

Exit code: always 0 (warn-only, same convention as the sibling checks).

.NOTES
Requires the `gh` CLI, authenticated. If gh is missing or fails, this reports a BLIND SPOT
rather than success - a detector that cannot see must never look like a healthy system
(AGENTS.md: the failure mode where the detector going quiet resembles everything being fine).

PS5.1 source-encoding rule: no unicode emoji literals in source. Big5 console parser
crashes on multi-byte chars without BOM. Emoji are produced at output time only.
#>
[CmdletBinding()]
param(
    [string]$WorkRoot = "",
    [int]$Limit = 100,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

$ICON_HEALTHY = [char]::ConvertFromUtf32(0x1F7E2)  # green circle
$ICON_DRIFT   = [char]::ConvertFromUtf32(0x1F7E1)  # yellow circle
$ICON_BROKEN  = [char]::ConvertFromUtf32(0x1F534)  # red circle

# A workflow red for this long, or this many runs in a row, is not a flake - it is a gate
# that has been off since then. Calibrated on the 2026-08-15 case: 4 runs across 10 days.
$ENTRENCHED_RUNS = 3
$ENTRENCHED_DAYS = 7

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) {
        return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    }
    return (Get-Location).Path
}

$root = Resolve-Root -InputRoot $WorkRoot

$reasons = @()
$worst = "healthy"

function Set-Worst {
    param([string]$Level)
    $order = @{ "healthy" = 0; "drift" = 1; "broken" = 2 }
    if ($order[$Level] -gt $order[$script:worst]) { $script:worst = $Level }
}

$workflows = @()
$probeOk = $false
$defaultBranch = "main"

$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghCmd) {
    Set-Worst "broken"
    $reasons += "BLIND SPOT: the gh CLI is not installed, so CI state could not be read at all - this is not a passing check"
} else {
    $raw = ""
    $ghExit = 0
    try {
        Push-Location -LiteralPath $root
        try {
            $out = Invoke-WithUtf8Console {
                & gh run list --branch $defaultBranch --limit $Limit --json workflowName,conclusion,status,createdAt,displayTitle,url 2>&1
            }
            $ghExit = $LASTEXITCODE
            $raw = (($out | ForEach-Object { [string]$_ }) -join "`n").Trim()
        } finally { Pop-Location }
    } catch {
        $ghExit = 1
        $raw = $_.Exception.Message
    }

    if ($ghExit -ne 0 -or -not $raw) {
        Set-Worst "broken"
        $firstLine = if ($raw) { ($raw -split "`n")[0] } else { "(no output)" }
        $reasons += "BLIND SPOT: gh run list failed (exit $ghExit): $firstLine - CI state unknown, treat as unverified rather than healthy"
    } else {
        $runs = $null
        try { $runs = $raw | ConvertFrom-Json } catch { $runs = $null }
        if ($null -eq $runs) {
            Set-Worst "broken"
            $reasons += "BLIND SPOT: gh returned output that is not valid JSON - CI state unknown"
        } else {
            $probeOk = $true
            # Newest first is gh's own ordering; group by workflow and keep that order.
            $byWorkflow = @{}
            foreach ($r in @($runs)) {
                $name = [string]$r.workflowName
                if (-not $name) { continue }
                if (-not $byWorkflow.ContainsKey($name)) { $byWorkflow[$name] = New-Object System.Collections.ArrayList }
                [void]$byWorkflow[$name].Add($r)
            }

            foreach ($name in ($byWorkflow.Keys | Sort-Object)) {
                $list = $byWorkflow[$name]
                # Skip runs that have not finished; the latest CONCLUDED run is the state.
                $concluded = @($list | Where-Object { $_.conclusion -and $_.conclusion -ne "" })
                if ($concluded.Count -eq 0) {
                    $workflows += [ordered]@{
                        name = $name; latest = "pending"; consecutiveFailures = 0; failingSinceUtc = ""; failingDays = 0; url = ""
                    }
                    continue
                }

                $latest = $concluded[0]
                $isFail = ($latest.conclusion -in @("failure", "timed_out", "startup_failure"))

                $streak = 0
                $since = $null
                if ($isFail) {
                    foreach ($r in $concluded) {
                        if ($r.conclusion -in @("failure", "timed_out", "startup_failure")) {
                            $streak++
                            $since = $r.createdAt
                        } else { break }
                    }
                }

                $days = 0
                if ($since) {
                    try { $days = [int]([DateTime]::UtcNow - ([DateTime]$since).ToUniversalTime()).TotalDays } catch { $days = 0 }
                }

                $workflows += [ordered]@{
                    name                = $name
                    latest              = [string]$latest.conclusion
                    consecutiveFailures = $streak
                    failingSinceUtc     = [string]$since
                    failingDays         = $days
                    url                 = [string]$latest.url
                }

                if ($isFail) {
                    # Entrenched failures rank above fresh ones: a workflow red for a week is a
                    # gate that has been off for a week, which is what happened on 2026-08-15.
                    if ($streak -ge $ENTRENCHED_RUNS -or $days -ge $ENTRENCHED_DAYS) {
                        Set-Worst "broken"
                        $reasons += "'$name' has been failing for $streak consecutive run(s) over $days day(s) - this gate has been off that whole time: $($latest.url)"
                    } else {
                        Set-Worst "drift"
                        $reasons += "'$name' latest run on $defaultBranch is $($latest.conclusion): $($latest.url)"
                    }
                }
            }

            if ($workflows.Count -eq 0) {
                Set-Worst "drift"
                $reasons += "no workflow runs found on '$defaultBranch' in the last $Limit runs - either CI is not wired up or the probe is looking at the wrong branch"
            }
        }
    }
}

$userLabel = switch ($worst) { "healthy" { "PASS" } "drift" { "WARN" } "broken" { "FAIL" } default { "UNKNOWN" } }
$icon      = switch ($worst) { "healthy" { $ICON_HEALTHY } "drift" { $ICON_DRIFT } "broken" { $ICON_BROKEN } default { $ICON_DRIFT } }

$reportDir = Join-Path $root "agency-os\reports\status"
if (-not (Test-Path -LiteralPath $reportDir)) {
    New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
}

$now = Get-Date
$lines = @()
$lines += "# CI health (GitHub Actions, branch $defaultBranch)"
$lines += ""
$lines += ("- Generated: {0}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"))
$lines += ("- Overall: **{0} {1}**" -f $icon, $userLabel)
$lines += ("- Sampled: last {0} runs on ``{1}``" -f $Limit, $defaultBranch)
$lines += ""
$lines += "## Workflows"
$lines += ""
if ($workflows.Count -gt 0) {
    $lines += "| Workflow | Latest | Consecutive failures | Failing for |"
    $lines += "|----------|--------|----------------------|-------------|"
    foreach ($w in $workflows) {
        $failFor = if ($w.consecutiveFailures -gt 0) { "$($w.failingDays)d" } else { "-" }
        $streak  = if ($w.consecutiveFailures -gt 0) { $w.consecutiveFailures } else { "-" }
        $lines += ("| {0} | {1} | {2} | {3} |" -f ($w.name -replace '\|', '\|'), $w.latest, $streak, $failFor)
    }
} else {
    $lines += "_No workflow data (see findings)._"
}
$lines += ""
$lines += "## Findings"
$lines += ""
if ($reasons.Count -eq 0) {
    $lines += "- Every workflow's latest run on $defaultBranch succeeded."
} else {
    foreach ($r in $reasons) { $lines += ("- {0}" -f $r) }
}
$lines += ""
$lines += "## Why this check exists"
$lines += ""
$lines += "Nothing watched CI. Found on 2026-08-25 while root-causing the fifth ClickHouse incident:"
$lines += "``Trigger infra config guard`` had failed on every push since 2026-08-15 - four red runs over"
$lines += "ten days - and the commit that turned it red was the fix for the FOURTH ClickHouse incident."
$lines += "The gate meant to stop ClickHouse config regressions was itself off for the whole window in"
$lines += "which the next ClickHouse incident developed. A gate nobody watches is not a gate."
$lines += ""
$lines += "Pattern: ``runbooks/ADD-PERIODIC-HEALTH-CHECK.md``"

$content = ($lines -join "`n") + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $reportDir "ci-LATEST.md"), $content, $utf8NoBom)

$payload = [ordered]@{
    schemaVersion  = 1
    generatedAtUtc = $now.ToUniversalTime().ToString("o")
    branch         = $defaultBranch
    sampledRuns    = $Limit
    probeOk        = $probeOk
    workflows      = $workflows
    verdict        = $worst
    verdictLabel   = $userLabel
    findings       = $reasons
}
[System.IO.File]::WriteAllText(
    (Join-Path $reportDir "ci-LATEST.json"),
    ($payload | ConvertTo-Json -Depth 6),
    $utf8NoBom)

if ($Json) {
    $payload | ConvertTo-Json -Depth 6
} else {
    Write-Host ("CI health: {0} {1}" -f $icon, $userLabel)
    Write-Host ("  workflows={0}" -f $workflows.Count)
    foreach ($r in $reasons) { Write-Host ("  - {0}" -f $r) -ForegroundColor Yellow }
}

exit 0
