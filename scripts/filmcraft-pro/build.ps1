# FilmCraft web build - Windows entry point. The Rust build runs inside WSL Ubuntu
# (Smart App Control on this machine blocks locally-compiled unsigned exes; see README.md).
# Output: <base>\filmcraft-dist\<rev7>-<inputs7>\  where <base> = $env:FILMCRAFT_HOME or %LOCALAPPDATA%\awarewave.
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$base = if ($env:FILMCRAFT_HOME) { $env:FILMCRAFT_HOME } else { Join-Path $env:LOCALAPPDATA 'awarewave' }
New-Item -ItemType Directory -Force -Path $base | Out-Null

$env:WSL_UTF8 = '1'
wsl -d Ubuntu -e true
if ($LASTEXITCODE -ne 0) { throw 'WSL Ubuntu unavailable - see README.md prerequisites' }

# wslpath prints UTF-8; without this a path with CJK characters is decoded as CP950 and build.sh writes elsewhere.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function ConvertTo-WslPath([string]$p) {
    $out = wsl -d Ubuntu -e wslpath -a ($p -replace '\\','/')
    if ($LASTEXITCODE -ne 0 -or -not $out) { throw "wslpath failed for $p" }
    return ([string]$out).Trim()
}
$scriptWsl = ConvertTo-WslPath $scriptDir
$baseWsl   = ConvertTo-WslPath $base

wsl -d Ubuntu -e bash "$scriptWsl/build.sh" "$baseWsl"
if ($LASTEXITCODE -ne 0) { throw "build.sh failed (exit $LASTEXITCODE)" }

# The dist this run produced: build.sh writes its exact name to filmcraft-dist\LATEST after the swap.
$latest = Join-Path $base 'filmcraft-dist\LATEST'
if (-not (Test-Path -LiteralPath $latest)) { throw "build.sh did not write $latest" }
$name = (Get-Content -LiteralPath $latest -Encoding UTF8 | Select-Object -First 1).Trim()
$dist = Join-Path (Join-Path $base 'filmcraft-dist') $name
if (-not $name -or -not (Test-Path -LiteralPath $dist -PathType Container)) { throw "dist named in LATEST not found: $dist" }
Write-Host "dist: $dist"
Get-ChildItem -LiteralPath $dist | Select-Object Name, Length | Format-Table -AutoSize
