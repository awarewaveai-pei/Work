# VectorCraft web build - Windows entry point. The Rust build runs inside WSL Ubuntu
# (Smart App Control on this machine blocks locally-compiled unsigned exes; see README.md).
# Output: <base>\vectorcraft-dist\<rev7>\  where <base> = $env:VECTORCRAFT_HOME or %LOCALAPPDATA%\awarewave.
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$base = if ($env:VECTORCRAFT_HOME) { $env:VECTORCRAFT_HOME } else { Join-Path $env:LOCALAPPDATA 'awarewave' }
New-Item -ItemType Directory -Force -Path $base | Out-Null

$env:WSL_UTF8 = '1'
wsl -d Ubuntu -e true
if ($LASTEXITCODE -ne 0) { throw 'WSL Ubuntu unavailable - see README.md prerequisites' }

$scriptWsl = (wsl -d Ubuntu -e wslpath -a ($scriptDir -replace '\\','/')).Trim()
$baseWsl   = (wsl -d Ubuntu -e wslpath -a ($base -replace '\\','/')).Trim()

wsl -d Ubuntu -e bash "$scriptWsl/build.sh" "$baseWsl"
if ($LASTEXITCODE -ne 0) { throw "build.sh failed (exit $LASTEXITCODE)" }

# Newest published dir (name = <rev7>-<inputs7>, computed in build.sh from PIN + patches).
$dist = Get-ChildItem (Join-Path $base 'vectorcraft-dist') -Directory |
    Where-Object Name -NotLike '.staging*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "dist: $($dist.FullName)"
Get-ChildItem $dist.FullName | Select-Object Name, Length | Format-Table -AutoSize
