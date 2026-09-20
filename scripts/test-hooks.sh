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
#   tests/hooks/maintenance-scripts.test.mjs — rotate-worklog + checkpoint-junk-guard
#   tests/hooks/subagent-budget.test.mjs — Agent/Workflow fan-out budget gate
#                                         (tiers, marker, sliding window, ListAgents non-match)
#   tests/hooks/normalize-claude-settings.test.mjs — HOOK_EVENTS coverage (all 11 events)
#   tests/hooks/subagent-charter-rule.test.mjs — charter rule success/fail-open/defensive-ctx paths
#   tests/hooks/settings-deny-parity.test.mjs — Workflow tool denied on both settings sources (template + remote generator)
#   tests/hooks/codex-adapter.test.mjs — Codex-shaped payloads (--host=codex) reach the same real rules/verdicts
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="$(command -v node.exe)"
elif [[ -x /mnt/c/Program\ Files/nodejs/node.exe ]]; then
  # WSL often inherits Windows Node without placing it on PATH.
  NODE_BIN="/mnt/c/Program Files/nodejs/node.exe"
else
  echo "ERROR: Node.js >= 18 was not found (tried node, node.exe, and the standard WSL Windows install)." >&2
  exit 127
fi

"$NODE_BIN" --test tests/hooks/runner-core.test.mjs tests/hooks/runner-parity.test.mjs tests/hooks/maintenance-scripts.test.mjs tests/hooks/subagent-budget.test.mjs tests/hooks/normalize-claude-settings.test.mjs tests/hooks/subagent-charter-rule.test.mjs tests/hooks/settings-deny-parity.test.mjs tests/hooks/codex-adapter.test.mjs
