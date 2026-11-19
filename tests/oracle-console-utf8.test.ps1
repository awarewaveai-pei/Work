# Regression: the oracle scripts' stdout echo must be UTF-8 whatever the console code page is.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/oracle-console-utf8.test.ps1
# 2026-11-19: codex-oracle run via Git Bash printed the answer as CP950 bytes (artifact file was fine).
# CJK is built from code points so this file itself is immune to the encoding trap it tests.

$ErrorActionPreference = 'Stop'
$helpers = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\scripts\_console-encoding-helpers.ps1')).Path
$codes = @(0x65B0, 0x589E, 0x6392, 0x7A0B)   # 4 CJK chars
$text = -join ($codes | ForEach-Object { [char]$_ })
$expected = (New-Object Text.UTF8Encoding($false)).GetBytes($text + "`n")
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("oracle-utf8-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null

function Invoke-Child {
    param([bool]$UseHelper)
    $script = Join-Path $tmp ("child-{0}.ps1" -f $UseHelper)
    $lines = @(". '$helpers'")
    if ($UseHelper) { $lines += 'Set-Utf8ConsoleOutput' }
    $lines += ('Write-Host (-join (@(' + ($codes -join ',') + ') | ForEach-Object { [char]$_ }))')
    [IO.File]::WriteAllText($script, ($lines -join "`r`n"), (New-Object Text.UTF8Encoding($false)))
    $out = Join-Path $tmp ("out-{0}.bin" -f $UseHelper)
    Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script) `
        -RedirectStandardOutput $out -NoNewWindow -Wait | Out-Null
    return ,[IO.File]::ReadAllBytes($out)
}

function Assert-True { param([bool]$Condition, [string]$Message) if (-not $Condition) { throw "ASSERTION FAILED: $Message" } }

try {
    $got = Invoke-Child -UseHelper $true
    Assert-True (([BitConverter]::ToString($got)) -eq ([BitConverter]::ToString($expected))) `
        ("Set-Utf8ConsoleOutput did not make Write-Host emit UTF-8: " + [BitConverter]::ToString($got))

    # Mutation proof (only meaningful when the console is not already UTF-8, e.g. CP950): without the call
    # the bytes differ, so the assertion above is not decorative.
    if ([Console]::OutputEncoding.CodePage -ne 65001) {
        $raw = Invoke-Child -UseHelper $false
        Assert-True (([BitConverter]::ToString($raw)) -ne ([BitConverter]::ToString($expected))) 'mutation: without the helper the output was already UTF-8, test cannot detect the bug'
    }

    foreach ($s in 'codex-oracle.ps1', 'claude-oracle.ps1', 'write-oracle-artifact.ps1') {
        $src = Get-Content -LiteralPath (Join-Path $PSScriptRoot "..\scripts\$s") -Raw -Encoding UTF8
        Assert-True ($src -match 'Set-Utf8ConsoleOutput') "$s does not call Set-Utf8ConsoleOutput"
    }
    Write-Host 'oracle-console-utf8: PASS'
} finally {
    Get-ChildItem -LiteralPath $tmp -File | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
