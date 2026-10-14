#!/usr/bin/env bash
# Offsite leg for the two pipelines that only kept local copies (BACKUP_COVERAGE_PLAN.md B3).
#   cognitive: newest run of backup-cognitive-db.sh (/root/backups/cognitive-db, one .dump per database)
#              + the volume cognitive-os-api mounts at .runtime (source/artifact blobs the database rows name)
#              -> /root/backups-cognitive/<STAMP>/{<database>.dump,runtime.tgz,.complete} -> R2 cognitive/<date>/
#   hci:       newest finished /root/backups-hci-postgres/<STAMP>/ (has .complete) -> R2 hci/<date>/
# Runs after both (backup-coverage.cron, 02:50 UTC). Database first, blobs second: a blob erased in between is
# missing from runtime.tgz, never the other way round (a new row naming a blob the archive lacks).
# Erasure: a cognitive dump may hold erased data for at most 7 days (backup-cognitive-db.sh:6). So: local snapshots
# here are removed after 5 days on every run, success or not; each dump run is shipped once (a re-ship would restart
# R2's age clock); R2 cognitive/ expires after 5 days (inventory lifecycle rule; R2 may delete a day late).
# Log: /var/log/backup-offsite.log
set -euo pipefail

set -a
[[ -f /etc/default/eu-backup ]] && source /etc/default/eu-backup   # R2_API_TOKEN, R2_ACCOUNT_ID
set +a

COG_SRC="${COG_SRC:-/root/backups/cognitive-db}"
COG_OUT_ROOT="${COG_OUT_ROOT:-/root/backups-cognitive}"
COG_KEEP_DAYS="${COG_KEEP_DAYS:-5}"
COG_API_CONTAINER="${COG_API_CONTAINER:-cognitive-os-api}"
HCI_ROOT="${HCI_ROOT:-/root/backups-hci-postgres}"
UPLOAD="${UPLOAD:-/root/scripts/upload-to-r2.sh}"
SNAP_RE='^[0-9]{8}-[0-9]{6}$'
ERRORS=0

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }
date_of() { echo "${1:0:4}-${1:4:2}-${1:6:2}"; }   # 20261014-025001 -> 2026-10-14

cognitive_cleanup() {
  mkdir -p "$COG_OUT_ROOT"
  find "$COG_OUT_ROOT" -maxdepth 1 -mindepth 1 \( -type d -regextype posix-extended -regex ".*/[0-9]{8}-[0-9]{6}" \
    -o -type f -name '.shipped-*' \) -mmin +"$(( COG_KEEP_DAYS * 1440 - 60 ))" -exec rm -rf {} +
}

cognitive() {
  local newest day run stamp out f hex name vol n=0
  newest="$(find "$COG_SRC" -maxdepth 1 -name 'cognitive-db-*.dump' -printf '%T@ %f\n' | sort -n | tail -1 | cut -d' ' -f2)"
  if [[ -z "$newest" ]]; then log "  ERROR: cognitive: no dump in $COG_SRC"; return 1; fi
  day="${newest:13:10}"                                              # cognitive-db-<YYYY-MM-DD>-<hex>-<HHMMSS>-<pid>.dump
  run="${newest%.dump}"; run="${run#cognitive-db-"$day"-*-}"         # <HHMMSS>-<pid>, shared by the run's dumps
  if [[ -e "$COG_OUT_ROOT/.shipped-$day-$run" ]]; then
    log "  ERROR: cognitive: newest dump run $day $run was already shipped -- backup-cognitive-db.sh made no new run"
    return 1
  fi
  vol="$(docker inspect "$COG_API_CONTAINER" \
          --format '{{range .Mounts}}{{if eq .Destination "/app/Projects/internal/cognitive-engineering-os/.runtime"}}{{.Name}}{{end}}{{end}}')"
  if [[ -z "$vol" ]]; then log "  ERROR: cognitive: $COG_API_CONTAINER has no .runtime volume"; return 1; fi
  stamp="$(date -u +%Y%m%d-%H%M%S)"; out="$COG_OUT_ROOT/$stamp"
  mkdir -p "$out" || return 1
  for f in "$COG_SRC"/cognitive-db-"$day"-*-"$run".dump; do
    hex="${f##*/cognitive-db-"$day"-}"; hex="${hex%-"$run".dump}"
    name="$(printf '%b' "$(sed 's/../\\x&/g' <<<"$hex")")"
    [[ "$name" =~ ^[A-Za-z0-9_]+$ ]] || { log "  ERROR: cognitive: cannot decode database name from $f"; return 1; }
    ln -f "$f" "$out/$name.dump" || return 1; n=$((n + 1))
  done
  log "  cognitive: $n database dump(s) from run $day $run; blobs from volume $vol"
  if ! docker run --rm -v "$vol":/data:ro -v "$out":/backup alpine tar czf /backup/runtime.tgz -C /data . \
       || [[ ! -s "$out/runtime.tgz" ]]; then
    log "  ERROR: cognitive: runtime.tgz failed"; return 1
  fi
  R2_PREFIX=cognitive "$UPLOAD" "$out" "$(date_of "$stamp")" || { log "  ERROR: cognitive: R2 upload failed"; return 1; }
  touch "$out/.complete" "$COG_OUT_ROOT/.shipped-$day-$run"
}

hci() {
  local stamp
  stamp="$(ls -1 "$HCI_ROOT" 2>/dev/null | grep -E "$SNAP_RE" | sort | tail -1 || true)"
  if [[ -z "$stamp" || ! -e "$HCI_ROOT/$stamp/.complete" ]]; then
    log "  ERROR: hci: newest snapshot ${stamp:-(none)} in $HCI_ROOT did not finish (no .complete)"; return 1
  fi
  if [[ -z "$(find "$HCI_ROOT/$stamp" -maxdepth 0 -mmin -1560)" ]]; then
    log "  ERROR: hci: newest snapshot $stamp is older than 26h"; return 1
  fi
  R2_PREFIX=hci "$UPLOAD" "$HCI_ROOT/$stamp" "$(date_of "$stamp")" || { log "  ERROR: hci: R2 upload failed"; return 1; }
}

log "=== backup-offsite START ==="
cognitive_cleanup || ERRORS=$((ERRORS + 1))
cognitive || ERRORS=$((ERRORS + 1))
hci || ERRORS=$((ERRORS + 1))
if [[ $ERRORS -gt 0 ]]; then log "=== backup-offsite FAILED: $ERRORS ==="; exit 1; fi
log "=== backup-offsite PASSED ==="
