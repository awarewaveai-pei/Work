[CmdletBinding()]
param()

# Offline eval harness gate (plan §3.7, WC-P2-09 ④): the one command list CI and a local run share
# (.github/workflows/cognitive-os-eval.yml calls this file). Never calls a model; eval/produce.py is the only step
# that does, and it is not part of this gate.
#   1. tests/unit/test_eval_harness.py   -- scorer, report, producer->scorer fit, mutation-proof checks
#   2. eval/run.py --golden              -- every golden passes the P-c contract and its snapshot
#   3. eval/mutate.py                    -- the harness still turns red on a deleted source and a fake citation
# Exit 0 = all three passed; 1 = the first one that failed (its name is printed).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $out = Join-Path ([System.IO.Path]::GetTempPath()) ("evalrep-" + [guid]::NewGuid().ToString('N'))
  $steps = @(
    @{ Name = 'unittest test_eval_harness'; Args = @('-m', 'unittest', 'tests.unit.test_eval_harness', '-q') },
    @{ Name = 'run.py --golden';           Args = @('eval/run.py', '--golden', '--out', $out) },
    @{ Name = 'mutate.py';                 Args = @('eval/mutate.py') }
  )
  foreach ($step in $steps) {
    Write-Host "== $($step.Name) =="
    & python @($step.Args)
    if ($LASTEXITCODE -ne 0) {
      Write-Host "FAIL: $($step.Name) (exit $LASTEXITCODE)"
      exit 1
    }
  }
  Write-Host "PASS: eval harness (report: $out)"
  exit 0
}
finally {
  Pop-Location
}
