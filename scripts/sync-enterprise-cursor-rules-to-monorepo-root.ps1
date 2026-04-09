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

function Apply-MonorepoRootCursorPathTransforms {
    param([string]$Text)
    # agency-os/.cursor/rules 內 `docs/...` 指 agency-os 樹；monorepo 根開啟時須加 `agency-os/` 前綴（lobster-factory 等不變）。
    $c = $Text
    $c = $c -replace '`docs/overview/REMOTE_WORKSTATION_STARTUP\.md`', '`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`'
    $c = $c -replace '`docs/operations/cursor-mcp-and-plugin-inventory\.md`', '`agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`'
    # 例如：（見 **`REMOTE_WORKSTATION_STARTUP` 2.5.1**）
    $c = $c -replace '\*\*`REMOTE_WORKSTATION_STARTUP` 2\.5\.1\*\*', '**`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` 2.5.1**'
    # 40-shutdown: monorepo-root readers — agency-os path first, then subfolder-workspace hint
    # Build regex without embedding CJK literals in this .ps1 file (encoding-safe on Windows hosts).
    # Allow CJK "與" as U+8207 (file SSOT) or U+4E0E (legacy/homoglyph).
    $rx40 = [string]([char]0xFF08) + '(?:' + [char]0x8207 + '|' + [char]0x4E0E + ')' + ' \*\*`docs/operations/end-of-day-checklist\.md`\*\* ' + [char]0x00A7 + '1a .+?\*\*`agency-os/docs/operations/end-of-day-checklist\.md`\*\*' +
        [char]0xFF1B + [char]0x7D30 + [char]0x7BC0 + [char]0x4EE5 + [char]0x8173 + [char]0x672C + [char]0x70BA + [char]0x6E96 + [char]0xFF09
    $new40 = [string]([char]0xFF08) + [char]0x8207 + ' **`agency-os/docs/operations/end-of-day-checklist.md`** ' + [char]0x00A7 + '1a ' +
        [char]0x4E00 + [char]0x81F4 + [char]0x2014 + [char]0x2014 +
        [char]0x5DE5 + [char]0x4F5C + [char]0x5340 + [char]0x82E5 + [char]0x50C5 + [char]0x70BA +
        ' `agency-os` ' + [char]0x5247 + [char]0x70BA + ' **`docs/operations/end-of-day-checklist.md`**' +
        [char]0xFF1B + [char]0x7D30 + [char]0x7BC0 + [char]0x4EE5 + [char]0x8173 + [char]0x672C + [char]0x70BA + [char]0x6E96 + [char]0xFF09
    $c = [regex]::Replace($c, $rx40, $new40)
    return $c
}

# Canonical copy always under agency-os/.cursor/rules; monorepo root is mirrored (VerifyOnly in health gate).
$names = @(
    "00-session-bootstrap.mdc",
    "30-resume-keyword.mdc",
    "40-shutdown-closeout.mdc",
    "50-operator-autopilot.mdc",
    "63-cursor-core-identity-risk.mdc",
    "64-architecture-mcp-routing.mdc",
    "65-build-standards-data-state.mdc",
    "66-skills-observability-protocol.mdc"
)

$transformForRoot = @{
    "00-session-bootstrap.mdc" = $true
    "30-resume-keyword.mdc"      = $true
    "40-shutdown-closeout.mdc"   = $true
}

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
        $utf8 = New-Object System.Text.UTF8Encoding $false
        $rawSrc = [System.IO.File]::ReadAllText($src, $utf8)
        if ($transformForRoot.ContainsKey($n) -and $transformForRoot[$n]) {
            $expected = Apply-MonorepoRootCursorPathTransforms -Text $rawSrc
            $actual = [System.IO.File]::ReadAllText($dst, $utf8)
            if ($actual -cne $expected) {
                Write-Error "sync-enterprise-cursor-rules: verify FAIL — $n root must equal transform(agency-os); run sync (not VerifyOnly) to fix"
                $exitCode = 1
            }
        } else {
            $hs = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
            $hd = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
            if ($hs -ne $hd) {
                Write-Error "sync-enterprise-cursor-rules: verify FAIL — $n differs from agency-os canonical"
                $exitCode = 1
            }
        }
    } else {
        try {
            $enc = New-Object System.Text.UTF8Encoding $false
            if ($transformForRoot.ContainsKey($n) -and $transformForRoot[$n]) {
                $rawSrcMirror = [System.IO.File]::ReadAllText($src, $enc)
                $outMirror = Apply-MonorepoRootCursorPathTransforms -Text $rawSrcMirror
                [System.IO.File]::WriteAllText($dst, $outMirror, $enc)
            } else {
                Copy-Item -LiteralPath $src -Destination $dst -Force
            }
            if (-not $Quiet) {
                Write-Output ("sync-enterprise-cursor-rules: mirrored " + $n)
            }
        } catch {
            # Cursor/IDE may lock root .cursor rules; if already identical, treat as pass.
            if (Test-Path -LiteralPath $dst) {
                $utf8 = New-Object System.Text.UTF8Encoding $false
                $rawSrc = [System.IO.File]::ReadAllText($src, $utf8)
                $rawDst = [System.IO.File]::ReadAllText($dst, $utf8)
                $inSync = $false
                if ($transformForRoot.ContainsKey($n) -and $transformForRoot[$n]) {
                    $expected = Apply-MonorepoRootCursorPathTransforms -Text $rawSrc
                    $inSync = ($rawDst -ceq $expected)
                } else {
                    $inSync = ($rawSrc -ceq $rawDst)
                }
                if ($inSync) {
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
