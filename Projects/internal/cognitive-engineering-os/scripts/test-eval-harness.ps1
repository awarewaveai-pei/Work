[CmdletBinding()]
param()

# Offline eval harness gate -- the command list lives in scripts/eval_gate.py (shared with scripts/test-gate.sh in
# the test image); this wrapper keeps the entry point .github/workflows/cognitive-os-eval.yml and local runs call.
# Exit code = eval_gate.py's (0 = all three steps passed).

$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
& python (Join-Path $PSScriptRoot 'eval_gate.py')
exit $LASTEXITCODE
