# scripts/check-systems-proposals.ps1 under Windows PowerShell 5.1: 0 / 1 / 2 pending proposals from the route's answer
# (-PendingJson, no ssh) must come out as 0 / 1 / 2 in the report -- PS 5.1 unwraps a one-item array and
# ConvertFrom-Json returns an array as one object, so a careless flatten reads 1 as its fields or 2 as 1.
# In-process (& $script): PS 5.1 strips the quotes of a JSON argument passed to powershell.exe.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/check-systems-proposals.test.ps1

$ErrorActionPreference = 'Stop'
$script = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\scripts\check-systems-proposals.ps1')).Path
$root = Join-Path ([IO.Path]::GetTempPath()) ("systems-proposals-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $root "agency-os\reports\status") | Out-Null
$failures = New-Object System.Collections.Generic.List[string]

function One([int]$i) { return ('{{"event_key":"user:{0}","name":"N{0}","type":"product","purpose":"p","at":"2026-11-22T01:00:0{0}.000Z"}}' -f $i) }

try {
    $cases = @(
        @{ n = 0; json = '{"refresh":false,"proposals":[]}' },
        @{ n = 1; json = ('{{"refresh":false,"proposals":[{0}]}}' -f (One 1)) },
        @{ n = 2; json = ('{{"refresh":true,"proposals":[{0},{1}]}}' -f (One 1), (One 2)) }
    )
    foreach ($c in $cases) {
        & $script -WorkRoot $root -PendingJson $c.json | Out-Null
        $exit = $LASTEXITCODE
        $r = Get-Content -LiteralPath (Join-Path $root "agency-os\reports\status\systems-proposals-LATEST.json") -Raw -Encoding UTF8 | ConvertFrom-Json
        $list = @($r.proposals | ForEach-Object { $_ })
        if ($list.Count -ne $c.n) { $failures.Add(("{0} proposals: report has {1}" -f $c.n, $list.Count)) }
        if ($c.n -gt 0 -and ($list | ForEach-Object { $_.name }) -join ',' -ne ((1..$c.n | ForEach-Object { "N$_" }) -join ',')) { $failures.Add(("{0} proposals: names {1}" -f $c.n, (($list | ForEach-Object { $_.name }) -join ','))) }
        $wantExit = if ($c.n -gt 0) { 1 } else { 0 }
        if ($exit -ne $wantExit) { $failures.Add(("{0} proposals: exit {1}, expected {2}" -f $c.n, $exit, $wantExit)) }
        if ([int]$r.measured -ne 1) { $failures.Add(("{0} proposals: measured {1}" -f $c.n, $r.measured)) }
    }
    # an answer without proposals is a blind spot, not "none pending"
    & $script -WorkRoot $root -PendingJson '{"ok":false,"error":"x"}' | Out-Null
    $r = Get-Content -LiteralPath (Join-Path $root "agency-os\reports\status\systems-proposals-LATEST.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$r.measured -ne 0 -or @($r.blind_spots).Count -ne 1) { $failures.Add("an answer without proposals must be measured=0 with one blind spot") }

    if ($failures.Count -eq 0) { Write-Host "ALL PASS (0/1/2 proposals, malformed answer)" -ForegroundColor Green; exit 0 }
    Write-Host ("FAILED: {0}" -f $failures.Count) -ForegroundColor Red
    foreach ($f in $failures) { Write-Host ("  - " + $f) -ForegroundColor Red }
    exit 1
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
