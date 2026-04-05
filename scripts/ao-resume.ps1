param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    [switch]$AllowUnexpectedDirty
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

$checkScript = Join-Path $WorkRoot "scripts\check-three-way-sync.ps1"
if (-not (Test-Path -LiteralPath $checkScript)) {
    Write-Error "ao-resume: missing check script at $checkScript"
    exit 1
}

Write-Host "== AO-RESUME: preflight auto-fix ==" -ForegroundColor Cyan
$syncArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $checkScript,
    "-WorkRoot", $WorkRoot,
    "-AutoFix"
)
if ($SkipVerify) { $syncArgs += "-SkipVerify" }
if ($AllowUnexpectedDirty) { $syncArgs += "-AllowUnexpectedDirty" }

& powershell.exe @syncArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "ao-resume: preflight check failed (exit $LASTEXITCODE)."
    exit $LASTEXITCODE
}

Write-Host "AO-RESUME preflight completed: repo is synced and ready." -ForegroundColor Green

# Report delta since last AO-RESUME (local stamp under agency-os/.agency-state/)
$stateDir = Join-Path $WorkRoot "agency-os\.agency-state"
$stampPath = Join-Path $stateDir "ao-resume-last.txt"
$null = New-Item -ItemType Directory -Force -Path $stateDir

$lastUtc = $null
if (Test-Path -LiteralPath $stampPath) {
    try {
        $raw = (Get-Content -LiteralPath $stampPath -Raw).Trim()
        if ($raw) { $lastUtc = [DateTime]::Parse($raw, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
    } catch {
        $lastUtc = $null
    }
}

$subdirs = @("closeout", "health", "guard", "status")
$allFiles = New-Object System.Collections.Generic.List[System.IO.FileInfo]
foreach ($sub in $subdirs) {
    $dir = Join-Path $WorkRoot "agency-os\reports\$sub"
    if (Test-Path -LiteralPath $dir) {
        foreach ($f in (Get-ChildItem -LiteralPath $dir -File -Recurse -ErrorAction SilentlyContinue)) {
            $allFiles.Add($f)
        }
    }
}

$newer = New-Object System.Collections.Generic.List[System.IO.FileInfo]
foreach ($f in $allFiles) {
    $t = $f.LastWriteTimeUtc
    if (-not $lastUtc -or $t -gt $lastUtc) { $newer.Add($f) }
}

$sorted = @($newer | Sort-Object LastWriteTimeUtc -Descending)
$cap = 30
Write-Host ""
Write-Host "== Reports since last AO-RESUME ==" -ForegroundColor Cyan
if (-not $lastUtc) {
    Write-Host "No prior stamp at agency-os/.agency-state/ao-resume-last.txt (first run or reset)." -ForegroundColor DarkYellow
}
if ($sorted.Count -eq 0) {
    Write-Host "No new or updated files under agency-os/reports/{closeout,health,guard,status} since last stamp." -ForegroundColor Green
} else {
    $show = $sorted
    if ($sorted.Count -gt $cap) {
        Write-Host ("Total newer files: {0} (showing newest {1})" -f $sorted.Count, $cap) -ForegroundColor DarkYellow
        $show = $sorted | Select-Object -First $cap
    } else {
        Write-Host ("Newer files: {0}" -f $sorted.Count) -ForegroundColor Green
    }
    foreach ($f in $show) {
        $rel = $f.FullName.Substring($WorkRoot.Length).TrimStart("\", "/")
        Write-Host ("  {0:u}  {1}" -f $f.LastWriteTimeUtc, $rel)
    }
}

$nowStamp = (Get-Date).ToUniversalTime().ToString("o")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($stampPath, $nowStamp + [Environment]::NewLine, $utf8NoBom)
Write-Host ""
Write-Host ("AO-RESUME stamp updated: {0}" -f $nowStamp) -ForegroundColor DarkGray

exit 0
