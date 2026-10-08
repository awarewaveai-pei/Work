#!/usr/bin/env bash
# Test gate inside the Dockerfile `test` target (plan §12.1 rule 11). Default = only the unit test modules named on
# the command line (deploy.sh passes `scripts/affected_tests.py --base <last all-green sha>`'s list) +
# scripts/eval_gate.py. The SPEC golden is NOT here: it cross-checks repo documents outside SPEC (e.g.
# search_content_pack rule6 -> agency-os/reports/audit/), so every caller runs it on the checkout.
# `--all` = the full suite (unittest discover); only rule 11 ③ uses it: a runtime or selector
# change, run by .github/workflows/cognitive-os-full-suite.yml in GitHub, never on a laptop or on every deploy.
# Prints what it tested first. Every step runs; exit 0 only if all passed.
#   bash scripts/test-gate.sh tests.unit.test_a tests.unit.test_b     # affected modules (none = eval gate only)
#   bash scripts/test-gate.sh --all
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "== provenance =="
echo "git: ${COS_GIT_SHA:-unknown}"
echo "python: $(python --version 2>&1)"
echo "packages: $(pip freeze 2>/dev/null | tr '\n' ' ')"

fail=0
if [[ "${1:-}" == "--all" ]]; then
  echo "== 1/2 unittest: full suite (discover -s tests -t .) =="
  COS_FULL_SUITE=1 python -m unittest discover -s tests -t . -q || fail=1  # opt-in the guard in tests/__init__.py wants
elif [[ $# -gt 0 ]]; then
  echo "== 1/2 unittest: $# affected module(s) =="
  python -m unittest "$@" -q || fail=1
else
  echo "== 1/2 unittest: no affected module =="
fi

echo "== 2/2 eval gate: scripts/eval_gate.py =="
python scripts/eval_gate.py || fail=1

if [[ $fail -eq 0 ]]; then echo "TEST GATE: PASS"; else echo "TEST GATE: FAIL"; fi
exit $fail
