#!/usr/bin/env bash
# sync-backup-status-from-mainwp.sh
#
# Host-side bridge: MainWP DB (truth source) -> each active tenant's backup status, judged here.
#
# Why this exists (2026-06-08): each active tenant's BACKUP_AUTO_STATUS.json was synced BY HAND from the MainWP DB
# and lagged ~16 days, so the Phase 4 check fired a FALSE "backup 16d stale". Until 2026-10-25 this script committed
# the JSON to the repo for the cloud Phase 4 routine to read; on ks-aw-01 the repo key is read-only, so no push ever
# landed after the 2026-08-31 fold (WORKLOG 2026-10-25 續64 M1, 續82). Now the status stays where it is produced and is
# judged where it is produced: 3B-3D (scripts/phase4-checks.py judge_backup_status, one implementation) run here, and
# a warning exits 1 -> /ops/schedules row backup_status_sync red + one push. Nothing is committed.
#
# Per active tenant (status: active in BACKUP_RESTORE_PROOF.md):
#   1. read mainwp_site_id from the repo BACKUP_AUTO_STATUS.json (static config; no hardcoded ids)
#   2. SELECT report_addon (read-only) from the mainwp-db container
#   3. unserialize via php inside the mainwp-web container -> latest Succeeded/Failed + history
#   4. merge into STATE_DIR/<slug>.json (seeded from the repo JSON once), rewritten only when the backup task changed
#   5. judge STATE_DIR/<slug>.json (3B freshness, 3C last outcome, 3D truth source still moving)
#
# Cron: scripts/cron.d/awarewave-schedules key backup_status_sync (01:11 UTC daily, LC_ALL=C.UTF-8).
# Dry run:  bash /root/Work/scripts/sync-backup-status-from-mainwp.sh --dry-run    # compute and judge, write nothing
# Rollback: git revert; state files in STATE_DIR are plain JSON.

set -uo pipefail

REPO=/root/Work
STATE_DIR="${BACKUP_STATUS_DIR:-/var/lib/awarewave/backup-status}"
MAINWP_ENV=/root/mainwp/.env
DB_CONTAINER=mainwp-db
PHP_CONTAINER=mainwp-web
PARSE_PHP="$REPO/scripts/lib/mainwp-report-parse.php"
MERGE_PY="$REPO/scripts/lib/mainwp-backup-merge.py"
JUDGE_PY="$REPO/scripts/phase4-checks.py"
DRYRUN="${1:-}"

# Reject a typo'd flag (e.g. --dryrun) -- otherwise it falls through as a LIVE run (critic 2026-06-08 nit #5).
if [ -n "$DRYRUN" ] && [ "$DRYRUN" != "--dry-run" ]; then
  echo "sync-backup: unknown arg '$DRYRUN'. Valid: (none) | --dry-run"; exit 2
fi

log() { echo "sync-backup: $*"; }

cd "$REPO" 2>/dev/null || { log "$REPO missing"; exit 1; }

# This checkout is refreshed here (scripts, parser, judge, tenant config). Only tracked changes block the fast-forward;
# a stray untracked file wedged every run 2026-09-01..10-25, and ff-only still refuses to overwrite one.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "working tree has tracked changes -- aborting (needs manual intervention)"; exit 1
fi
if [ "$DRYRUN" != "--dry-run" ]; then
  git fetch -q origin main 2>/dev/null || { log "git fetch failed"; exit 1; }
  git merge -q --ff-only origin/main 2>/dev/null || { log "ff-only pull failed -- diverged, manual fix"; exit 1; }
fi

for f in "$PARSE_PHP" "$MERGE_PY" "$JUDGE_PY"; do [ -f "$f" ] || { log "missing: $f"; exit 1; }; done

PW=$(grep -E '^MYSQL_PASSWORD=' "$MAINWP_ENV" 2>/dev/null | head -1 | sed -E 's/^[^=]+=//; s/\r$//; s/^"//; s/"$//; s/^'\''//; s/'\''$//')
[ -z "$PW" ] && { log "no MYSQL_PASSWORD in $MAINWP_ENV"; exit 1; }
mkdir -p "$STATE_DIR" || { log "cannot create $STATE_DIR"; exit 1; }
# Dry run works on a throwaway copy: the same merge + judge a live run would do, nothing real written.
WORK_DIR="$STATE_DIR"
if [ "$DRYRUN" = "--dry-run" ]; then WORK_DIR=$(mktemp -d) || exit 1; trap 'rm -rf "$WORK_DIR"' EXIT; cp -p "$STATE_DIR"/*.json "$WORK_DIR"/ 2>/dev/null; fi

NOW_UTC=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
# A transient skip (DB blip, no report row yet) is not a failure by itself: the judge below sees the state go stale
# (3B/3D) if it persists. hard = merge contract broken or the judge warns -> exit 1.
hard=0
judged=0

while IFS= read -r md; do
  [ -n "$md" ] || continue
  status=$(awk '/^status:/{print $2; exit}' "$md" 2>/dev/null)
  [ "$status" = "active" ] || continue

  dir=$(dirname "$md")
  json="$dir/BACKUP_AUTO_STATUS.json"
  slug=$(echo "$dir" | sed -E 's|.*/tenants/([^/]+)/.*|\1|')
  state="$WORK_DIR/$slug.json"
  [ -f "$json" ] || { log "$slug active but repo BACKUP_AUTO_STATUS.json (config) missing"; hard=$((hard+1)); continue; }
  [ -f "$state" ] || cp "$json" "$state" || { log "$slug: cannot create $state"; hard=$((hard+1)); continue; }

  # encoding='utf-8' is mandatory: cron's locale may be POSIX/ascii (the cron line also sets LC_ALL=C.UTF-8).
  site_id=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1], encoding='utf-8')).get('mainwp_site_id',''))" "$json" 2>/dev/null)
  if echo "$site_id" | grep -qE '^[0-9]+$'; then
    SER=$(docker exec "$DB_CONTAINER" mysql -umainwp -p"$PW" mainwp -N --raw \
          -e "SELECT option_value FROM mwp_mainwp_wpvividmeta WHERE site_id=${site_id} AND option_name='report_addon';" 2>/dev/null)
    PARSED=""
    [ -n "$SER" ] && PARSED=$(docker exec -i -e SER="$SER" "$PHP_CONTAINER" php < "$PARSE_PHP" 2>/dev/null)
    if [ -z "$PARSED" ]; then
      log "$slug (site_id=$site_id): no report_addon row or php parse failed -- judged on the last state"
    else
      result=$(PARSED="$PARSED" NOW_UTC="$NOW_UTC" python3 "$MERGE_PY" "$state" 2>&1)
      log "$slug -> $result"
      case "$result" in CHANGED*|NOCHANGE*) : ;; *) log "$slug: HARD merge error -- $result"; hard=$((hard+1)) ;; esac
    fi
  else
    log "$slug: no numeric mainwp_site_id in the repo config"; hard=$((hard+1))
  fi

  verdict=$(python3 "$JUDGE_PY" --judge-backup-json "$state" 2>&1); rc=$?
  printf '%s\n' "$verdict" | sed "s/^/sync-backup: $slug /"
  [ "$rc" -eq 0 ] || hard=$((hard+1))
  judged=$((judged+1))
done < <(find agency-os/tenants -name BACKUP_RESTORE_PROOF.md -not -path '*template*' 2>/dev/null)

# No active tenant judged = the frontmatter or layout changed under us, not "all fine".
[ "$judged" -gt 0 ] || { log "no active tenant found"; hard=$((hard+1)); }
log "done (judged=$judged hard=$hard${DRYRUN:+, dry run: nothing written})"
[ "$hard" -gt 0 ] && exit 1 || exit 0
