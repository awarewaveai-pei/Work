#!/usr/bin/env bash
# Host script refresh: sync-host-scripts.sh + the re-exec in auto-deploy-next-admin.sh,
# check-drift-and-alert.sh and sg-deploy.sh step 1.8. Rebuilds the host layout (/root/Work,
# /root/lobster-phase1, a bare origin) inside a THROWAWAY container and runs the real scripts.
# It rewrites /root/lobster-phase1, so it refuses to run outside a container. From the repo root:
#   MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD/lobster-factory/infra/hetzner-phase1-core:/src:ro" \
#     ubuntu:24.04 bash -c 'apt-get update -qq && apt-get install -y -qq git >/dev/null && bash /src/tests/host-scripts/sync.test.sh'
# ubuntu:24.04 = ks-aw-01's bash 5.2 / git 2.43. SRC=<dir> tests a mutated copy of the scripts.
set -euo pipefail

[[ -f /.dockerenv ]] || { echo "refusing: not inside a container (this test rewrites /root/lobster-phase1)"; exit 2; }

SRC="${SRC:-/src/scripts}"
P=lobster-factory/infra/hetzner-phase1-core
ORIGIN=/tmp/origin.git
SEED=/tmp/seed
WORK=/root/Work
STAGE=/root/lobster-phase1
ADLOG=$STAGE/logs/auto-deploy.log
DRLOG=/var/log/sg-deploy-drift.log

pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
not() { ! "$@"; }

git config --global user.email test@example.invalid
git config --global user.name test
git config --global init.defaultBranch main

push_change() { git -C "$SEED" add -A && git -C "$SEED" commit -qm "$1" && git -C "$SEED" push -q origin HEAD:main; }

# origin/main and the host both start at $SRC; git modes as in the repo (100644, rollback 100755).
reset_world() {
  rm -rf "$ORIGIN" "$SEED" "$WORK" "$STAGE" "$DRLOG" /tmp/sg-deploy.lock /tmp/auto-deploy-next-admin.lock
  git init -q --bare "$ORIGIN"
  git clone -q "$ORIGIN" "$SEED" 2>/dev/null
  mkdir -p "$SEED/$P/scripts" "$SEED/$P/apps/next-admin"
  cp "$SRC"/* "$SEED/$P/scripts/"
  chmod 644 "$SEED/$P/scripts/"*; chmod 755 "$SEED/$P/scripts/rollback-phase1.sh"
  echo v1 > "$SEED/$P/apps/next-admin/app.txt"
  push_change base
  git clone -q "$ORIGIN" "$WORK"
  mkdir -p "$STAGE/scripts" "$STAGE/logs" "$STAGE/apps/next-admin"
  cp "$SEED/$P/scripts/"* "$STAGE/scripts/"; chmod +x "$STAGE/scripts/"*.sh
  printf '%s=\n' SLACK_WEBHOOK_URL OPS_INBOX_SLACK_INCIDENTS_WEBHOOK TELEGRAM_BOT_TOKEN TELEGRAM_ALLOWED_CHAT_IDS > "$STAGE/.env"
  git -C "$WORK" rev-parse HEAD > "$STAGE/.deployed-commit"
}
fetch() { git -C "$WORK" fetch -q origin main; }
sync_block() { bash "$STAGE/scripts/sync-host-scripts.sh" 2>&1; }
cron_auto_deploy() { "$STAGE/scripts/auto-deploy-next-admin.sh" >> "$ADLOG" 2>&1 || true; }
drift_and_hold() {
  echo v2 > "$SEED/$P/apps/next-admin/app.txt"
  printf 'reason=test hold\ncreated_utc=2026-09-23T00:00:00Z\n' > "$SEED/$P/DEPLOY_HOLD"
}

t_block_install_and_idempotence() {
  reset_world
  echo '# host-only' > "$STAGE/scripts/upload-to-r2.sh"
  echo '# stale' >> "$STAGE/scripts/backup-phase1.sh"
  chmod 644 "$STAGE/scripts/verify-backup.sh"
  local out; out="$(sync_block)"
  check "block installs exactly the stale file" test "$(grep -c '] installed ' <<< "$out")" -eq 1
  check "block installed backup-phase1.sh" grep -qx '\[sync-host-scripts\] installed backup-phase1.sh' <<< "$out"
  check "block content == origin/main" cmp -s "$STAGE/scripts/backup-phase1.sh" "$SEED/$P/scripts/backup-phase1.sh"
  check "block keeps host-only files" test -f "$STAGE/scripts/upload-to-r2.sh"
  check "block restores a lost exec bit" test -x "$STAGE/scripts/verify-backup.sh"
  check "block: every managed .sh executable" test -z "$(cd "$SEED/$P/scripts" && for f in *.sh; do [[ -x "$STAGE/scripts/$f" ]] || echo "$f"; done)"
  local m; m="$(stat -c %Y "$STAGE/scripts/sg-deploy.sh")"; sleep 1
  out="$(sync_block)"
  check "block second run installs nothing" grep -q '(0 installed)' <<< "$out"
  check "block leaves unchanged files untouched" test "$(stat -c %Y "$STAGE/scripts/sg-deploy.sh")" = "$m"

  echo '# v2' >> "$SEED/$P/scripts/endpoint-alert.sh"; push_change v2; fetch
  sync_block > /dev/null
  check "block reads origin/main" cmp -s "$STAGE/scripts/endpoint-alert.sh" "$SEED/$P/scripts/endpoint-alert.sh"
  check "block leaves the worktree alone" not cmp -s "$WORK/$P/scripts/endpoint-alert.sh" "$SEED/$P/scripts/endpoint-alert.sh"
}

t_block_syntax_gate_all_or_nothing() {
  reset_world
  echo '# valid change' >> "$SEED/$P/scripts/backup-phase1.sh"
  printf 'if then fi\n' >> "$SEED/$P/scripts/slack-alert-drill.sh"
  push_change broken; fetch
  local out rc=0; out="$(sync_block)" || rc=$?
  check "syntax gate exits 1" test "$rc" -eq 1
  check "syntax gate names the file" grep -q 'bash -n rejects slack-alert-drill.sh' <<< "$out"
  check "syntax gate installs nothing, not even valid files" not cmp -s "$STAGE/scripts/backup-phase1.sh" "$SEED/$P/scripts/backup-phase1.sh"
}

t_block_deploy_pin() {
  reset_world
  echo '# v2' >> "$SEED/$P/scripts/rollback-phase1.sh"; push_change v2; fetch
  sleep 300 & local pin=$!
  echo "$pin" > /tmp/sg-deploy.lock
  local out; out="$(sync_block)"
  check "pin: skipped while another sg-deploy runs" grep -q "skipped: sg-deploy PID $pin" <<< "$out"
  check "pin: nothing installed meanwhile" not cmp -s "$STAGE/scripts/rollback-phase1.sh" "$SEED/$P/scripts/rollback-phase1.sh"
  SG_DEPLOY_LOCK_PID=$pin sync_block > /dev/null
  check "pin: the lock owner itself syncs" cmp -s "$STAGE/scripts/rollback-phase1.sh" "$SEED/$P/scripts/rollback-phase1.sh"
  kill "$pin"; wait "$pin" 2>/dev/null || true
  echo '# v3' >> "$SEED/$P/scripts/rollback-phase1.sh"; push_change v3; fetch
  sync_block > /dev/null
  check "pin: a dead holder does not block" cmp -s "$STAGE/scripts/rollback-phase1.sh" "$SEED/$P/scripts/rollback-phase1.sh"
  rm -f /tmp/sg-deploy.lock
  check "pin: the block watches the lock sg-deploy.sh really takes" grep -qx 'LOCK_FILE="/tmp/sg-deploy.lock"' "$SRC/sg-deploy.sh"
  check "pin: sg-deploy.sh takes that lock inside the block's flock" grep -q '^exec 8>/tmp/sync-host-scripts.lock' "$SRC/sg-deploy.sh"
}

# bash re-reads a running script from its fd after each command; rename keeps the old inode.
t_block_running_script_keeps_its_body() {
  reset_world
  printf '#!/usr/bin/env bash\nsleep 3\necho OLD-TAIL\n' > "$SEED/$P/scripts/probe-running.sh"
  push_change probe; fetch; sync_block > /dev/null
  "$STAGE/scripts/probe-running.sh" > /tmp/probe.out & local runner=$!
  sleep 1
  sed -i 's/OLD-TAIL/NEW-TAIL/' "$SEED/$P/scripts/probe-running.sh"; push_change probe2; fetch; sync_block > /dev/null
  wait "$runner"
  check "rename: running script finished with its own body" grep -qx OLD-TAIL /tmp/probe.out
  check "rename: next run gets the new body" grep -q NEW-TAIL "$STAGE/scripts/probe-running.sh"
}

OLD_CALLER_HOLD='/^HOLD_PATH=/,/^fi$/d'
OLD_CALLER_RC75='/if \[\[ "\$_deploy_rc" -eq 75 \]\]; then/,/^    fi$/d'
OLD_CALLER_REFRESH='/^if \[\[ "\${AUTO_DEPLOY_REEXEC/,/^fi$/d'

# The 2026-09-23 07:00Z shape: host caller older than origin/main's (here: without the hold check and
# without the exit-75 mapping), origin/main has app drift + DEPLOY_HOLD. Must end silent, never "FAILED".
t_auto_deploy_older_caller_under_hold() {
  reset_world
  sed -i -e "$OLD_CALLER_HOLD" -e "$OLD_CALLER_RC75" "$STAGE/scripts/auto-deploy-next-admin.sh"
  drift_and_hold; push_change "drift + hold"
  cron_auto_deploy
  check "auto-deploy re-ran origin/main's copy" grep -q 'this script changed on origin/main -- re-running the new copy' "$ADLOG"
  check "auto-deploy held silently" grep -q "HOLD: $P/DEPLOY_HOLD present" "$ADLOG"
  check "auto-deploy never reported FAILED" not grep -q FAILED "$ADLOG"
  check "auto-deploy never started sg-deploy" not compgen -G "$STAGE/logs/sg-deploy-*.log"
  check "auto-deploy logs each line once under cron" test "$(grep -c 'HOLD: ' "$ADLOG")" -eq 1
  check "auto-deploy released its lock" test ! -e /tmp/auto-deploy-next-admin.lock
}

# Same world without the refresh glue = the pre-fix host. Proves the harness reproduces the incident.
t_auto_deploy_without_refresh_reproduces_incident() {
  reset_world
  sed -i -e "$OLD_CALLER_HOLD" -e "$OLD_CALLER_RC75" -e "$OLD_CALLER_REFRESH" "$STAGE/scripts/auto-deploy-next-admin.sh"
  drift_and_hold; push_change "drift + hold"
  cron_auto_deploy
  check "control: old caller reports FAILED" grep -q 'FAILED: sg-deploy.sh exited non-zero' "$ADLOG"
  check "control: sg-deploy refused on the hold" grep -q 'DEPLOY HOLD active' "$ADLOG"
}

# sg-deploy's deliberate refusals (exit 75) never alert: a hold pushed after the caller's own check,
# and a deploy that is already running.
t_auto_deploy_maps_refusal() {
  reset_world
  sed -i -e "$OLD_CALLER_HOLD" "$SEED/$P/scripts/auto-deploy-next-admin.sh" "$STAGE/scripts/auto-deploy-next-admin.sh"
  drift_and_hold; push_change "caller without the pre-check + drift + hold"
  cron_auto_deploy
  check "refusal(hold): logged REFUSED" grep -q 'REFUSED by sg-deploy' "$ADLOG"
  check "refusal(hold): no FAILED alert" not grep -q FAILED "$ADLOG"

  reset_world
  echo v2 > "$SEED/$P/apps/next-admin/app.txt"; push_change drift
  sleep 300 & local pin=$!
  echo "$pin" > /tmp/sg-deploy.lock
  cron_auto_deploy
  kill "$pin"; wait "$pin" 2>/dev/null || true; rm -f /tmp/sg-deploy.lock
  check "refusal(busy): the sync skipped for the running deploy" grep -q "skipped: sg-deploy PID $pin" "$ADLOG"
  check "refusal(busy): logged REFUSED" grep -q 'REFUSED by sg-deploy' "$ADLOG"
  check "refusal(busy): no FAILED alert" not grep -q FAILED "$ADLOG"
}

t_auto_deploy_change_lands_without_drift() {
  reset_world
  sed -i '0,/^DEPLOYED=/s//log "MARKER-v2"\nDEPLOYED=/' "$SEED/$P/scripts/auto-deploy-next-admin.sh"
  push_change "caller v2"
  cron_auto_deploy
  check "no-drift: new caller ran exactly once" test "$(grep -c MARKER-v2 "$ADLOG")" -eq 1
  check "no-drift: decided no drift" grep -q 'OK: no app-code drift' "$ADLOG"
}

t_drift_check_refresh_and_hold() {
  reset_world
  sed -i '0,/^DEPLOYED=/s//log "MARKER-drift-v2"\nDEPLOYED=/' "$SEED/$P/scripts/check-drift-and-alert.sh"
  drift_and_hold; push_change "drift check v2 + drift + hold"
  "$STAGE/scripts/check-drift-and-alert.sh" >> "$DRLOG" 2>&1 || true
  check "drift-check re-ran the new copy" grep -q 're-running the new copy' "$DRLOG"
  check "drift-check new logic ran once" test "$(grep -c MARKER-drift-v2 "$DRLOG")" -eq 1
  check "drift-check stays quiet under the hold" grep -q 'HOLD: .* suppressing drift alert' "$DRLOG"
}

t_sg_deploy_step18_uses_block() {
  reset_world
  echo '# v2' >> "$SEED/$P/scripts/rollback-phase1.sh"
  printf 'reason=test hold\n' > "$SEED/$P/DEPLOY_HOLD"
  push_change "rollback v2 + hold"
  local out rc=0; out="$(bash "$STAGE/scripts/sg-deploy.sh" next-admin 2>&1)" || rc=$?
  check "sg-deploy refuses the hold with 75" test "$rc" -eq 75
  check "sg-deploy step 1.8 went through the block" grep -q '\[sync-host-scripts\] installed rollback-phase1.sh' <<< "$out"
  check "sg-deploy then refused on the hold" grep -q 'DEPLOY HOLD active' <<< "$out"
  printf 'if then fi\n' >> "$SEED/$P/scripts/slack-alert-drill.sh"; push_change broken
  rc=0; out="$(bash "$STAGE/scripts/sg-deploy.sh" next-admin 2>&1)" || rc=$?
  check "sg-deploy: failed sync stops the deploy" grep -q 'host script sync failed' <<< "$out"
  check "sg-deploy: ... before the hold gate" not grep -q 'DEPLOY HOLD active' <<< "$out"
}

# A cron-side sync can replace sg-deploy.sh on disk after a deploy started (simulated by a post-merge
# hook, i.e. during step 1's pull). The deploy must still continue in origin/main's copy.
t_sg_deploy_continues_in_installed_copy() {
  reset_world
  sed -i '/^# 1\.85\. deploy hold/i log "MARKER-sgd-v2"' "$SEED/$P/scripts/sg-deploy.sh"
  printf 'reason=test hold\n' > "$SEED/$P/DEPLOY_HOLD"
  push_change "sg-deploy v2 + hold"
  cp "$SEED/$P/scripts/sg-deploy.sh" /tmp/sgd-v2.sh
  printf '#!/bin/sh\ncp /tmp/sgd-v2.sh %s/.sgd && chmod +x %s/.sgd && mv -f %s/.sgd %s/sg-deploy.sh\n' \
    "$STAGE/scripts" "$STAGE/scripts" "$STAGE/scripts" "$STAGE/scripts" > "$WORK/.git/hooks/post-merge"
  chmod +x "$WORK/.git/hooks/post-merge"
  local out rc=0; out="$(bash "$STAGE/scripts/sg-deploy.sh" next-admin 2>&1)" || rc=$?
  check "sg-deploy: file replaced mid-run, still continues in origin/main's copy" grep -q MARKER-sgd-v2 <<< "$out"
  check "sg-deploy: ... and refuses the hold with 75" test "$rc" -eq 75
}

t_sg_deploy_lock_inside_sync_section() {
  reset_world
  printf 'reason=test hold\n' > "$SEED/$P/DEPLOY_HOLD"; push_change hold
  flock /tmp/sync-host-scripts.lock sleep 3 & local holder=$!
  sleep 0.5
  bash "$STAGE/scripts/sg-deploy.sh" next-admin > /tmp/sgd-wait.out 2>&1 & local dep=$!
  sleep 1.5
  check "sg-deploy takes its lock only after a running sync finished" test ! -e /tmp/sg-deploy.lock
  wait "$holder" || true
  local rc=0; wait "$dep" || rc=$?
  check "sg-deploy: ... then runs (refused on the hold with 75)" test "$rc" -eq 75
}

# codex r2 F1: a host with no copy of the block yet (under a hold nothing else would install one).
t_auto_deploy_bootstraps_missing_block() {
  reset_world
  rm -f "$STAGE/scripts/sync-host-scripts.sh"
  sed -i -e "$OLD_CALLER_HOLD" -e "$OLD_CALLER_RC75" "$STAGE/scripts/auto-deploy-next-admin.sh"
  drift_and_hold; push_change "drift + hold"
  local before; before="$(find /tmp -maxdepth 1 -name 'tmp.*' | wc -l)"   # find exits 0 with no match; ls would trip set -e
  cron_auto_deploy
  check "bootstrap: block installed itself from origin/main" test -x "$STAGE/scripts/sync-host-scripts.sh"
  check "bootstrap: caller re-ran origin/main's copy" grep -q 're-running the new copy' "$ADLOG"
  check "bootstrap: held silently, never FAILED" not grep -q FAILED "$ADLOG"
  check "bootstrap: temp copy of the block removed" test "$(find /tmp -maxdepth 1 -name 'tmp.*' | wc -l)" -eq "$before"
  reset_world
  rm -f "$STAGE/scripts/sync-host-scripts.sh"
  "$STAGE/scripts/check-drift-and-alert.sh" >> "$DRLOG" 2>&1 || true
  check "bootstrap: drift-check installs the block too" test -x "$STAGE/scripts/sync-host-scripts.sh"
}

# codex r2 F2: the lock must not have a gap between the first copy and the re-exec'd copy.
t_auto_deploy_lock_survives_reexec() {
  reset_world
  sed -i '0,/^DEPLOYED=/s//sleep 3\nDEPLOYED=/' "$SEED/$P/scripts/auto-deploy-next-admin.sh"
  push_change "caller v2 (slow)"
  cron_auto_deploy & local first=$!
  local _i; for _i in $(seq 1 60); do grep -q 're-running the new copy' "$ADLOG" 2>/dev/null && break; sleep 0.1; done
  sleep 0.3
  cron_auto_deploy   # a second tick while the re-exec'd copy is still deciding
  wait "$first" || true
  check "reexec: second tick met the lock and skipped" grep -q 'SKIP: lock file exists' "$ADLOG"
  check "reexec: first run still finished its decision" grep -q 'OK: no app-code drift' "$ADLOG"
  check "reexec: lock released at the end" test ! -e /tmp/auto-deploy-next-admin.lock
  check "reexec: lock holds the PID (re-exec keeps it)" grep -q 'echo "\$\$" > "\$LOCK_FILE"' "$STAGE/scripts/auto-deploy-next-admin.sh"
}

# codex r3 F1: the lock is created atomically; a dead holder's lock is taken over, a live one is honoured.
t_auto_deploy_lock_is_atomic_and_stale_safe() {
  reset_world
  echo 999999 > /tmp/auto-deploy-next-admin.lock           # holder PID that does not exist
  cron_auto_deploy
  check "stale lock: a dead holder's lock is taken over" grep -q 'OK: no app-code drift' "$ADLOG"
  check "stale lock: released afterwards" test ! -e /tmp/auto-deploy-next-admin.lock
  reset_world
  sleep 300 & local live=$!
  echo "$live" > /tmp/auto-deploy-next-admin.lock
  cron_auto_deploy
  kill "$live"; wait "$live" 2>/dev/null || true; rm -f /tmp/auto-deploy-next-admin.lock
  check "live lock: honoured" grep -q 'SKIP: lock file exists' "$ADLOG"
  check "live lock: no decision made" not grep -q 'OK: no app-code drift' "$ADLOG"
  check "atomic: the lock is created with noclobber" grep -q 'set -o noclobber; echo "\$\$" > "\$LOCK_FILE"' "$STAGE/scripts/auto-deploy-next-admin.sh"
}

# codex r2 F3: a copy that fails half-way must install nothing and leave no partial behind.
t_block_install_failure_all_or_nothing() {
  reset_world
  echo '# v2' >> "$SEED/$P/scripts/backup-phase1.sh"
  echo '# v2' >> "$SEED/$P/scripts/verify-backup.sh"
  push_change "two changed"; fetch
  mkdir -p /tmp/shim
  printf '#!/usr/bin/env bash\nfor a in "$@"; do [[ "$a" == *verify-backup.sh.sync-* ]] && { echo "cp: injected failure" >&2; exit 1; }; done\nexec /usr/bin/cp "$@"\n' > /tmp/shim/cp
  chmod +x /tmp/shim/cp
  local out rc=0; out="$(PATH=/tmp/shim:$PATH bash "$STAGE/scripts/sync-host-scripts.sh" 2>&1)" || rc=$?
  rm -rf /tmp/shim
  check "install failure: exits 1" test "$rc" -eq 1
  check "install failure: names the file" grep -q 'cannot stage verify-backup.sh' <<< "$out"
  check "install failure: the other changed file was NOT installed either" not cmp -s "$STAGE/scripts/backup-phase1.sh" "$SEED/$P/scripts/backup-phase1.sh"
  check "install failure: no partial left behind" test -z "$(ls "$STAGE"/scripts/*.sync-* 2>/dev/null)"
  local out2; out2="$(sync_block)"
  check "install failure: a clean retry installs both" test "$(grep -c '] installed ' <<< "$out2")" -eq 2
}

main() {
  local t
  for t in $(declare -F | awk '{print $3}' | grep '^t_'); do "$t"; done
  echo "=== $pass passed, $failed failed ==="
  [[ "$failed" -eq 0 ]]
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
