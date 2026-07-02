#!/usr/bin/env bash
# One-shot test entry for the governance hook system (runner + rules).
# Cross-platform: needs only node ≥ 18 (node:test built-in), no packages.
#
#   bash scripts/test-hooks.sh
#
# Suites:
#   tests/hooks/runner-core.test.mjs    — runner guarantees (dispatch, fail-open,
#                                         crash isolation, block aggregation)
#   tests/hooks/runner-parity.test.mjs  — every rule's verdict matrix + the
#                                         manifest↔rules completeness check
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node --test tests/hooks/runner-core.test.mjs tests/hooks/runner-parity.test.mjs
