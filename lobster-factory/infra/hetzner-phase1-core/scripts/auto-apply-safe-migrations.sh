#!/usr/bin/env bash
# auto-apply-safe-migrations.sh — auto-apply SAFE migrations from the repo.
#
# Called by sg-deploy.sh (Step 1.9) after git pull and script self-sync.
# Fail-open: any unexpected error logs a warning and exits 0 so the deploy
# continues regardless.
#
# State file: /root/lobster-phase1/.migration-state
#   Plain text, one applied migration number per line.
#   Bootstrap: if absent on first run, seeds 1–57 (known-applied baseline).
#
# Concurrency: uses flock on .migration-state.lock so concurrent deploys
# serialise and never double-apply or race-corrupt the state file.
#
# Prerequisites (one-time, human-side):
#   Add SUPABASE_AWAREWAVE_POSTGRES_DSN to /root/lobster-phase1/.env
#   Value: Supabase Dashboard → Settings → Database → Connection string (Direct,
#   not Pooler — Direct mode supports SET session vars and NOTIFY).
#
# Options:
#   --dry-run   classify and report without running psql or mutating state

set -uo pipefail

STAGING_DIR="${STAGING_DIR:-/root/lobster-phase1}"
REPO_DIR="${REPO_DIR:-/root/Work}"
MIGRATIONS_DIR="$REPO_DIR/lobster-factory/packages/db/migrations"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$STAGING_DIR/.migration-state"
ENV_FILE="$STAGING_DIR/.env"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ts()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "[$(ts)] auto-apply-migrations: $*"; }

# ─── Fail-open trap ──────────────────────────────────────────────────────────
trap 'log "UNEXPECTED ERROR (line $LINENO) — auto-apply skipped (fail-open)"; exit 0' ERR

[[ "$DRY_RUN" -eq 1 ]] && log "DRY-RUN mode — classify only, no psql, no state writes"

# ─── Telegram helper (defined first — called in DSN-missing path below) ──────
_send_telegram() {
  local msg="$1"
  [[ ! -f "$ENV_FILE" ]] && return 0
  local token chat_id
  token=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null \
          | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' || true)
  chat_id=$(grep -E '^TELEGRAM_ALLOWED_CHAT_IDS=' "$ENV_FILE" 2>/dev/null \
            | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' \
            | cut -d',' -f1 | tr -d ' ' || true)
  [[ -z "$token" || -z "$chat_id" ]] && return 0
  local payload
  payload=$(TGCID="$chat_id" TGMSG="$msg" python3 -c \
    'import json,os; print(json.dumps({"chat_id":os.environ["TGCID"],"text":os.environ["TGMSG"],"disable_web_page_preview":True}))' \
    2>/dev/null || true)
  [[ -z "$payload" ]] && return 0
  curl -sS -o /dev/null -X POST -H "Content-Type: application/json" \
    --data "$payload" \
    "https://api.telegram.org/bot${token}/sendMessage" 2>/dev/null || true
}

# ─── Resolve DSN ─────────────────────────────────────────────────────────────
DSN=""
if [[ -f "$ENV_FILE" ]]; then
  DSN=$(grep -E '^SUPABASE_AWAREWAVE_POSTGRES_DSN=' "$ENV_FILE" \
        | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' || true)
fi

if [[ -z "$DSN" && "$DRY_RUN" -eq 0 ]]; then
  log "WARN: SUPABASE_AWAREWAVE_POSTGRES_DSN not set in $ENV_FILE"
  log "WARN: Add Direct Postgres DSN (Supabase > Settings > Database) to enable auto-apply"
  _send_telegram "⚠️ Migration auto-apply: SUPABASE_AWAREWAVE_POSTGRES_DSN missing in SG .env
Set the Direct Postgres DSN to enable automatic migration apply."
  exit 0
fi

# ─── State file lock (serialise concurrent deploys) ──────────────────────────
exec 200>"$STATE_FILE.lock"
flock -x 200

# ─── Bootstrap state file ────────────────────────────────────────────────────
if [[ ! -f "$STATE_FILE" ]]; then
  log "No state file — bootstrapping with migrations 1-57 (known-applied baseline)"
  seq 1 57 > "$STATE_FILE"
fi

declare -A APPLIED
while IFS= read -r n; do
  [[ "$n" =~ ^[0-9]+$ ]] && APPLIED["$n"]=1
done < "$STATE_FILE"

# ─── Discover and classify unapplied migrations ───────────────────────────────
SAFE_FILES=()
DANGEROUS_FILES=()

for f in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
  [[ -e "$f" ]] || continue
  base=$(basename "$f")
  num="${base%%_*}"
  [[ "$num" =~ ^[0-9]+$ ]] || continue
  n=$((10#$num))
  [[ "${APPLIED[$n]+set}" == "set" ]] && continue  # already applied

  # Classify once; capture both exit code and stderr message.
  reason=$(bash "$SCRIPT_DIR/classify-migration.sh" "$f" 2>&1); rc=$?
  if [[ $rc -eq 0 ]]; then
    SAFE_FILES+=("$f")
  else
    reason_first="${reason%%$'\n'*}"  # first line only
    DANGEROUS_FILES+=("$base: $reason_first")
    log "DANGEROUS: $base — $reason_first"
  fi
done

log "Pending: ${#SAFE_FILES[@]} safe, ${#DANGEROUS_FILES[@]} dangerous"

# ─── Alert on DANGEROUS migrations ───────────────────────────────────────────
if [[ "${#DANGEROUS_FILES[@]}" -gt 0 ]]; then
  local_msg="⚠️ Migration auto-apply: ${#DANGEROUS_FILES[@]} migration(s) require human review"$'\n'
  for entry in "${DANGEROUS_FILES[@]}"; do
    local_msg+="  • $entry"$'\n'
    log "Human required: $entry"
  done
  local_msg+=$'\n'"Apply manually: psql \"\$SUPABASE_AWAREWAVE_POSTGRES_DSN\" -f <file>"
  _send_telegram "$local_msg"
fi

# ─── Apply SAFE migrations ────────────────────────────────────────────────────
# --single-transaction (-1): wraps each migration in BEGIN/COMMIT so a
# mid-migration failure rolls back cleanly, leaving the DB and state file
# consistent. The migration can be safely retried on the next deploy.
APPLIED_NOW=()
FAILED_APPLY=()

for f in "${SAFE_FILES[@]}"; do
  base=$(basename "$f")
  num="${base%%_*}"
  n=$((10#$num))
  log "Applying: $base"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "  DRY-RUN: skipping psql for $base"
    continue
  fi

  if psql "$DSN" -v ON_ERROR_STOP=1 -1 -q -f "$f" 2>&1 | \
       while IFS= read -r line; do log "  psql: $line"; done; then
    echo "$n" >> "$STATE_FILE"
    APPLIED["$n"]=1
    APPLIED_NOW+=("$base")
    log "  OK: $base applied"
  else
    FAILED_APPLY+=("$base")
    log "  FAIL: $base — psql error; rolled back cleanly; left for human review"
  fi
done

# ─── Summary notification ─────────────────────────────────────────────────────
if [[ "${#APPLIED_NOW[@]}" -gt 0 ]]; then
  ok_msg="✅ Migration auto-apply: ${#APPLIED_NOW[@]} migration(s) applied"$'\n'
  for entry in "${APPLIED_NOW[@]}"; do
    ok_msg+="  • $entry"$'\n'
  done
  [[ "${#FAILED_APPLY[@]}" -gt 0 ]] && ok_msg+="⚠️ Failed (rolled back): ${FAILED_APPLY[*]}"
  _send_telegram "$ok_msg"
  log "Applied: ${APPLIED_NOW[*]}"
fi

if [[ "${#FAILED_APPLY[@]}" -gt 0 ]]; then
  log "WARN: ${#FAILED_APPLY[@]} migration(s) failed — rolled back; human review required"
  _send_telegram "❌ Migration auto-apply FAILED (rolled back): ${FAILED_APPLY[*]}
Check SG VPS auto-deploy.log"
fi

[[ "${#SAFE_FILES[@]}" -eq 0 && "${#DANGEROUS_FILES[@]}" -eq 0 ]] && \
  log "All migrations up to date"

exit 0
