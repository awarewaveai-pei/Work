#!/usr/bin/env bash
# classify-migration.sh — classify a migration SQL file as SAFE or DANGEROUS.
#
# Usage:   classify-migration.sh <path-to-migration.sql>
# Exit 0:  SAFE — eligible for auto-apply.
# Exit 1:  DANGEROUS — human review required.
#
# Contract (two-gate design):
#   Gate 1 — Annotation:  author must add "-- safe_to_auto_apply: true" in the
#             file header.  Absence = conservative reject.  No annotation = no
#             auto-apply, regardless of SQL content.
#   Gate 2 — Hard-block:  even with the annotation, specific destructive SQL
#             patterns abort classification as DANGEROUS.  These are non-
#             negotiable and cannot be overridden by the annotation.
#             Matching is done on a normalised (newline-collapsed, comment-
#             stripped) copy of the file so multi-line DDL cannot evade checks.
#
# Hard-block patterns:
#   DROP TABLE            — table destruction
#   TRUNCATE              — full-table wipe
#   DROP COLUMN           — column removal
#   ALTER COLUMN … TYPE   — column type coercion (may require full table rewrite)
#   ALTER TYPE            — enum mutation / rename (non-transactional risk)
#   bare UPDATE           — DML data migration; excludes mid-statement DO UPDATE
#   bare DELETE FROM      — data destruction

set -uo pipefail

FILE="${1:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "DANGEROUS: file not found: ${FILE:-<none>}" >&2
  exit 1
fi

# ─── Gate 1: annotation (checked per-line — it is a comment) ─────────────────
if ! grep -qi '^\s*--\s*safe_to_auto_apply\s*:\s*true' "$FILE"; then
  echo "DANGEROUS: missing '-- safe_to_auto_apply: true' annotation" >&2
  exit 1
fi

# ─── Gate 2: hard-block patterns (multi-line-aware) ──────────────────────────
# Strip single-line -- comments, then collapse all newlines into spaces so that
# DDL split across multiple lines (e.g. "ALTER TABLE t\n  DROP COLUMN c") is
# caught by the same flat regex that catches single-line forms.
_sql=$(grep -v '^\s*--' "$FILE" | tr '\n' ' ' | tr -s ' ')

_hardblock() {
  local label="$1" pattern="$2"
  if echo "$_sql" | grep -qiE "$pattern"; then
    echo "DANGEROUS: hard-block '$label' detected (annotation overridden)" >&2
    exit 1
  fi
}

_hardblock "DROP TABLE"        '\bDROP\s+TABLE\b'
_hardblock "TRUNCATE"          '\bTRUNCATE\b'
_hardblock "DROP COLUMN"       '\bDROP\s+COLUMN\b'
_hardblock "ALTER COLUMN TYPE" '\bALTER\s+COLUMN\b.+\bTYPE\b'
_hardblock "ALTER TYPE"        '\bALTER\s+TYPE\b'

# Bare UPDATE: must be statement-initial (after start or semicolon), so that
# "ON CONFLICT DO UPDATE SET …" (mid-statement) is not flagged.
# Quoted and unquoted table names are both matched.
_hardblock "bare UPDATE"       '(^|;\s*)UPDATE\s+["a-zA-Z_]'

# Bare DELETE: statement-initial.
_hardblock "bare DELETE"       '(^|;\s*)DELETE\s+FROM\b'

echo "SAFE" >&2
exit 0
