#!/usr/bin/env bash
# The web app's own gate before an image is built (gap report P-19): tsc, vitest (whose parity test runs the Python
# mock checker) in a throwaway node:22-alpine container. The repo is mounted read-only and copied inside, so nothing
# the container writes lands in the checkout (deploy.sh's ownership guard refuses a repo with root-owned files).
# Usage: bash Projects/internal/cognitive-engineering-os/deploy/web_test.sh   (from anywhere; exit code = result)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
REL="Projects/internal/cognitive-engineering-os"
SPEC="agency-os/docs/AI_LEGO_Cognitive_Engineering_OS"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$REPO_ROOT/$REL:/src/$REL:ro" -v "$REPO_ROOT/$SPEC:/src/$SPEC:ro" \
  -e AI_LEGO_SPEC_ROOT="/src/$SPEC" \
  node:22-alpine sh -euc "
    apk add --no-cache python3 py3-yaml >/dev/null
    ln -sf python3 /usr/bin/python
    mkdir -p /w/$REL
    cd /src/$REL && tar --exclude=./apps/cognitive-web/node_modules --exclude=./apps/cognitive-web/.next --exclude=./.runtime -cf - . | tar -xf - -C /w/$REL
    cd /w/$REL/apps/cognitive-web
    npm ci --no-audit --no-fund >/dev/null
    npx tsc --noEmit
    npx vitest run
    cd /w/$REL && python docs/mockups/check-mocks.py
  "
