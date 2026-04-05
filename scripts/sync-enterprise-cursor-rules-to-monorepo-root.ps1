param(
    [string]$MonorepoRoot = "",
    [switch]$VerifyOnly,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-MonorepoRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path.TrimEnd('\')
    }
    if ($PSScriptRoot) {
        return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path.TrimEnd('\')
    }
    return (Get-Location).Path.TrimEnd('\')
}

$mono = Get-MonorepoRoot -InputRoot $MonorepoRoot
$sourceDir = Join-Path $mono "agency-os\.cursor\rules"
$destDir = Join-Path $mono ".cursor\rules"

# Canonical copy always under agency-os/.cursor/rules; monorepo root is mirrored (VerifyOnly in health gate).
$names = @(
    "50-operator-autopilot.mdc",
    "63-cursor-core-identity-risk.mdc",
    "64-architecture-mcp-routing.mdc",
    "65-build-standards-data-state.mdc",
    "66-skills-observability-protocol.mdc"
)

if (-not (Test-Path -LiteralPath $sourceDir)) {
    if (-not $Quiet) {
        Write-Output "sync-enterprise-cursor-rules: skip (no $sourceDir — not this monorepo layout)"
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$exitCode = 0
foreach ($n in $names) {
    $src = Join-Path $sourceDir $n
    $dst = Join-Path $destDir $n
    if (-not (Test-Path -LiteralPath $src)) {
        Write-Error "sync-enterprise-cursor-rules: missing source $src"
        exit 1
    }
    if ($VerifyOnly) {
        if (-not (Test-Path -LiteralPath $dst)) {
            Write-Error "sync-enterprise-cursor-rules: verify FAIL — missing $dst"
            $exitCode = 1
            continue
        }
        $hs = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
        $hd = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
        if ($hs -ne $hd) {
            Write-Error "sync-enterprise-cursor-rules: verify FAIL — $n differs from agency-os canonical"
            $exitCode = 1
        }
    } else {
        try {
            Copy-Item -LiteralPath $src -Destination $dst -Force
            if (-not $Quiet) {
                Write-Output ("sync-enterprise-cursor-rules: mirrored " + $n)
            }
        } catch {
            # Cursor/IDE may lock root .cursor rules; if already identical, treat as pass.
            if (Test-Path -LiteralPath $dst) {
                $hs = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
                $hd = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
                if ($hs -eq $hd) {
                    if (-not $Quiet) {
                        Write-Output ("sync-enterprise-cursor-rules: locked but already in sync " + $n)
                    }
                    continue
                }
            }
            throw
        }
    }
}

if ($exitCode -ne 0) { exit $exitCode }
exit 0
