#!/usr/bin/env bash
# wp-cron-runner.sh -- the scheduler for every WordPress container on this host that sets DISABLE_WP_CRON.
#
# Invariant: DISABLE_WP_CRON=true  =>  due events run within a minute. Targets are DISCOVERED, not listed:
# a running container that mounts /var/www/html, has wp-cli, and whose WordPress reports DISABLE_WP_CRON.
# A new site that disables WP-Cron is covered on the next tick; one that stops disabling it drops out.
# (2026-09-24: soulfulexpression.org ran with DISABLE_WP_CRON and no scheduler for 4 weeks after cutover.)
#
# Install: `wp-cron-runner.sh --install` (root) = /etc/cron.d/wp-cron-runner every minute + logrotate +
# dead-man registration; install-maintenance-crons.sh calls it on rebuilds.
# Heartbeat: touches $STATE_DIR/heartbeat only after a tick where every target ran clean and none is
# still overdue; endpoint-alert.sh reads /etc/awarewave-alert/fresh.d/wp-cron-runner and alerts when it
# goes stale (runner broken, uninstalled, or a site's cron failing).
# Pause (migration freeze -- WP-CLI ignores maintenance mode): touch $STATE_DIR/paused (all) or
# $STATE_DIR/paused.<container>. A paused target skips but the heartbeat still counts it healthy.
#
# Env (tests): WP_CRON_STATE_DIR, WP_CRON_RUN_TIMEOUT (s, default 900), WP_CRON_OVERDUE_GRACE (s, 900),
# WP_CRON_NAME_FILTER (container-name regex, default all). Test: tests/host-scripts/wp-cron-runner.test.sh
set -uo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

STATE_DIR="${WP_CRON_STATE_DIR:-/var/lib/wp-cron-runner}"
RUN_TIMEOUT="${WP_CRON_RUN_TIMEOUT:-900}"
GRACE="${WP_CRON_OVERDUE_GRACE:-900}"
NAME_FILTER="${WP_CRON_NAME_FILTER:-.}"   # tests confine discovery to their own containers
DOCROOT=/var/www/html

say() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] wp-cron-runner: $*"; }

if [[ "${1:-}" == "--install" ]]; then   # idempotent; also called by install-maintenance-crons.sh
  set -e
  for d in /etc/cron.d /etc/logrotate.d; do [[ -d "$d" ]] || { say "install: $d missing (cron/logrotate not installed?)"; exit 1; }; done
  self="$(realpath "$0")"
  printf '%s\n' "# Managed by wp-cron-runner.sh --install -- do not edit." "SHELL=/bin/bash" \
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "* * * * * root ${self} >> /var/log/wp-cron-runner.log 2>&1" > /etc/cron.d/wp-cron-runner
  chmod 0644 /etc/cron.d/wp-cron-runner
  printf '%s\n' "/var/log/wp-cron-runner.log {" "  weekly" "  rotate 8" "  compress" "  missingok" \
    "  notifempty" "}" > /etc/logrotate.d/wp-cron-runner
  mkdir -p /etc/awarewave-alert/fresh.d "$STATE_DIR"
  echo "$STATE_DIR/heartbeat 900 wp-cron-runner" > /etc/awarewave-alert/fresh.d/wp-cron-runner
  say "installed: /etc/cron.d/wp-cron-runner -> $self, logrotate, dead-man registration (900s)"
  exit 0
fi

mkdir -p "$STATE_DIR"
[[ -e "$STATE_DIR/paused" ]] && { say "paused (all)"; touch "$STATE_DIR/heartbeat"; exit 0; }

# One PHP call per target, WordPress booted without plugins/themes (the cron option and the constant
# are all it needs): "<disabled 0|1> <events due now> <events due longer than GRACE>". Anything else =
# unreadable. The full run (plugins loaded) happens only when something is due.
PROBE='$d = defined("DISABLE_WP_CRON") && DISABLE_WP_CRON ? 1 : 0; $due = 0; $late = 0; $now = time(); $t = $now - (int) getenv("GRACE");
foreach ((array) _get_cron_array() as $ts => $hooks) { if ($ts > $now) { continue; } foreach ((array) $hooks as $h) { $k = count((array) $h); $due += $k; if ($ts < $t) { $late += $k; } } }
echo "$d $due $late";'

wpx() {  # <container> <args...> -- WP-CLI as www-data at an explicit path (never the container's cwd)
  local c="$1"; shift
  docker exec -u www-data -e GRACE="$GRACE" "$c" wp --path="$DOCROOT" "$@" </dev/null
}

healthy=1
# A discovery that could not look is not "no targets": docker down must withhold the heartbeat.
if ! list="$(docker ps --format '{{.Names}}' 2>&1)"; then say "docker ps failed: ${list:0:120}"; exit 1; fi
mapfile -t containers <<<"$list"
for c in "${containers[@]}"; do
  [[ -n "$c" && "$c" =~ $NAME_FILTER ]] || continue
  if ! mounts="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/www/html"}}y{{end}}{{end}}' "$c" 2>&1)"; then
    docker inspect "$c" >/dev/null 2>&1 || continue                    # exited between ps and inspect
    say "$c: docker inspect failed"; healthy=0; continue
  fi
  [[ "$mounts" == *y* ]] || continue
  # Heartbeat invariant: every `continue` below is a POSITIVE observation (not WordPress, WP-Cron on,
  # paused, nothing due, run already active and bounded by the in-container timeout). A step that
  # could not observe sets healthy=0 -- so "no answer" is never read as "not WordPress".
  kind="$(docker exec "$c" sh -c 'if command -v wp >/dev/null && test -f /var/www/html/wp-config.php; then echo WP; else echo NOTWP; fi' </dev/null 2>/dev/null)"
  case "$kind" in
    WP) ;;
    NOTWP) continue ;;
    *) docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true || continue   # stopped meanwhile
       say "$c: docker exec failed during discovery"; healthy=0; continue ;;
  esac

  before="$(wpx "$c" --skip-plugins --skip-themes eval "$PROBE" 2>/dev/null | tail -1)"
  if [[ ! "$before" =~ ^([01])\ ([0-9]+)\ ([0-9]+)$ ]]; then
    say "$c: probe unreadable ('${before:0:80}')"; healthy=0; continue
  fi
  [[ "${BASH_REMATCH[1]}" == 1 ]] || continue                        # WP-Cron still on for this site
  if [[ -e "$STATE_DIR/paused.$c" ]]; then say "$c: paused"; continue; fi
  (( BASH_REMATCH[2] > 0 )) || continue                              # nothing due this minute

  # Serialized per container: a long event (backup, import) makes later ticks skip, not pile up. The
  # timeout runs INSIDE the container: killing only the host's `docker exec` client would leave WP-CLI
  # running there after the lock is released. The host-side timeout is a backstop for a hung exec.
  if ! docker exec "$c" sh -c 'command -v timeout' </dev/null >/dev/null 2>&1; then
    say "$c: no timeout(1) in the container -- not run"; healthy=0; continue
  fi
  exec 8>"$STATE_DIR/lock.$c"
  if ! flock -n 8; then say "$c: previous run still active -- skipped"; exec 8>&-; continue; fi
  start=$(date +%s)
  out="$(timeout $(( RUN_TIMEOUT + 60 )) docker exec -u www-data "$c" \
    timeout -k 30 "$RUN_TIMEOUT" wp --path="$DOCROOT" cron event run --due-now </dev/null 2>&1)"
  rc=$?
  exec 8>&-
  after="$(wpx "$c" --skip-plugins --skip-themes eval "$PROBE" 2>/dev/null | tail -1)"
  ran="$(grep -c '^Executed the cron event' <<<"$out")"
  if [[ $rc -ne 0 ]]; then
    say "$c: rc=$rc after $(( $(date +%s) - start ))s ran=$ran: $(grep -v -i 'warning' <<<"$out" | tail -3 | tr '\n' ' ')"
    healthy=0
  elif [[ ! "$after" =~ ^[01]\ [0-9]+\ ([0-9]+)$ ]]; then
    say "$c: post-run probe unreadable"; healthy=0
  elif (( BASH_REMATCH[1] > 0 )); then
    say "$c: ${BASH_REMATCH[1]} event(s) still overdue >${GRACE}s after the run (ran=$ran)"; healthy=0
  elif (( ran > 0 )); then
    say "$c: ran=$ran in $(( $(date +%s) - start ))s"
  fi
done

(( healthy )) && touch "$STATE_DIR/heartbeat"
exit $(( 1 - healthy ))
