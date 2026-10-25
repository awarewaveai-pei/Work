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
#   tests/hooks/asset-mcp-refs.test.mjs — every mcp__server__tool ref in the shared Claude+Codex assets names a reachable server
#   tests/hooks/asset-parity.test.mjs — command/agent/skill parity across Claude+Codex plus index coverage
#   tests/hooks/governance-pointers.test.mjs — every section pointer into AGENTS.md / its appendix lands on exactly one heading; no archive in the appendix
#   tests/hooks/trigger-index.test.mjs — the every-turn trigger index in AGENTS.md is exactly what the generator derives from TOOL_TRIGGER_MAP.md
#   tests/hooks/shared-file-guard.test.mjs — shared-file commit guard + private-index commits + WORKLOG 續N guard (real helper, scratch repo)
#   tests/hooks/linked-worktree-root.test.mjs — root walk accepts only a .git DIRECTORY (linked worktree = not the root)
#   tests/hooks/file-claim-guard.test.mjs — one writing session per dirty file (claim, release by commit/TTL, Codex apply_patch)
#   tests/hooks/read-sweep-to-codex-rule.test.mjs — the 20th distinct file read in a session reminds once to hand sweeping to Codex
#   tests/hooks/suggest-compact-rule.test.mjs — context measured from the transcript on UserPromptSubmit (bands, window inference, tail read, silent nulls)
#   tests/hooks/mass-delete-pre-commit.test.mjs — git-native pre-commit refuses a commit deleting more than half of HEAD (empty-index incident 2026-10-26)
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
# Section pointers into AGENTS.md / its appendix + the generated trigger index: own invocation, so the shared one-line command below
# is not the place every new gate has to edit.
"$NODE_BIN" --test tests/hooks/governance-pointers.test.mjs tests/hooks/trigger-index.test.mjs

"$NODE_BIN" --test tests/hooks/runner-core.test.mjs tests/hooks/runner-parity.test.mjs tests/hooks/worktree-reparse-guard.test.mjs tests/hooks/maintenance-scripts.test.mjs tests/hooks/subagent-budget.test.mjs tests/hooks/normalize-claude-settings.test.mjs tests/hooks/subagent-charter-rule.test.mjs tests/hooks/settings-deny-parity.test.mjs tests/hooks/codex-adapter.test.mjs tests/hooks/asset-mcp-refs.test.mjs tests/hooks/asset-parity.test.mjs tests/hooks/shared-file-guard.test.mjs tests/hooks/linked-worktree-root.test.mjs tests/hooks/file-claim-guard.test.mjs tests/hooks/suggest-compact-rule.test.mjs tests/hooks/read-sweep-to-codex-rule.test.mjs tests/hooks/mass-delete-pre-commit.test.mjs
