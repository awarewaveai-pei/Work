# Runs a target PowerShell script under scheduled tasks with no console window,
# sets AGENCYOS_SCHEDULED_QUIET for downstream gates, and writes a transcript log.
param(
    [Parameter(Mandatory = $true)][string]$TargetScript,
    [Parameter(Mandatory = $true)][string]$ExtraArgsB64,
    [string]$LogStem = "scheduled"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$targetResolved = (Resolve-Path -LiteralPath $TargetScript).Path
$extraArgs = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($ExtraArgsB64))

$logDir = Join-Path $env:LOCALAPPDATA "AgencyOS\scheduled-logs"
$null = New-Item -ItemType Directory -Force -Path $logDir
$logPath = Join-Path $logDir ("{0}-{1:yyyyMMdd-HHmmss}.log" -f $LogStem, (Get-Date))

$runner = Join-Path $env:TEMP ("ao-scheduled-{0}.ps1" -f [guid]::NewGuid())
$logEsc = $logPath.Replace("'", "''")
$scrEsc = $targetResolved.Replace("'", "''")
$inner = @"
`$env:AGENCYOS_SCHEDULED_QUIET = '1'
`$ErrorActionPreference = 'Stop'
Start-Transcript -LiteralPath '$logEsc' -Force
try {
  & '$scrEsc' $extraArgs
  exit `$LASTEXITCODE
} finally {
  Stop-Transcript
}
"@
Set-Content -LiteralPath $runner -Value $inner -Encoding UTF8

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "powershell.exe"
$psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File `"$runner`""
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$p = New-Object System.Diagnostics.Process
$p.StartInfo = $psi
[void]$p.Start()
$p.WaitForExit()
$code = $p.ExitCode
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue
exit $code
