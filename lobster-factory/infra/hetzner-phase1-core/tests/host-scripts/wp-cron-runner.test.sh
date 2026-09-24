#!/usr/bin/env bash
# scripts/wp-cron-runner.sh + the endpoint-alert.sh freshness check against a THROWAWAY stack:
# mariadb:11 + two wordpress:php8.2-apache sites with wp-cli (cron-off = DISABLE_WP_CRON, cron-on = default),
# all labelled aw-cron-test=1. The runner runs in a docker:cli container on the same daemon, confined to
# these containers by WP_CRON_NAME_FILTER. Needs Docker + internet (wp core download). From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/wp-cron-runner.test.sh
# RUNNER=<file> / ALERT=<file> run mutated copies. KEEP=1 leaves the stack up.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="${RUNNER:-$HERE/../../scripts/wp-cron-runner.sh}"
ALERT="${ALERT:-$HERE/../../scripts/endpoint-alert.sh}"
OFF=aw-cron-test-off; ON=aw-cron-test-on; DB=aw-cron-test-db; NET=aw-cron-test

pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
not() { ! "$@"; }
has() { [[ "$1" == *"$2"* ]]; }

teardown() {
  local ids; ids="$(docker ps -aq --filter label=aw-cron-test=1)"
  [[ -z "$ids" ]] || docker rm -f $ids >/dev/null
  docker volume rm aw-cron-test-state >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT

docker build -q -t aw-cron-test-wp - >/dev/null <<'EOF' || { echo "image build failed"; exit 2; }
FROM wordpress:php8.2-apache
RUN curl -sSL https://github.com/wp-cli/wp-cli/releases/download/v2.11.0/wp-cli-2.11.0.phar -o /usr/local/bin/wp && chmod +x /usr/local/bin/wp
EOF
docker build -q -t aw-cron-test-runner - >/dev/null <<'EOF' || { echo "runner build failed"; exit 2; }
FROM docker:cli
RUN apk add --no-cache bash coreutils util-linux grep curl python3
EOF
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
R_DIR="$(hostpath "$(cd "$(dirname "$RUNNER")" && pwd)")"; R_FILE="$(basename "$RUNNER")"
A_DIR="$(hostpath "$(cd "$(dirname "$ALERT")" && pwd)")"; A_FILE="$(basename "$ALERT")"

docker network create "$NET" >/dev/null
docker volume create aw-cron-test-state >/dev/null
docker run -d --label aw-cron-test=1 --name "$DB" --network "$NET" -e MYSQL_ROOT_PASSWORD=rootpw-test mariadb:11 >/dev/null
for _ in $(seq 60); do docker exec "$DB" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot -e "select 1"' >/dev/null 2>&1 && break; sleep 2; done
for s in "$OFF" "$ON"; do
  d="${s//-/_}"
  docker exec "$DB" sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mariadb -uroot -e \"CREATE DATABASE $d; GRANT ALL ON $d.* TO 'wp'@'%' IDENTIFIED BY 'wppw';\""
  docker run -d --label aw-cron-test=1 --name "$s" --network "$NET" -e WORDPRESS_DB_HOST="$DB" \
    -e WORDPRESS_DB_NAME="$d" -e WORDPRESS_DB_USER=wp -e WORDPRESS_DB_PASSWORD=wppw aw-cron-test-wp >/dev/null
done
wpc() { local c="$1"; shift; docker exec -u www-data "$c" wp --path=/var/www/html "$@"; }
for s in "$OFF" "$ON"; do
  for _ in $(seq 60); do docker exec "$s" test -f /var/www/html/wp-config.php 2>/dev/null && break; sleep 2; done
  wpc "$s" core install --url="http://$s.test" --title="$s" --admin_user=a --admin_password=x \
    --admin_email=a@x.invalid --skip-email --quiet || { echo "install $s failed"; exit 2; }
  # Test hooks: aw_ok records that it ran; aw_boom kills the PHP process mid-run.
  docker exec -i -u www-data "$s" sh -c 'mkdir -p /var/www/html/wp-content/mu-plugins && cat > /var/www/html/wp-content/mu-plugins/aw-test.php' <<'PHP'
<?php
add_action('aw_ok', function () { update_option('aw_ok_ran', (string) time()); });
add_action('aw_boom', function () { trigger_error('aw_boom', E_USER_ERROR); });
add_action('aw_slow', function () { sleep(40); });
PHP
done
wpc "$OFF" config set DISABLE_WP_CRON true --raw --quiet
past() { echo $(( $(date +%s) - 1200 )); }   # 20 min overdue: past the test GRACE of 60s

run() {  # runner in a prod-shaped container on this daemon; prints output, returns its exit code
  docker run --rm --label aw-cron-test=1 -v /var/run/docker.sock:/var/run/docker.sock \
    -v aw-cron-test-state:/state -v "$R_DIR:/r:ro" -e WP_CRON_STATE_DIR=/state -e WP_CRON_OVERDUE_GRACE=60 \
    -e WP_CRON_NAME_FILTER='^aw-cron-test-' aw-cron-test-runner bash -c "$1"
}
state() { docker run --rm --label aw-cron-test=1 -v aw-cron-test-state:/state alpine sh -c "$1"; }

# --- 1. a DISABLE_WP_CRON site runs its due events; a site with WP-Cron on is left alone ---
wpc "$OFF" cron event schedule aw_ok "$(past)" --quiet
wpc "$ON" cron event schedule aw_ok "$(past)" --quiet
out="$(run "bash /r/$R_FILE" 2>&1)"; rc=$?
check "clean tick exits 0" test "$rc" = 0
check "cron-off site: overdue event ran" wpc "$OFF" option get aw_ok_ran
check "cron-on site: runner did not touch it" not wpc "$ON" option get aw_ok_ran
check "log names the site and the count" has "$out" "$OFF: ran="
check "heartbeat written after a healthy tick" state 'test -f /state/heartbeat'

# --- 2. nothing due -> no full run, still healthy ---
state 'rm -f /state/heartbeat'
out="$(run "bash /r/$R_FILE" 2>&1)"; rc=$?
check "idle tick exits 0 and logs nothing" test "$rc:$out" = "0:"
check "idle tick refreshes the heartbeat" state 'test -f /state/heartbeat'

# --- 3. a failing event -> exit 1, no heartbeat ---
wpc "$OFF" cron event schedule aw_boom "$(past)" --quiet
state 'rm -f /state/heartbeat'
out="$(run "bash /r/$R_FILE" 2>&1)"; rc=$?
check "failing event -> exit 1" test "$rc" = 1
check "failing event -> reported with rc" has "$out" "$OFF: rc="
check "failing event -> heartbeat withheld" not state 'test -f /state/heartbeat'

# --- 4. pause: per site and global ---
wpc "$OFF" option delete aw_ok_ran --quiet
wpc "$OFF" cron event schedule aw_ok "$(past)" --quiet
state "touch /state/paused.$OFF"
out="$(run "bash /r/$R_FILE" 2>&1)"; rc=$?
check "paused site is skipped" not wpc "$OFF" option get aw_ok_ran
check "paused site is healthy for the heartbeat" test "$rc" = 0
state "rm -f /state/paused.$OFF; touch /state/paused"
out="$(run "bash /r/$R_FILE" 2>&1)"
check "global pause skips everything" not wpc "$OFF" option get aw_ok_ran
state 'rm -f /state/paused'

# --- 5. a run still holding the lock -> skip, not pile up ---
# The holder is a separate process: a lock taken by the `bash -c` shell itself would vanish when bash
# execs the last command in place.
out="$(run "flock /state/lock.$OFF sleep 60 & sleep 1; bash /r/$R_FILE; kill \$!" 2>&1)"; rc=$?
check "locked site skipped" has "$out" "previous run still active"
check "locked site not run" not wpc "$OFF" option get aw_ok_ran
out="$(run "bash /r/$R_FILE" 2>&1)"
check "next tick runs it" wpc "$OFF" option get aw_ok_ran

# --- 5b. docker unreachable -> exit 1, heartbeat withheld (codex F1: empty discovery read as healthy) ---
state 'rm -f /state/heartbeat'
out="$(docker run --rm --label aw-cron-test=1 -v aw-cron-test-state:/state -v "$R_DIR:/r:ro" \
  -e WP_CRON_STATE_DIR=/state aw-cron-test-runner bash "/r/$R_FILE" 2>&1)"; rc=$?
check "docker unreachable -> exit 1" test "$rc" = 1
check "docker unreachable -> heartbeat withheld" not state 'test -f /state/heartbeat'

# --- 5b2. a docroot container the runner cannot exec into -> unhealthy, not "not WordPress" (codex r2 F1) ---
docker run -d --label aw-cron-test=1 --name aw-cron-test-noexec -v aw-cron-test-www:/var/www/html \
  registry.k8s.io/pause:3.9 >/dev/null
state 'rm -f /state/heartbeat'
out="$(run "bash /r/$R_FILE" 2>&1)"; rc=$?
check "exec failure during discovery -> exit 1" test "$rc" = 1
check "exec failure during discovery -> named" has "$out" "aw-cron-test-noexec: docker exec failed during discovery"
check "exec failure during discovery -> heartbeat withheld" not state 'test -f /state/heartbeat'
docker rm -f aw-cron-test-noexec >/dev/null; docker volume rm aw-cron-test-www >/dev/null 2>&1

# --- 5c. a run over the timeout is killed INSIDE the container (codex F2: only the exec client died) ---
wpc "$OFF" cron event schedule aw_slow "$(past)" --quiet
out="$(run "WP_CRON_RUN_TIMEOUT=3 bash /r/$R_FILE" 2>&1)"; rc=$?
check "timed-out run -> exit 1" test "$rc" = 1
sleep 2
left="$(docker exec "$OFF" sh -c 'for p in /proc/[0-9]*; do tr "\0" " " < $p/cmdline 2>/dev/null; echo; done | grep -c "[c]ron event run"')"
check "timed-out run leaves no WP-CLI process in the container" test "$left" = 0

# --- 6. --install writes cron, logrotate and the dead-man registration ---
out="$(run "bash /r/$R_FILE --install >/dev/null 2>&1; echo NO_DIRS_RC=\$?; mkdir -p /etc/cron.d /etc/logrotate.d && bash /r/$R_FILE --install >/dev/null && cat /etc/cron.d/wp-cron-runner /etc/awarewave-alert/fresh.d/wp-cron-runner && test -s /etc/logrotate.d/wp-cron-runner && echo LR_OK" 2>&1)"
check "--install: every-minute cron line" has "$out" "* * * * * root /r/$R_FILE >> /var/log/wp-cron-runner.log"
check "--install: registration points at the heartbeat" has "$out" "/state/heartbeat 900 wp-cron-runner"
check "--install: logrotate" has "$out" "LR_OK"
check "--install without cron/logrotate dirs fails loudly" has "$out" "NO_DIRS_RC=1"

# --- 7. endpoint-alert.sh freshness check (no URLs, no channels) ---
alert() {  # <stamp age in seconds | missing> -> prints last_state
  docker run --rm --label aw-cron-test=1 -v "$A_DIR:/a:ro" -e CHECK_URLS=' ' -e FAIL_THRESHOLD=1 \
    -e STATE_DIR=/tmp/st -e FRESH_DIR=/tmp/fresh aw-cron-test-runner bash -c "
      mkdir -p /tmp/fresh; echo '/tmp/hb 900 wp-cron-runner' > /tmp/fresh/wp-cron-runner
      [ '$1' = missing ] || touch -d '-$1 seconds' /tmp/hb
      bash /a/$A_FILE >/dev/null 2>/tmp/err; echo \"rc=\$? state=\$(cat /tmp/st/last_state)\"; cat /tmp/err"
}
out="$(alert 60)";      check "fresh stamp -> ok" has "$out" "rc=0 state=ok"
out="$(alert 1000)";    check "stale stamp -> fail state" has "$out" "state=fail:"
check "stale stamp -> named in the journal" has "$out" "job wp-cron-runner stale"
out="$(alert missing)"; check "missing stamp -> fail state" has "$out" "state=fail:"

echo "---"; echo "wp-cron-runner: $pass passed, $failed failed"
[[ "$failed" == 0 ]]
