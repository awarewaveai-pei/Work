[CmdletBinding()]
param(
  [switch]$SkipSmoke,
  [switch]$RequireOfflineStt
)

# Local runner for the Phase 5 Research Mode slice. Runs, in order:
#   1. byte-compile of ai_lego/ and tests/
#   2. the full unittest suite (unit + fixture-mode acceptance + offline-STT acceptance)
#   3. a CLI smoke run into a temp directory
#
# Exit codes are distinct, not a single "PASS" swallowing everything:
#   0 = full pass, zero tests skipped (both adapter paths genuinely exercised)
#   1 = a real test failure, a compile error, or (-RequireOfflineStt) a skip
#   3 = pass, but N tests were skipped (offline-STT unavailable on this machine) -- a BLIND SPOT,
#       reported loudly and with a distinct exit code so a caller checking `$LASTEXITCODE -eq 0`
#       cannot mistake this for a full pass.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  # Native stderr is captured through cmd.exe so PowerShell never converts
  # unittest's stderr lines into terminating error records.
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

  Write-Host '== 1/3 byte-compile =='
  cmd /c "python -m compileall -q ai_lego tests 2>&1"
  if ($LASTEXITCODE -ne 0) { throw 'compileall failed' }

  # Step 2 is the full suite: only on purpose (plan rule 11, guard in tests/__init__.py). Stop here with the reason
  # instead of letting the guard's exit look like a test failure.
  if ($env:COS_FULL_SUITE -ne '1') {
    throw "step 2 is the full suite (~14k tests, 25-55 min): set `$env:COS_FULL_SUITE='1' only for a close-out the operator asked for; after a change run python scripts/affected_tests.py --run"
  }
  Write-Host '== 2/3 unittest discover =='
  $testLines = cmd /c "python -m unittest discover -s tests -t . -v 2>&1"
  $testExit = $LASTEXITCODE
  $testLines | ForEach-Object { Write-Host $_ }
  if ($testExit -ne 0) { throw "unittest reported failures (exit $testExit)" }

  $skipped = @($testLines | Where-Object { $_ -match '\.\.\. skipped' })
  if ($skipped.Count -gt 0) {
    Write-Host ''
    Write-Host "BLIND SPOT: $($skipped.Count) test(s) skipped -- these paths were NOT exercised on this machine:"
    $skipped | ForEach-Object { Write-Host "  $_" }
    if ($RequireOfflineStt) { throw "offline-STT tests were skipped and -RequireOfflineStt was set" }
  } else {
    Write-Host ''
    Write-Host 'No skipped tests: fixture AND offline-STT acceptance paths both executed.'
  }

  if (-not $SkipSmoke) {
    Write-Host '== 3/3 CLI smoke (fixture adapters, temp runtime dir) =='
    $smokeDir = Join-Path ([IO.Path]::GetTempPath()) "ai-lego-slice-smoke-$PID"
    cmd /c "python -m ai_lego.apps.cli.run_research_slice --transcription fixture --runtime-dir `"$smokeDir`" 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "CLI smoke run failed (exit $LASTEXITCODE)" }
    Remove-Item -LiteralPath $smokeDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Host ''
  if ($skipped.Count -gt 0) {
    Write-Host "PHASE5 LOCAL RUNNER: PASS (fixture only; $($skipped.Count) test(s) skipped -- BLIND SPOT, see above)"
    exit 3
  }
  Write-Host 'PHASE5 LOCAL RUNNER: PASS (fixture AND offline-STT both exercised, zero skips)'
  exit 0
} finally {
  Pop-Location
}
