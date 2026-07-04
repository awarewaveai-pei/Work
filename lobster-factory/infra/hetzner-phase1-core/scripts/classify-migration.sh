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
#
# Hard-block patterns:
#   DROP TABLE       — table destruction
#   TRUNCATE         — full-table wipe
#   DROP COLUMN      — column removal (ALTER TABLE ... DROP COLUMN)
#   ALTER TYPE       — column type coercion (may force table rewrite)
#   bare UPDATE      — DML data migration (line-start UPDATE, excludes ON CONFLICT DO UPDATE)
#   bare DELETE FROM — data destruction
#
# All other SQL (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
# CREATE OR REPLACE FUNCTION, DROP FUNCTION IF EXISTS, DROP CONSTRAINT IF EXISTS,
# DROP POLICY IF EXISTS, INSERT ... ON CONFLICT, GRANT, NOTIFY pgrst, etc.)
# is permitted when the annotation is present.

set -uo pipefail

FILE="${1:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "DANGEROUS: file not found: ${FILE:-<none>}" >&2
  exit 1
fi

# ─── Gate 1: annotation ──────────────────────────────────────────────────────
if ! grep -qi '^\s*--\s*safe_to_auto_apply\s*:\s*true' "$FILE"; then
  echo "DANGEROUS: missing '-- safe_to_auto_apply: true' annotation" >&2
  exit 1
fi

# ─── Gate 2: hard-block patterns ─────────────────────────────────────────────
_hardblock() {
  local label="$1" pattern="$2"
  if grep -qiE "$pattern" "$FILE"; then
    echo "DANGEROUS: hard-block '$label' detected (annotation overridden)" >&2
    exit 1
  fi
}

_hardblock "DROP TABLE"  '\bDROP\s+TABLE\b'
_hardblock "TRUNCATE"    '\bTRUNCATE\b'
_hardblock "DROP COLUMN" '\bDROP\s+COLUMN\b'
_hardblock "ALTER TYPE"  '\bALTER\s+COLUMN\b[^;]+\bTYPE\b'

# Bare UPDATE: line starts with UPDATE (ignores "ON CONFLICT DO UPDATE" which
# is mid-line inside an INSERT).
_hardblock "bare UPDATE" '^\s*UPDATE\s+[a-z_]'

# Bare DELETE: line starts with DELETE FROM.
_hardblock "bare DELETE" '^\s*DELETE\s+FROM\b'

echo "SAFE" >&2
exit 0
