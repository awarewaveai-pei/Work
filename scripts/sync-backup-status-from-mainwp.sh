#!/usr/bin/env bash
# sync-backup-status-from-mainwp.sh
#
# EU-side automated bridge: MainWP DB (truth source) -> repo BACKUP_AUTO_STATUS.json.
#
# Why this exists (2026-06-08): each active tenant's BACKUP_AUTO_STATUS.json was synced
# BY HAND from the MainWP DB. It lagged ~16 days, so the cloud Phase 4 routine (which reads
# .last_success.unix_utc) fired a FALSE "backup 16d stale" WARN while backups were in fact
# healthy. The cloud routine runs without EU SSH and can never query the DB itself, so the
# sync must run here on EU where both the DB and a git checkout with push rights live.
#
# What it does, per active tenant (status: active in BACKUP_RESTORE_PROOF.md):
#   1. read mainwp_site_id from the existing JSON (no hardcoded ids)
#   2. SELECT report_addon (read-only) from the mainwp-db container
#   3. unserialize via php inside the mainwp-web container -> latest Succeeded/Failed + history
#   4. merge into the JSON via python3 on the host, REWRITING ONLY when the backup task_id
#      changed (anti-churn: an unchanged daily run produces no commit)
#   5. commit + push only if something changed
#
# Cron (EU):  11 1 * * *  /root/Work/scripts/sync-backup-status-from-mainwp.sh  # 01:11 UTC daily
# Dry run:    /root/Work/scripts/sync-backup-status-from-mainwp.sh --dry-run    # compute, never write/commit
#
# Rollback: remove the cron line. Script + helpers are in repo (scripts/lib/).
#           git revert any bad commit; the JSON is human-editable as a fallback.

set -uo pipefail

REPO=/root/Work
MAINWP_ENV=/root/mainwp/.env
DB_CONTAINER=mainwp-db
PHP_CONTAINER=mainwp-web
PARSE_PHP="$REPO/scripts/lib/mainwp-report-parse.php"
MERGE_PY="$REPO/scripts/lib/mainwp-backup-merge.py"
DRYRUN="${1:-}"

GIT_NAME="awarewave-eu-backup-sync"
GIT_EMAIL="ops@aware-wave.com"

log() { echo "sync-backup: $*"; }

cd "$REPO" 2>/dev/null || { log "$REPO missing"; exit 1; }

# Never operate on a dirty tree -- would risk committing unrelated changes.
if [ -n "$(git status --porcelain)" ]; then
  log "working tree dirty -- aborting (needs manual intervention)"; exit 1
fi

if [ "$DRYRUN" != "--dry-run" ]; then
  git fetch -q origin main 2>/dev/null || { log "git fetch failed"; exit 1; }
  git merge -q --ff-only origin/main 2>/dev/null || { log "ff-only pull failed -- diverged, manual fix"; exit 1; }
fi

[ -f "$PARSE_PHP" ] || { log "parser missing: $PARSE_PHP (pull repo first)"; exit 1; }
[ -f "$MERGE_PY" ]  || { log "merger missing: $MERGE_PY (pull repo first)"; exit 1; }

PW=$(grep -E '^MYSQL_PASSWORD=' "$MAINWP_ENV" 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/\r$//; s/^"//; s/"$//; s/^'\''//; s/'\''$//')
[ -z "$PW" ] && { log "no MYSQL_PASSWORD in $MAINWP_ENV"; exit 1; }

NOW_UTC=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
changed=0
errors=0

# Iterate active tenants only. not-onboarded tenants are silently skipped (Phase 4 SKIPs them too).
while IFS= read -r md; do
  [ -n "$md" ] || continue
  status=$(awk '/^status:/{print $2; exit}' "$md" 2>/dev/null)
  [ "$status" = "active" ] || continue

  dir=$(dirname "$md")
  json="$dir/BACKUP_AUTO_STATUS.json"
  slug=$(echo "$dir" | sed -E 's|.*/tenants/([^/]+)/.*|\1|')
  if [ ! -f "$json" ]; then
    log "$slug active but BACKUP_AUTO_STATUS.json missing -- skip"; errors=$((errors+1)); continue
  fi

  site_id=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('mainwp_site_id',''))" "$json" 2>/dev/null)
  if ! echo "$site_id" | grep -qE '^[0-9]+$'; then
    log "$slug: no numeric mainwp_site_id -- skip"; errors=$((errors+1)); continue
  fi

  SER=$(docker exec "$DB_CONTAINER" mysql -umainwp -p"$PW" mainwp -N --raw \
        -e "SELECT option_value FROM mwp_mainwp_wpvividmeta WHERE site_id=${site_id} AND option_name='report_addon';" 2>/dev/null)
  if [ -z "$SER" ]; then
    log "$slug (site_id=$site_id): no report_addon row -- skip"; errors=$((errors+1)); continue
  fi

  PARSED=$(docker exec -i -e SER="$SER" "$PHP_CONTAINER" php < "$PARSE_PHP" 2>/dev/null)
  if [ -z "$PARSED" ]; then
    log "$slug (site_id=$site_id): php parse failed -- skip"; errors=$((errors+1)); continue
  fi

  result=$(PARSED="$PARSED" NOW_UTC="$NOW_UTC" python3 "$MERGE_PY" "$json" $DRYRUN 2>&1)
  log "$slug -> $result"
  case "$result" in
    CHANGED*)  changed=$((changed+1)) ;;
    NOCHANGE*) : ;;
    *)         errors=$((errors+1)) ;;
  esac
done < <(find agency-os/tenants -name BACKUP_RESTORE_PROOF.md -not -path '*template*' 2>/dev/null)

if [ "$DRYRUN" = "--dry-run" ]; then
  log "[DRY-RUN] would-change=$changed errors=$errors (no write, no commit)"
  [ "$errors" -gt 0 ] && exit 1 || exit 0
fi

if [ "$changed" -gt 0 ]; then
  git add agency-os/tenants/*/core/BACKUP_AUTO_STATUS.json 2>/dev/null
  if git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" \
        commit -q -m "[eu-auto] sync backup status from MainWP DB ($NOW_UTC; ${changed} tenant(s))"; then
    if git push -q origin main 2>/dev/null; then
      log "committed + pushed ($changed tenant(s) updated)"
    else
      # One rebase retry in case the watchdog/other machine pushed meanwhile.
      git fetch -q origin main && git rebase -q origin/main && git push -q origin main \
        && log "committed + pushed after rebase ($changed tenant(s))" \
        || { log "push failed after rebase -- commit is local, will retry next run"; exit 1; }
    fi
  else
    log "git commit produced nothing (race) -- skipping";
  fi
else
  log "no backup changes -- nothing to commit (errors=$errors)"
fi

[ "$errors" -gt 0 ] && exit 1 || exit 0
