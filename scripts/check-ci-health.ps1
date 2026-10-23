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
Every workflow is ENUMERATED (`gh workflow list`) and then queried individually - it does
not sample "the last N runs" across the repo. A weekly job falls out of any such window the
moment busier workflows produce N newer runs, and would then be missing from the report
rather than reported as red, which is the same silent-pass shape this check exists to catch.
Per workflow, on the default branch:
  - conclusion of the latest concluded run (success / failure / timed_out / ...)
  - how many consecutive runs have failed, and for how long
  - whether the workflow is disabled at all (a gate someone switched off)
An entrenched failure is treated as worse than a fresh one: a single red run is often a
flake or a work-in-progress, while a workflow that has been red for days is a gate that has
been switched off without anyone deciding to switch it off.

A run counts as healthy only if its conclusion is on a short ALLOWLIST (success / skipped /
neutral). Anything else - cancelled, action_required, stale, startup_failure, or a conclusion
GitHub adds in future - is reported rather than assumed fine, so unknown values fail closed.

Verdict:
  GREEN healthy - every workflow's latest concluded run on the default branch is healthy
  YELLOW drift  - a workflow's latest run is not healthy, or a workflow is disabled
  RED broken    - a workflow has been unhealthy for >= 3 consecutive runs or >= 7 days
                  (the 2026-08-15 case was 4 runs / 10 days), gh could not answer, or the
                  workflow list came back truncated so the report cannot claim completeness

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
    # Runs inspected PER WORKFLOW (not a global sample - see the enumeration comment below).
    # Only needs to be deep enough to measure a failure streak; 20 covers weeks of a weekly job.
    [int]$RunsPerWorkflow = 20,
    # Ceiling for the workflow enumeration. Far above any plausible repo; if a result ever
    # comes back AT this number the script reports a blind spot rather than assuming it saw
    # everything (see the truncation check below).
    [int]$WorkflowListLimit = 200,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
. (Join-Path $PSScriptRoot "lib\_detector-contract.ps1")

$ICON_HEALTHY = [char]::ConvertFromUtf32(0x1F7E2)  # green circle
$ICON_DRIFT   = [char]::ConvertFromUtf32(0x1F7E1)  # yellow circle
$ICON_BROKEN  = [char]::ConvertFromUtf32(0x1F534)  # red circle

# A workflow red for this long, or this many runs in a row, is not a flake - it is a gate
# that has been off since then. Calibrated on the 2026-08-15 case: 4 runs across 10 days.
$ENTRENCHED_RUNS = 3
$ENTRENCHED_DAYS = 7

# Conclusions treated as a healthy run. This is deliberately an ALLOWLIST OF GOOD VALUES.
# GitHub's conclusion set includes success, failure, cancelled, skipped, neutral, timed_out,
# action_required, stale, startup_failure - and may grow. Enumerating the BAD ones (which an
# earlier version of this file did) means every value not on that list, including any future
# addition, is silently scored as healthy. Enumerating the good ones fails closed instead:
# an unrecognised conclusion is reported, not waved through.
#   success  - the run passed.
#   skipped  - no jobs ran (path filters / job-level `if`); nothing was asserted, but nothing
#              failed either, so it is not a fault. Shown in the table, no verdict change.
#   neutral  - a check deliberately reported "no opinion".
$HEALTHY_CONCLUSIONS = @("success", "skipped", "neutral")

function Test-RunHealthy {
    param([string]$Conclusion)
    return ($HEALTHY_CONCLUSIONS -contains $Conclusion.ToLowerInvariant())
}

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
    # ENUMERATE the workflows, then ask about each one. Do NOT sample the last N runs across
    # all workflows: a low-frequency workflow (the weekly security audit, say) drops out of
    # that window as soon as busier workflows produce N newer runs, and it then vanishes from
    # the report entirely - so a red weekly gate reads as PASS purely because the repo got
    # busy. That is the same shape as every other bug this file exists to catch: the checker
    # resolving its inputs by a shortcut narrower than reality, then degrading to a silent
    # pass (codex oracle 2026-08-25 round 3, FINDING 3 - confirmed).
    # Cost is one API call per workflow, which is a handful.
    function Invoke-Gh {
        param([string[]]$GhArgs)
        $o = ""; $code = 0
        try {
            Push-Location -LiteralPath $root
            try {
                $captured = Invoke-WithUtf8Console { & gh @GhArgs 2>&1 }
                $code = $LASTEXITCODE
                $o = (($captured | ForEach-Object { [string]$_ }) -join "`n").Trim()
            } finally { Pop-Location }
        } catch { $code = 1; $o = $_.Exception.Message }
        return @{ ExitCode = $code; Output = $o }
    }

    # --limit is a boundary, and a boundary you cannot see past is a blind spot. Raise it well
    # beyond any plausible repo, then CHECK whether the result came back at the limit: if it
    # did, more may exist and this run cannot claim to have seen everything. Round 3 removed
    # the run-sampling boundary and left this one, which is the same defect one level up
    # (codex oracle 2026-08-25 round 4, FINDING 1 - confirmed).
    $wfRes = Invoke-Gh -GhArgs @("workflow", "list", "--limit", "$WorkflowListLimit", "--json", "name,id,state")
    if ($wfRes.ExitCode -ne 0 -or -not $wfRes.Output) {
        Set-Worst "broken"
        $firstLine = if ($wfRes.Output) { ($wfRes.Output -split "`n")[0] } else { "(no output)" }
        $reasons += "BLIND SPOT: gh workflow list failed (exit $($wfRes.ExitCode)): $firstLine - CI state unknown, treat as unverified rather than healthy"
    } else {
        $wfList = $null
        try { $wfList = $wfRes.Output | ConvertFrom-Json } catch { $wfList = $null }
        if ($null -eq $wfList) {
            Set-Worst "broken"
            $reasons += "BLIND SPOT: gh workflow list returned output that is not valid JSON - CI state unknown"
        } elseif (@($wfList).Count -eq 0) {
            Set-Worst "drift"
            $reasons += "no workflows are defined in this repository - nothing to check, which is itself worth noticing"
        } else {
            $probeOk = $true
            # Truncation is indistinguishable from "that is all of them" unless you look.
            if (@($wfList).Count -ge $WorkflowListLimit) {
                Set-Worst "broken"
                $reasons += "BLIND SPOT: gh returned exactly $WorkflowListLimit workflows, the requested maximum - there may be more that were never inspected. Raise -WorkflowListLimit."
            }
            $byWorkflow = @{}
            foreach ($wf in @($wfList)) {
                # Disabled workflows are reported but cannot fail; skipping them silently would
                # hide "someone turned the gate off", so they are surfaced below instead.
                $wfName = [string]$wf.name
                if (-not $wfName) { continue }
                $runRes = Invoke-Gh -GhArgs @("run", "list", "--workflow", [string]$wf.id, "--branch", $defaultBranch, "--limit", "$RunsPerWorkflow", "--json", "conclusion,status,createdAt,url")
                if ($runRes.ExitCode -ne 0) {
                    Set-Worst "broken"
                    $reasons += "BLIND SPOT: could not read runs for '$wfName' (exit $($runRes.ExitCode)) - its state is unknown"
                    continue
                }
                $wfRuns = $null
                try { $wfRuns = $runRes.Output | ConvertFrom-Json } catch { $wfRuns = $null }
                if ($null -eq $wfRuns) { $wfRuns = @() }
                # Keyed by workflow ID, never by display name: two workflow files may carry the
                # same `name:`, and hashing on it lets a green one overwrite a red one so the
                # red never appears at all (codex oracle 2026-08-25 round 4, FINDING 2).
                $byWorkflow[[string]$wf.id] = @{ Name = $wfName; Runs = @($wfRuns); State = [string]$wf.state }
            }

            foreach ($wfId in ($byWorkflow.Keys | Sort-Object { $byWorkflow[$_].Name })) {
                $name = $byWorkflow[$wfId].Name
                $list = $byWorkflow[$wfId].Runs
                $wfState = $byWorkflow[$wfId].State
                if ($wfState -and $wfState -ne "active") {
                    Set-Worst "drift"
                    $reasons += "'$name' is $wfState - a workflow that is not active is a gate that is switched off"
                }
                # Skip runs that have not finished; the latest CONCLUDED run is the state.
                $concluded = @($list | Where-Object { $_.conclusion -and $_.conclusion -ne "" })
                if ($concluded.Count -eq 0) {
                    # "none" and "pending" are different facts and must not render alike: a
                    # workflow that has never run on this branch (PR-only, workflow_dispatch)
                    # is normal, while one whose runs are all still in flight is transient.
                    $latestLabel = if (@($list).Count -eq 0) { "none" } else { "pending" }
                    $workflows += [ordered]@{
                        name = $name; latest = $latestLabel; consecutiveFailures = 0; failingSinceUtc = ""; failingDays = 0; url = ""
                    }
                    continue
                }

                $latest = $concluded[0]
                # ALLOWLIST THE GOOD VALUES. The previous version enumerated three failure
                # conclusions, which silently treated everything else - `cancelled`,
                # `action_required`, `stale`, and any conclusion GitHub adds later - as healthy.
                # Enumerating bad values fails OPEN on anything new; enumerating good values
                # fails CLOSED (codex oracle 2026-08-25 round 4, FINDING 3 - confirmed).
                $isFail = -not (Test-RunHealthy -Conclusion ([string]$latest.conclusion))

                $streak = 0
                $since = $null
                if ($isFail) {
                    foreach ($r in $concluded) {
                        if (-not (Test-RunHealthy -Conclusion ([string]$r.conclusion))) {
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
                $reasons += "workflows are defined but none has ever run on '$defaultBranch' - either CI is not wired up or the probe is looking at the wrong branch"
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
$lines += ("- Method: every workflow enumerated; last {0} run(s) of each inspected on ``{1}``" -f $RunsPerWorkflow, $defaultBranch)
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
    runsPerWorkflow = $RunsPerWorkflow
    probeOk        = $probeOk
    workflows      = $workflows
    verdict        = $worst
    verdictLabel   = $userLabel
    findings       = $reasons
}
# measured = workflows whose latest concluded run was actually evaluated (never-run / all-pending are not).
$measuredWorkflows = @($workflows | Where-Object { $_.latest -notin @("none", "pending") }).Count
$fields = @{}
foreach ($k in $payload.Keys) { $fields[$k] = $payload[$k] }
Write-DetectorArtifact -Path (Join-Path $reportDir "ci-LATEST.json") -Overall $userLabel -Measured $measuredWorkflows -Fields $fields | Out-Null

if ($Json) {
    $payload | ConvertTo-Json -Depth 6
} else {
    Write-Host ("CI health: {0} {1}" -f $icon, $userLabel)
    Write-Host ("  workflows={0}" -f $workflows.Count)
    foreach ($r in $reasons) { Write-Host ("  - {0}" -f $r) -ForegroundColor Yellow }
}

exit 0
