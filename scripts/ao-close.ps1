# AO-CLOSE: monorepo verify-build-gates -> system-guard (doc-sync + health + guard) ->
#   generate integrated-status report -> git commit + push.
# Run AFTER updating TASKS.md, WORKLOG.md, and memory files so they are included in the commit.
# May be invoked from monorepo root scripts\ OR agency-os\scripts\ (keep both copies identical).
# -SkipPush: no git commit/push (still runs gates and reports).
# -SkipVerify: skip verify-build-gates (faster; not recommended before company pull).

param(
    [string]$WorkRoot = "",
    [string]$CommitMessage = "",
    [switch]$SkipPush,
    [switch]$SkipVerify,
    [switch]$AllowNonPerfectHealth
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} else {
    $fromWorkScripts = Join-Path $PSScriptRoot "..\agency-os\scripts\system-guard.ps1"
    $fromAgencyScripts = Join-Path $PSScriptRoot "system-guard.ps1"
    if (Test-Path -LiteralPath $fromWorkScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } elseif (Test-Path -LiteralPath $fromAgencyScripts) {
        $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    } else {
        Write-Error "ao-close: cannot locate system-guard.ps1 (expected under monorepo). PSScriptRoot=$PSScriptRoot"
        exit 1
    }
}

$agencyRoot = Join-Path $WorkRoot "agency-os"
$guardScript = Join-Path $agencyRoot "scripts\system-guard.ps1"
if (-not (Test-Path -LiteralPath $guardScript)) {
    Write-Error "ao-close: missing system-guard at $guardScript"
    exit 1
}

$verifyScript = Join-Path $WorkRoot "scripts\verify-build-gates.ps1"
if (-not $SkipVerify -and (Test-Path -LiteralPath $verifyScript)) {
    Write-Host "== AO-CLOSE: verify-build-gates (lobster bootstrap + agency health) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifyScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: verify-build-gates failed (exit $LASTEXITCODE). Fix before push."
        exit $LASTEXITCODE
    }
} elseif ($SkipVerify) {
    Write-Host "== AO-CLOSE: -SkipVerify set; skipping verify-build-gates ==" -ForegroundColor Yellow
}

Write-Host "== AO-CLOSE: system-guard (doc-sync + health + guard) ==" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guardScript -WorkspaceRoot $agencyRoot -Mode manual
$guardExit = $LASTEXITCODE
if ($guardExit -ne 0) {
    Write-Error "ao-close: system-guard failed (exit $guardExit). Fix health/closeout before push."
    exit $guardExit
}

$genScript = Join-Path $agencyRoot "scripts\generate-integrated-status-report.ps1"
if (Test-Path -LiteralPath $genScript) {
    Write-Host "== AO-CLOSE: generate integrated-status report ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $genScript -WorkspaceRoot $agencyRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: generate-integrated-status-report failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# Enforce health score = 100% by default (unless explicitly relaxed).
$healthDir = Join-Path $agencyRoot "reports\health"
if (Test-Path -LiteralPath $healthDir) {
    $latestHealth = Get-ChildItem -LiteralPath $healthDir -Filter "health-*.md" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($latestHealth) {
        $healthText = Get-Content -LiteralPath $latestHealth.FullName -Raw -Encoding UTF8
        $scoreMatch = [regex]::Match($healthText, 'Score:\s*\*\*([0-9]+(?:\.[0-9]+)?)%')
        if ($scoreMatch.Success) {
            $score = [double]$scoreMatch.Groups[1].Value
            if (($score -lt 100.0) -and (-not $AllowNonPerfectHealth)) {
                Write-Error "ao-close: health score is $score% (<100%). Fix remaining checks or rerun with -AllowNonPerfectHealth only when explicitly approved."
                exit 1
            }
            if (($score -lt 100.0) -and $AllowNonPerfectHealth) {
                Write-Host "== AO-CLOSE: health score $score% allowed by -AllowNonPerfectHealth ==" -ForegroundColor Yellow
            }
        } elseif (-not $AllowNonPerfectHealth) {
            Write-Error "ao-close: unable to parse health score from $($latestHealth.FullName)."
            exit 1
        }
    }
}

if ($SkipPush) {
    Write-Host "== AO-CLOSE: -SkipPush set; skipping git commit/push ==" -ForegroundColor Yellow
    exit 0
}

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: not a git repository at $WorkRoot"
        exit 1
    }

    git add -A
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: git add failed"
        exit 1
    }

    $staged = @(git diff --cached --name-only | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    foreach ($p in $staged) {
        if ($p -match '(?i)(^|/)\.claude/|\.credentials\.json$|(^|/)mcp-local-wrappers/node_modules/') {
            Write-Error "ao-close: blocked sensitive or ignored path from staging: $p"
            exit 1
        }
    }

    $hasStaged = $staged.Count -gt 0
    if ($hasStaged) {
        if (-not $CommitMessage) {
            $CommitMessage = "chore: AO-CLOSE sync " + (Get-Date -Format "yyyy-MM-dd HHmm")
        }
        git commit -m $CommitMessage
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ao-close: git commit failed"
            exit 1
        }
    } else {
        Write-Host "== AO-CLOSE: nothing to commit (working tree clean after add) ==" -ForegroundColor DarkGray
    }

    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    Write-Host "== AO-CLOSE: git push origin $branch ==" -ForegroundColor Cyan
    git push origin $branch
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ao-close: git push failed (check auth / network)"
        exit 1
    }
    Write-Host "ao-close: done (verify + guard + integrated report + push OK)." -ForegroundColor Green
} finally {
    Pop-Location
}
exit 0
