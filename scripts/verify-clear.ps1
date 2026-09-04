<#
.SYNOPSIS
  /verify-recent Step 4 as a script: list the session's unverified-code tracker and clear it, in a command
  that contains NO `git commit` (verify-gate-commit.js blocks a whole Bash command at PreToolUse, so the
  clear can never ride along in the same command as the commit -- 2026-09-04 lesson).

.DESCRIPTION
  Honest-use contract: run this ONLY after the four R0 verification actions are done and recorded in today's
  WORKLOG (REALTEST_EVIDENCE / REVIEW_DONE or REVIEW_WAIVED / BUGHUNT_DONE). The script does not check that
  for you (verify-closeout-completeness.ps1 does, at AO-CLOSE); it prints what it is clearing so the
  transcript carries the evidence of what was released.

  Paths outside the repo root (scratchpad / %TEMP% scripts the session ran and threw away) are listed
  separately: they are not part of any commit and were never the reason the gate exists.

  Repo root is derived from this script's own location (scripts/ is one level below the root), so no
  native-command output is captured -- the CP950 trap class audit-cp950-traps.ps1 exists for.

.PARAMETER WhatIf
  Print the tracker contents without deleting.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clear.ps1
#>
[CmdletBinding()]
param([switch]$WhatIf)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $repoRoot 'scripts\verify-sid-shared.ps1')
Push-Location -LiteralPath $repoRoot
try {
    $sid = Get-VerifySid
    $tf  = Get-VerifyTrackerPath -Sid $sid
    if (-not (Test-Path -LiteralPath $tf)) {
        Write-Host "verify-clear: tracker is empty (sid=$sid) -- nothing to clear; git commit is already unblocked."
        exit 0
    }
    $files = @(Get-Content -LiteralPath $tf -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '^#' }) | Sort-Object -Unique
    $rootLower = $repoRoot.ToLowerInvariant()
    $inRepo  = @($files | Where-Object { $_.ToLowerInvariant().StartsWith($rootLower) })
    $outside = @($files | Where-Object { -not $_.ToLowerInvariant().StartsWith($rootLower) })
    Write-Host "verify-clear: sid=$sid"
    Write-Host ("  repo code files released ({0}):" -f $inRepo.Count)
    $inRepo | ForEach-Object { Write-Host "    - $_" }
    if ($outside.Count -gt 0) {
        Write-Host ("  outside-repo scratch files ({0}, not committable, listed for the record):" -f $outside.Count)
        $outside | ForEach-Object { Write-Host "    - $_" }
    }
    if ($WhatIf) { Write-Host "verify-clear: -WhatIf, tracker kept."; exit 0 }
    Remove-Item -LiteralPath $tf -Force
    Write-Host "verify-clear: tracker cleared. git commit is unblocked. (Evidence lines must already be in today's WORKLOG.)"
} finally { Pop-Location }
