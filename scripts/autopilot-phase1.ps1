param(
    [ValidateSet("startup", "alert", "closeout")][string]$Mode,
    [string]$WorkRoot = "",
    [switch]$EnablePushOnCloseout
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) { return (Resolve-Path $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

function Invoke-Notify {
    param([string]$Title, [string]$Message, [string]$Level = "info")
    $script = Join-Path $script:Root "scripts\notify-ops.ps1"
    if (Test-Path -LiteralPath $script) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Title $Title -Message $Message -Level $Level | Out-Null
    } else {
        Write-Host ("[{0}] {1}" -f $Title, $Message)
    }
}

$script:Root = Resolve-WorkRoot -InputRoot $WorkRoot
$alertFile = Join-Path $script:Root "agency-os\ALERT_REQUIRED.txt"
if (-not (Test-Path -LiteralPath $alertFile)) {
    $alertFile = Join-Path $script:Root "ALERT_REQUIRED.txt"
}

switch ($Mode) {
    "startup" {
        $resume = Join-Path $script:Root "scripts\ao-resume.ps1"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $resume -WorkRoot $script:Root -SkipVerify -AllowUnexpectedDirty
        if ($LASTEXITCODE -eq 0) {
            Invoke-Notify -Title "AO Startup Preflight PASS" -Message "AO-RESUME preflight completed successfully." -Level "success"
            exit 0
        }
        Invoke-Notify -Title "AO Startup Preflight FAIL" -Message ("AO-RESUME preflight failed with exit code " + $LASTEXITCODE) -Level "error"
        exit $LASTEXITCODE
    }
    "alert" {
        if (-not (Test-Path -LiteralPath $alertFile)) {
            exit 0
        }
        Invoke-Notify -Title "AO Alert Triggered" -Message "ALERT_REQUIRED detected. Starting auto-repair flow." -Level "warn"

        $sync = Join-Path $script:Root "scripts\check-three-way-sync.ps1"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sync -WorkRoot $script:Root -AutoFix -SkipVerify
        if ($LASTEXITCODE -ne 0) {
            Invoke-Notify -Title "AO Alert Auto-Repair FAIL" -Message ("sync auto-fix failed with exit code " + $LASTEXITCODE) -Level "error"
            exit $LASTEXITCODE
        }

        $guard = Join-Path $script:Root "agency-os\scripts\system-guard.ps1"
        if (-not (Test-Path -LiteralPath $guard)) {
            $guard = Join-Path $script:Root "scripts\system-guard.ps1"
        }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard -WorkspaceRoot (Join-Path $script:Root "agency-os") -Mode manual
        if ($LASTEXITCODE -ne 0) {
            Invoke-Notify -Title "AO Alert Auto-Repair FAIL" -Message ("system-guard manual failed with exit code " + $LASTEXITCODE) -Level "error"
            exit $LASTEXITCODE
        }

        Invoke-Notify -Title "AO Alert Auto-Repair PASS" -Message "Auto-repair completed. Check LAST_SYSTEM_STATUS.md." -Level "success"
        exit 0
    }
    "closeout" {
        $close = Join-Path $script:Root "scripts\ao-close.ps1"
        $closeArgs = @(
            "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", $close,
            "-WorkRoot", $script:Root
        )
        if (-not $EnablePushOnCloseout) { $closeArgs += "-SkipPush" }

        & powershell.exe @closeArgs
        if ($LASTEXITCODE -eq 0) {
            $mode = if ($EnablePushOnCloseout) { "with push" } else { "without push" }
            Invoke-Notify -Title "AO Auto Closeout PASS" -Message ("Closeout completed " + $mode + ".") -Level "success"
            exit 0
        }
        Invoke-Notify -Title "AO Auto Closeout FAIL" -Message ("ao-close failed with exit code " + $LASTEXITCODE) -Level "error"
        exit $LASTEXITCODE
    }
}
