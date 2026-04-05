param(
    [string]$WorkRoot = "",
    [switch]$EnableLogoffCloseout,
    [switch]$EnablePushOnLogoff,
    [switch]$NoInteractive,
    [switch]$RemoveOnly
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

$register = Join-Path $WorkRoot "agency-os\automation\REGISTER_AUTOPILOT_PHASE1_TASKS.ps1"
if (-not (Test-Path -LiteralPath $register)) {
    throw "Missing register script: $register"
}

$args = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", $register,
    "-WorkRoot", $WorkRoot
)
if ($EnableLogoffCloseout) { $args += "-EnableLogoffCloseout" }
if ($EnablePushOnLogoff) { $args += "-EnablePushOnLogoff" }
if ($NoInteractive) { $args += "-NoInteractive" }
if ($RemoveOnly) { $args += "-RemoveOnly" }

& powershell.exe @args
exit $LASTEXITCODE
