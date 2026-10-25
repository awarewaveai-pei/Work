#!/usr/bin/env bash
# install-host-schedules.sh -- install scripts/cron.d/* as /etc/cron.d/<name> (the repo copy is the SSOT for every
# schedule we own on the host; report-host-schedules.py flags any /etc/cron.d file that differs from it).
# Root's crontab is retired: its jobs live in cron.d/awarewave-schedules. Run as root from /root/lobster-phase1/scripts.
#   --check            show what would change; exit 0 = in sync, 1 = differs or a line's script is missing. Changes nothing.
#   (no flag)          back up, install, then empty root's crontab -- refused if a root crontab command is not in
#                      cron.d/awarewave-schedules (it would be lost).
#   --rollback <dir>   put back the cron files and root crontab saved in <dir> (printed by the install).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/cron.d"
DEST="${CRON_D_DIR:-/etc/cron.d}"
BACKUP_ROOT="${CRON_BACKUP_ROOT:-/root/lobster-phase1/.state}"
JOBS_DIR="${CRON_RUN_JOBS_DIR:-/var/lib/awarewave/jobs}"
say() { echo "[install-host-schedules] $*"; }

names() { find "$SRC" -maxdepth 1 -type f -printf '%f\n' | sort; }
# What the last install put in $DEST (dotted name: cron ignores it). A name in it but no longer in scripts/cron.d
# is retired: removed on install, so deleting a file from the repo stops that job instead of leaving it running.
MANAGED="$DEST/.awarewave-managed"
retired() { if [[ -f "$MANAGED" ]]; then comm -23 <(sort -u "$MANAGED") <(names); fi; }
root_lines() { crontab -l 2>/dev/null | grep -vE '^\s*(#|$)' | grep -vE '^[A-Za-z_][A-Za-z0-9_]*\s*=' || true; }

if [[ "${1:-}" == "--rollback" ]]; then
  dir="${2:?usage: --rollback <backup dir>}"
  [[ -f "$dir/MANIFEST" ]] || { say "ERROR: $dir has no MANIFEST -- not a backup from this script"; exit 1; }
  while IFS= read -r n; do
    if [[ -f "$dir/$n" ]]; then install -m 0644 "$dir/$n" "$DEST/.$n.rb" && mv -f "$DEST/.$n.rb" "$DEST/$n"
    else rm -f "$DEST/$n"; fi   # it did not exist before the install
  done < "$dir/MANIFEST"
  if [[ -f "$dir/managed.list" ]]; then cp -p "$dir/managed.list" "$MANAGED"; else rm -f "$MANAGED"; fi
  if [[ -s "$dir/root.crontab" ]]; then crontab "$dir/root.crontab"; fi
  say "restored from $dir"
  exit 0
fi

# Every root crontab command must already be in awarewave-schedules (compared without the cron-run.sh wrapper).
uncovered=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  cmd="$(printf '%s' "$line" | sed -E 's/^(@[a-z]+|([^ ]+ +){5})//')"
  grep -qF "'$cmd'" "$SRC/awarewave-schedules" || uncovered+=("$line")
done < <(root_lines)
# A VAR= line in root's crontab (CRON_TZ, MAILTO, ...) changes how its jobs run; emptying the crontab would drop it.
while IFS= read -r line; do
  [[ -n "$line" ]] && uncovered+=("$line (variable line: move it into cron.d/awarewave-schedules by hand)")
done < <(crontab -l 2>/dev/null | grep -E '^[A-Za-z_][A-Za-z0-9_]*\s*=' || true)

# Every script a line runs must exist on this host: a line pointing at a file nothing deploys fails every run
# (docker_weekly_cleanup called /usr/local/bin/... -> exit 127 until 2026-10-25). CRON_SCRIPT_ROOT prefixes paths (tests).
missing=()
while IFS= read -r n; do
  while IFS= read -r cmd; do
    read -ra toks <<< "$cmd"
    for t in "${toks[@]}"; do
      [[ "$t" == *=* || "$t" == bash || "$t" == sh || "$t" == python3 ]] && continue
      [[ "$t" == /* && ! -e "${CRON_SCRIPT_ROOT:-}$t" ]] && missing+=("$n: $t")
      break
    done
  done < <(sed -nE "s/^[^#].*cron-run\.sh [a-z0-9_]+ '(.*)'[[:space:]]*$/\1/p" "$SRC/$n")
done < <(names)

changed=0
while IFS= read -r n; do
  if ! cmp -s "$SRC/$n" "$DEST/$n"; then
    changed=1
    say "differs: $DEST/$n"
    diff -u "$DEST/$n" "$SRC/$n" 2>/dev/null | sed 's/^/    /' || true
  fi
done < <(names)
while IFS= read -r n; do
  [[ -z "$n" ]] && continue
  changed=1; say "retired (no longer in scripts/cron.d; the install removes it): $DEST/$n"
done < <(retired)
if [[ -n "$(root_lines)" ]]; then changed=1; say "root crontab still has $(root_lines | wc -l) line(s)"; fi
for l in "${uncovered[@]}"; do say "NOT in cron.d/awarewave-schedules: $l"; done
for m in "${missing[@]}"; do changed=1; say "MISSING script (that line would fail every run): $m"; done

if [[ "${1:-}" == "--check" ]]; then exit "$changed"; fi
if (( ${#uncovered[@]} )); then say "ERROR: add the lines above to cron.d/awarewave-schedules first -- nothing installed"; exit 1; fi
if (( ${#missing[@]} )); then say "ERROR: deploy the missing scripts or fix their paths first -- nothing installed"; exit 1; fi
for f in "$HERE/cron-run.sh" "$HERE/report-host-schedules.py"; do
  [[ -f "$f" ]] || { say "ERROR: $f missing -- every line calls it; nothing installed"; exit 1; }
done
[[ -x "$HERE/cron-run.sh" ]] || chmod +x "$HERE/cron-run.sh"
if (( ! changed )); then say "in sync -- nothing to do"; exit 0; fi

bk="$BACKUP_ROOT/cron-backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$bk"
{ names; retired; } | sort -u > "$bk/MANIFEST"
if [[ -f "$MANAGED" ]]; then cp -p "$MANAGED" "$bk/managed.list"; fi
while IFS= read -r n; do [[ -f "$DEST/$n" ]] && cp -p "$DEST/$n" "$bk/$n"; done < "$bk/MANIFEST"
crontab -l > "$bk/root.crontab" 2>/dev/null || : > "$bk/root.crontab"
say "backup: $bk  (undo: $0 --rollback $bk)"
trap 'say "FAILED part-way -- undo: $0 --rollback $bk"' ERR

mkdir -p "$JOBS_DIR"
# Staged under a dotted name: cron ignores files whose name contains a dot, so a half-copied file never runs.
mapfile -t gone < <(retired)
put() { install -m 0644 "$SRC/$1" "$DEST/.$1.new" && mv -f "$DEST/.$1.new" "$DEST/$1"; }
# awarewave-schedules and root's crontab hold the same jobs: switch them back to back, so a failure later in
# this install can never leave both live (every job twice) or neither.
put awarewave-schedules
if [[ -s "$bk/root.crontab" ]]; then crontab -r; fi
while IFS= read -r n; do [[ "$n" == awarewave-schedules ]] || put "$n"; done < <(names)
for n in "${gone[@]}"; do [[ -n "$n" ]] && rm -f "$DEST/$n"; done
names > "$DEST/.awarewave-managed.new" && mv -f "$DEST/.awarewave-managed.new" "$MANAGED"
trap - ERR
say "installed $(names | wc -l) file(s), retired ${#gone[@]}; root crontab emptied. Undo: $0 --rollback $bk"
