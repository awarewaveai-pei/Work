param(
    [string]$WorkRoot = "",
    [switch]$NoFetch,
    [string]$Pattern = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Not a git repository: $WorkRoot"
    }

    Write-Host "== git-audit-tracked-remote ==" -ForegroundColor Cyan
    Write-Host "Work root: $WorkRoot"
    Write-Host ""

    if (-not $NoFetch) {
        git fetch origin | Out-Null
        Write-Host "Fetched origin." -ForegroundColor DarkGray
    }

    $head = (git rev-parse --short HEAD).Trim()
    $remote = (git rev-parse --short origin/main 2>$null).Trim()
    if (-not $remote) {
        throw "Missing origin/main. Add remote or fetch."
    }

    $same = $head -eq $remote
    Write-Host ("HEAD:        {0}" -f $head)
    Write-Host ("origin/main: {0}" -f $remote)
    Write-Host ("Aligned:     {0}" -f $(if ($same) { "YES" } else { "NO — pull/rebase 後會帶入遠端仍存在的路徑" }))
    Write-Host ""

    $diff = @(git diff --name-status HEAD origin/main 2>$null)
    if ($diff.Count -eq 0) {
        Write-Host "Diff HEAD..origin/main: (none)" -ForegroundColor Green
    } else {
        Write-Host "Diff HEAD..origin/main (what you would adopt from remote on merge):" -ForegroundColor Yellow
        $diff | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host ""

    $deletedOnDisk = @(git ls-files -d)
    if ($deletedOnDisk.Count -eq 0) {
        Write-Host "Tracked files missing on disk (git ls-files -d): (none)" -ForegroundColor Green
    } else {
        Write-Host "Tracked files missing on disk (should restore or git rm + commit):" -ForegroundColor Red
        $deletedOnDisk | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host ""

    Write-Host "Working tree (porcelain):" -ForegroundColor Cyan
    $porcelain = @(git status --porcelain=v1)
    if ($porcelain.Count -eq 0) {
        Write-Host "  (clean)" -ForegroundColor Green
    } else {
        $porcelain | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host ""

    if ($Pattern) {
        Write-Host ("Paths on origin/main matching substring (case-insensitive): {0}" -f $Pattern) -ForegroundColor Cyan
        $paths = @(git ls-tree -r origin/main --name-only)
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
