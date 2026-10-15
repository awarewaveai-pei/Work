#!/usr/bin/env bash
# check-migrations-applied.sh -- read-only: every migration file in the repo checkout is in the production ledger, with
# the same content.
#
# Why: an app deploy (sg-deploy.sh, and the nightly auto-deploy through it) ships code; migrations are applied by hand
# (scripts/apply-db-migration.mjs). Code that needs an unapplied migration breaks prod at the deploy, e.g. C12's 0101
# replaced a function the new next-admin called (WORKLOG 2026-10-15). So a deploy refuses while the repo is ahead.
# Same rule as `apply-db-migration.mjs --status`: files NNNN_*.sql minus *.down.sql, keyed by filename in
# public.schema_migrations (0092); sha256 of the file with CRLF turned into LF (migrationSha256 there) must equal the
# ledger's -- a file edited after it was applied is not applied.
#
# Usage: check-migrations-applied.sh [repo_dir]      (default /root/Work)
# Exit 0 = every file applied as-is. Exit 1 = some are missing or changed (listed). Exit 2 = could not check at all
# (no directory, unreadable directory, ledger unreachable) -- never an override case.

set -euo pipefail
REPO_DIR="${1:-/root/Work}"
MIG_DIR="$REPO_DIR/lobster-factory/packages/db/migrations"
[[ -d "$MIG_DIR" ]] || { echo "migration-gate: no migrations dir at $MIG_DIR" >&2; exit 2; }

files="$(find "$MIG_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' ! -name '*.down.sql' -printf '%f\n' | sort)" || {
  echo "migration-gate: cannot list $MIG_DIR" >&2; exit 2; }
[[ -n "$files" ]] || { echo "migration-gate: no migration files under $MIG_DIR" >&2; exit 2; }

# tab-separated: 0092 allows spaces in filenames. timeout: a hung docker/db must not hold the deploy lock forever.
ledger="$(timeout 60 docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA \
  -c "SELECT filename || chr(9) || sha256 FROM public.schema_migrations" 2>&1)" || {
  echo "migration-gate: cannot read public.schema_migrations: ${ledger:0:300}" >&2; exit 2; }

missing=(); changed=()
while IFS= read -r f; do
  want="$(awk -F'\t' -v f="$f" '$1 == f { print $2; exit }' <<<"$ledger")"
  if [[ -z "$want" ]]; then missing+=("$f"); continue; fi
  have="$(perl -0pe 's/\r\n/\n/g' "$MIG_DIR/$f" | sha256sum | cut -d' ' -f1)" || { echo "migration-gate: cannot hash $f" >&2; exit 2; }
  [[ "$have" == "$want" ]] || changed+=("$f")
done <<<"$files"

if (( ${#missing[@]} + ${#changed[@]} )); then
  (( ${#missing[@]} )) && { echo "migration-gate: ${#missing[@]} migration(s) in the repo are not applied in production:"; printf '  %s\n' "${missing[@]}"; }
  (( ${#changed[@]} )) && { echo "migration-gate: ${#changed[@]} applied migration(s) were edited after they were applied (sha256 differs from the ledger):"; printf '  %s\n' "${changed[@]}"; }
  echo "  check with: node scripts/apply-db-migration.mjs --status"
  exit 1
fi
echo "migration-gate: OK -- $(wc -l <<<"$files") repo migrations are in the ledger, unchanged"
