#!/usr/bin/env bash
# Regenerate requirements.lock (runtime) and requirements-test.lock (runtime + [test]) from pyproject.toml, resolved
# inside the Dockerfile's own base image so the pins are the Linux wheels the image installs, not this machine's.
# Commit both: a dependency change is then a diff, and .github/workflows/cognitive-os-full-suite.yml runs the full
# suite on it (plan §12.1 rule 11 ③). Resolver = uv (lock time only; the image installs with plain pip
# --require-hashes). pip-tools was tried first and stalled: with --generate-hashes it fetches multi-MB index pages
# per package. Prints the newest setuptools too: pyproject [build-system] pins it by hand.
# Usage: bash Projects/internal/cognitive-engineering-os/scripts/lock-deps.sh   (needs docker)
set -euo pipefail
COS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COS_HOST="$(cd "$COS" && (pwd -W 2>/dev/null || pwd))"   # Git Bash on Windows: D:/... for docker
BASE="$(sed -nE 's/^FROM (python:[^ ]+) AS runtime.*$/\1/p' "$COS/Dockerfile")"
[[ -n "$BASE" ]] || { echo "lock-deps: no 'FROM python:... AS runtime' line in $COS/Dockerfile" >&2; exit 1; }
MSYS_NO_PATHCONV=1 docker run --rm -v "$COS_HOST:/src" -w /src "$BASE" sh -euc '
  pip install --quiet --root-user-action=ignore uv >/dev/null
  uv pip compile --quiet --generate-hashes -o requirements.lock pyproject.toml
  uv pip compile --quiet --generate-hashes --extra test -c requirements.lock -o requirements-test.lock pyproject.toml
  echo "setuptools newest: $(pip index versions setuptools 2>/dev/null | head -1)"
'
echo "wrote $COS/requirements.lock and $COS/requirements-test.lock"
