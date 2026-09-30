param(
    [string]$WorkRoot = "",
    [switch]$NoFetch,
    [string]$Pattern = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Canonical UTF-8-safe git wrappers. Every value below feeds a comparison,
# count, path loop, or user-visible audit output, so bare native capture is unsafe on CP950 hosts.
. (Join-Path $PSScriptRoot 'lib\git-safe-ops.ps1')

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

Push-Location $WorkRoot
try {
    $repoCheck = Invoke-SafeGitCapture -GitArgs @('rev-parse', '--git-dir')
    if ($repoCheck.ExitCode -ne 0) {
        throw "Not a git repository: $WorkRoot"
    }

    Write-Host "== git-audit-tracked-remote ==" -ForegroundColor Cyan
    Write-Host "Work root: $WorkRoot"
    Write-Host ""

    if (-not $NoFetch) {
        Invoke-SafeGitFetch -WorkRoot $WorkRoot
        Write-Host "Fetched origin." -ForegroundColor DarkGray
    }

    $headResult = Invoke-SafeGitCapture -GitArgs @('rev-parse', '--short', 'HEAD')
    $remoteResult = Invoke-SafeGitCapture -GitArgs @('rev-parse', '--short', 'origin/main')
    if ($headResult.ExitCode -ne 0) {
        throw "Cannot resolve HEAD in $WorkRoot."
    }
    if ($remoteResult.ExitCode -ne 0) {
        throw "Missing origin/main. Add remote or fetch."
    }
    $head = $headResult.Text.Trim()
    $remote = $remoteResult.Text.Trim()

    $same = $head -eq $remote
    Write-Host ("HEAD:        {0}" -f $head)
    Write-Host ("origin/main: {0}" -f $remote)
    Write-Host ("Aligned:     {0}" -f $(if ($same) { "YES" } else { "NO — pull/rebase 後會帶入遠端仍存在的路徑" }))
    Write-Host ""

    $diffResult = Invoke-SafeGitCapture -GitArgs @('-c', 'core.quotepath=false', 'diff', '--name-status', 'HEAD', 'origin/main')
    if ($diffResult.ExitCode -ne 0) { throw "git diff HEAD..origin/main failed (exit $($diffResult.ExitCode))." }
    $diff = @($diffResult.Output)
    if ($diff.Count -eq 0) {
        Write-Host "Diff HEAD..origin/main: (none)" -ForegroundColor Green
    } else {
        Write-Host "Diff HEAD..origin/main (what you would adopt from remote on merge):" -ForegroundColor Yellow
        $diff | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host ""

    $deletedResult = Invoke-SafeGitCapture -GitArgs @('-c', 'core.quotepath=false', 'ls-files', '-d')
    if ($deletedResult.ExitCode -ne 0) { throw "git ls-files -d failed (exit $($deletedResult.ExitCode))." }
    $deletedOnDisk = @($deletedResult.Output)
    if ($deletedOnDisk.Count -eq 0) {
        Write-Host "Tracked files missing on disk (git ls-files -d): (none)" -ForegroundColor Green
    } else {
        Write-Host "Tracked files missing on disk (should restore or git rm + commit):" -ForegroundColor Red
        $deletedOnDisk | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host ""

    Write-Host "Working tree (porcelain):" -ForegroundColor Cyan
    $statusResult = Invoke-SafeGitCapture -GitArgs @('-c', 'core.quotepath=false', 'status', '--porcelain=v1')
    if ($statusResult.ExitCode -ne 0) { throw "git status failed (exit $($statusResult.ExitCode))." }
    $porcelain = @($statusResult.Output)
    if ($porcelain.Count -eq 0) {
        Write-Host "  (clean)" -ForegroundColor Green
    } else {
        $porcelain | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host ""

    if ($Pattern) {
        Write-Host ("Paths on origin/main matching substring (case-insensitive): {0}" -f $Pattern) -ForegroundColor Cyan
        $pathsResult = Invoke-SafeGitCapture -GitArgs @('-c', 'core.quotepath=false', 'ls-tree', '-r', 'origin/main', '--name-only')
        if ($pathsResult.ExitCode -ne 0) { throw "git ls-tree origin/main failed (exit $($pathsResult.ExitCode))." }
        $paths = @($pathsResult.Output)
        $hit = @($paths | Where-Object { $_.ToLowerInvariant().Contains($Pattern.ToLowerInvariant()) })
        if ($hit.Count -eq 0) {
            Write-Host "  (no matches — 遠端此關鍵字下沒有追蹤檔，pull 不會為了這串字長回檔案)" -ForegroundColor Green
        } else {
            Write-Host ("  Matches: {0}" -f $hit.Count) -ForegroundColor Yellow
            $hit | ForEach-Object { Write-Host "  $_" }
        }
    } else {
        Write-Host "Tip: pass -Pattern 'folder' to list remote paths containing that substring." -ForegroundColor DarkGray
    }
} finally {
    Pop-Location
}

exit 0
