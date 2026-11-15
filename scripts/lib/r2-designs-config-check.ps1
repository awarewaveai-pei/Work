# Drift check for the R2 designs bucket's CORS/lifecycle (PLAN-designs-direct-upload.md C2 follow-up).
# Why: CORS origins come from STAFF_HOSTS / PRODUCT_HOST_* / products.ts. A new product door or a changed domain
# leaves the bucket's origin list stale and browser direct uploads fail at the R2 preflight with no other signal.
#
# Dot-source this file; call Get-R2DesignsConfigState. It SSHes once for the prod container's env
# (only the names in $allow are kept, values live in this process's memory and in the child's env, never printed),
# then runs `tsx scripts/r2-designs-bucket-config.ts --check` (read only; GET cors + GET lifecycle).
# state: in_sync | not_applied (the bucket has neither of our rules yet = --apply still waits for the operator;
#        NOT a drift) | drift (applied but stale/half) | unmeasured (ssh/tsx/token problem; never reported as healthy).
# The note never contains env values: $probe.Output is deliberately not echoed on failure.

function Find-TsxCmd {
    param([string]$RepoRoot)
    $adm = 'lobster-factory\infra\hetzner-phase1-core\apps\next-admin\node_modules\.bin\tsx.cmd'
    $roots = New-Object System.Collections.Generic.List[string]
    $roots.Add($RepoRoot)
    # A linked worktree has no node_modules of its own: the main checkout is the parent of the common git dir.
    $common = (& git -C $RepoRoot rev-parse --path-format=absolute --git-common-dir 2>$null)
    if ($LASTEXITCODE -eq 0 -and $common) {
        $mainRoot = Split-Path -Parent (($common | Select-Object -First 1).Trim() -replace '/', '\')
        if ($mainRoot -and $mainRoot -ne $RepoRoot) { $roots.Add($mainRoot) }
    }
    foreach ($r in $roots) {
        foreach ($rel in @('node_modules\.bin\tsx.cmd', $adm)) {
            $p = Join-Path $r $rel
            if (Test-Path -LiteralPath $p) { return $p }
        }
    }
    return $null
}

function Get-R2DesignsConfigState {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][scriptblock]$InvokeSsh   # { param($Cmd) } -> @{ ExitCode; Output; TimedOut }
    )
    $res = @{ state = 'unmeasured'; note = '' }
    $tsx = Find-TsxCmd -RepoRoot $RepoRoot
    $script = Join-Path $RepoRoot 'scripts\r2-designs-bucket-config.ts'
    if (-not $tsx) { $res.note = 'tsx not found (repo node_modules, next-admin node_modules, main checkout)'; return $res }
    if (-not (Test-Path -LiteralPath $script)) { $res.note = "missing $script"; return $res }

    $probe = & $InvokeSsh 'sudo docker exec lobster-next-admin printenv'
    if ($probe.ExitCode -ne 0) { $res.note = "env probe failed (exit $($probe.ExitCode), timedOut=$($probe.TimedOut))"; return $res }
    $allow = '^(STAFF_HOSTS|PUBLIC_BASE_DOMAIN|PORTAL_HOST|PRODUCT_HOST_[A-Z0-9_]+|R2_API_TOKEN|R2_ACCOUNT_ID|R2_DESIGNS_BUCKET)$'
    $env2 = @{}
    foreach ($line in ($probe.Output -split "`n")) {
        $i = $line.IndexOf('=')
        if ($i -lt 1) { continue }
        $k = $line.Substring(0, $i).Trim()
        if ($k -match $allow) { $env2[$k] = $line.Substring($i + 1).TrimEnd("`r") }
    }
    if (-not $env2['R2_API_TOKEN'] -or -not $env2['R2_ACCOUNT_ID']) { $res.note = 'container has no R2_API_TOKEN/R2_ACCOUNT_ID'; return $res }

    # The child sees exactly the container's values: a whitelisted name the container does not set is cleared too
    # (a leftover local R2_DESIGNS_BUCKET / PRODUCT_HOST_* would otherwise point the check at the wrong bucket/hosts).
    $names = @($env2.Keys) + @(Get-ChildItem Env: | Where-Object { $_.Name -match $allow } | ForEach-Object { $_.Name }) | Sort-Object -Unique
    $saved = @{}
    foreach ($k in $names) { $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process'); [Environment]::SetEnvironmentVariable($k, $env2[$k], 'Process') }
    $oldEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $out = & $tsx $script '--check' 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldEap
        foreach ($k in $names) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
    }
    $m = [regex]::Match(($out -join "`n"), 'CHECK_STATE=(in_sync|not_applied|drift)')
    if ($m.Success -and (($code -eq 0 -and $m.Groups[1].Value -eq 'in_sync') -or ($code -eq 6 -and $m.Groups[1].Value -eq 'not_applied') -or ($code -eq 5 -and $m.Groups[1].Value -eq 'drift'))) {
        $res.state = $m.Groups[1].Value
        $res.note = if ($res.state -eq 'drift') { 'bucket CORS/lifecycle differs from what the container env + products.ts imply; see: tsx scripts/r2-designs-bucket-config.ts --dry-run (host env from the container), then --apply after the operator says go' } elseif ($res.state -eq 'not_applied') { 'not applied yet (waiting for the operator go on PLAN-designs-direct-upload.md C2)' } else { '' }
        return $res
    }
    # exit 2 = no creds, 3 = token refused (401/403/9106), 1 = other error incl. bucket missing (404 code 10006).
    $res.note = "r2-designs-bucket-config --check exit $code (2=no creds, 3=token refused, 1=other error e.g. bucket missing); run it by hand for the message"
    return $res
}
