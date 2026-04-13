# Appends MariaDB Server bin to the *user* PATH if missing (idempotent).
# Restart terminals (or Cursor) after first run so new shells pick up User PATH.
param(
    [string]$MariaDbBin = "C:\Program Files\MariaDB 12.2\bin"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$mariaExe = Join-Path $MariaDbBin "mysql.exe"
if (-not (Test-Path -LiteralPath $mariaExe)) {
    Write-Error "MariaDB mysql.exe not found at $mariaExe. Install MariaDB.Server or pass -MariaDbBin."
}

$cur = [Environment]::GetEnvironmentVariable("Path", "User")
$parts = @()
if (-not [string]::IsNullOrWhiteSpace($cur)) {
    $parts = @($cur.Split(";", [StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim().TrimEnd("\") })
}

$want = $MariaDbBin.Trim().TrimEnd("\")
if ($parts -contains $want) {
    Write-Host "Already on user PATH: $MariaDbBin" -ForegroundColor Green
    exit 0
}

$newPath = if ([string]::IsNullOrWhiteSpace($cur)) { $MariaDbBin } else { ($cur.TrimEnd(";") + ";" + $MariaDbBin) }
[Environment]::SetEnvironmentVariable("Path", $newPath, "User")
Write-Host "Appended to user PATH: $MariaDbBin" -ForegroundColor Green
Write-Host "Open a new terminal (or restart Cursor) so PATH is reloaded." -ForegroundColor Yellow
exit 0
