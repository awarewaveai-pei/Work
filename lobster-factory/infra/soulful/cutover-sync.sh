#!/usr/bin/env bash
# soulfulexpression.org — final incremental sync before origin cutover.
#
# THE INVARIANT THIS SCRIPT EXISTS TO HOLD:
#   No write may be accepted by the old host after the final dump begins, and no write
#   made before it may be lost. Everything else here is in service of that one sentence.
#
# Why an incremental sync is not optional: the bulk copy on the new host is a point in
# time. Every post, order, user registration, form entry and CRM contact created on the
# live site after that moment lives only on Hostinger. Cutting over without closing that
# gap creates DIVERGENCE, and divergence is the one failure mode a DNS rollback cannot
# repair — roll back and you lose whatever the new host accepted; stay and you lose
# whatever Hostinger accepted. So a window where writes reach neither host is opened
# deliberately, kept to minutes, and closed.
#
# WHAT THIS SCRIPT DOES AND DOES NOT TOUCH:
#   - It never touches DNS. The operator flips DNS afterwards.
#   - On success it deliberately LEAVES the live site frozen, so DNS is flipped against a
#     target verified equal seconds earlier.
#   - On failure it restores the live site AND restores the new host from a snapshot taken
#     before anything was modified. Both sides end where they started.
#
# Usage:
#   ./cutover-sync.sh --dry-run   rehearse every step except the freeze; live keeps serving
#   ./cutover-sync.sh --live      the real thing; opens the write freeze
#
# ---------------------------------------------------------------------------------------
# 2026-08-27 adversarial review found three defects that each produced the SAME outcome —
# the operator flips DNS believing writes were frozen when they were not — and none were
# detectable by the parity gate. All three are fixed below and each fix is commented at
# its site, because the reasons are not self-evident from the corrected code:
#   C1  .maintenance carried a BAKED timestamp; WordPress core ignores the file 600s later
#   C2  signal traps did not exit, so an aborted run continued to a "freeze is open" banner
#   C3  the freeze guard was set AFTER the ssh, so a half-successful freeze left the site
#       dark while the script reported it had never frozen
# ---------------------------------------------------------------------------------------
set -uo pipefail
# -e is deliberately omitted: every consequential command carries an explicit `|| fail` so
# that failures route through restore_service rather than bare-exiting past it. Do not
# "fix" this by adding -e without re-auditing every `grep -c` and `|| true` below.

umask 077   # evidence dir holds a full customer database and DB credentials

[[ $# -le 1 ]] || { echo "usage: $0 [--dry-run|--live|--rehearse-freeze]  (exactly one mode)"; exit 2; }
MODE="${1:---dry-run}"
case "$MODE" in
  --dry-run|--live|--rehearse-freeze) ;;
  *) echo "usage: $0 [--dry-run|--live|--rehearse-freeze]"; exit 2 ;;
esac

SSHK=/root/.ssh/soulful_pull
RHOST="u942075013@191.101.230.176"
RPORT=65002
RWP=/home/u942075013/domains/soulfulexpression.org/public_html
# M10: every emergency instruction is printed in BOTH forms. SSHK exists only on this
# box; an operator reading the output on their laptop and pasting it gets "no such
# identity file" at the exact moment the store is down. The laptop form is printed FIRST
# because that is where the human actually is.
UNFREEZE_LAPTOP="ssh -i ~/.ssh/hostinger_soulful -p ${RPORT} ${RHOST} 'rm -f ${RWP}/.maintenance'"
UNFREEZE_ONBOX="ssh -i ${SSHK} -p ${RPORT} ${RHOST} 'rm -f ${RWP}/.maintenance'"
# C2: the reviewed script and the RUNNING script are different files on different
# machines, and nothing linked them. A cutover weeks from now could execute a copy from
# before the C1 fix -- freeze silently expiring mid-DNS-flip -- with no detector at all.
# The version is logged into the banner AND the evidence file, and --require-version makes
# the runbook able to demand a specific one. Bump this on every behavioural change.
CUTOVER_SYNC_VERSION="2026-08-28-r8"
# Optional pin: the runbook exports this so a stale deployed copy refuses to run.
REQUIRE_VERSION="${REQUIRE_VERSION:-}"
SELF_SHA="$(sha256sum "$0" 2>/dev/null | cut -c1-12)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="/root/soulful-cutover/${STAMP}"
EVIDENCE="${WORK}/evidence.txt"
# Deliberately under WordPress core's old 600s expiry so behaviour stays comprehensible
# to anyone who remembers the C1 defect.
FREEZE_BUDGET_SEC="${FREEZE_BUDGET_SEC:-480}"
# Rehearsal deleted 698. Generous headroom, but a catastrophe (empty source) is not.
MAX_DELETE="${MAX_DELETE:-2000}"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
# Two helpers, deliberately: `-n` makes ssh re-open /dev/null as its stdin AT STARTUP,
# which WINS over any shell `< file` redirect -- so a single helper cannot be both safe
# and able to feed a script. The default (rssh) cannot consume the caller's stdin; a call
# that genuinely needs to pipe a script in must NAME that fact by using rssh_stdin with
# an explicit `< file`. Without this split, an rssh inside a heredoc-fed script eats the
# rest of the script -- observed twice on 2026-08-28: the smoke check's docker exec -i
# left a root-password file in the container, and a diagnostic heredoc silently lost its
# last three steps to an inner ssh.
rssh()       { timeout 300 ssh -n -i "$SSHK" -p "$RPORT" "${SSH_OPTS[@]}" "$RHOST" "$@"; }
rssh_stdin() { timeout 300 ssh    -i "$SSHK" -p "$RPORT" "${SSH_OPTS[@]}" "$RHOST" "$@"; }

mkdir -p "$WORK"
: > "$EVIDENCE"
log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$EVIDENCE"; }

# Only one cutover may run at a time. Two concurrent runs would rsync into the same volume
# and, worse, run B's restore_service would lift run A's freeze mid-dump.
exec 9>/var/lock/soulful-cutover.lock
flock -n 9 || { echo "another cutover-sync is already running"; exit 2; }

MAINTENANCE_ON=0
TARGET_SNAPSHOT=""
# Set before they are read so `set -u` cannot abort a cleanup handler that fires early.
SOULFUL_DB_NAME=""
SOULFUL_DB_ROOT_PASSWORD=""

# Defined ABOVE the traps on purpose: the cleanup handlers call these, and a signal
# arriving between trap installation and a later definition point would otherwise hit
# `command not found` in the one code path whose whole job is to recover cleanly.
DBCNF=/tmp/.soulful-cutover.cnf
setup_db_auth() {
  printf '[client]\nuser=root\npassword=%s\n' "$SOULFUL_DB_ROOT_PASSWORD" \
    | docker exec -i soulful-db sh -c "umask 077; cat > ${DBCNF}"
}
clear_db_auth() { docker exec -i soulful-db sh -c "rm -f ${DBCNF}" 2>/dev/null || true; }
ndb()  { docker exec -i soulful-db mariadb      --defaults-extra-file="$DBCNF" "$@"; }
ndump(){ docker exec -i soulful-db mariadb-dump --defaults-extra-file="$DBCNF" "$@"; }


restore_service() {
  # M2: ORDER MATTERS, and the first version of this had it backwards.
  # Restoring the DB "while the site is down helps nobody" is true of the SYMPTOM and
  # wrong about the sequence: starting the web tier first means WordPress boots against a
  # HALF-LOADED database and immediately writes to it (cron locks, transients, autoloaded
  # options) while zcat|ndb is still dropping and recreating every table underneath it --
  # exactly the race step 2 stops the container to avoid, performed by the recovery path.
  # Correct order: restore DB -> flush the cache keyed to the discarded DB -> start web.
  if [[ -n "$TARGET_SNAPSHOT" && -f "${TARGET_SNAPSHOT}/db.sql.gz" && "${DB_RESTORED:-0}" -eq 0 ]]; then
    DB_RESTORED=1        # m4: fail() calls this AND the EXIT trap calls it again
    log "--- restoring the NEW host database from its pre-freeze snapshot ---"
    setup_db_auth 2>/dev/null || true
    if zcat "${TARGET_SNAPSHOT}/db.sql.gz" | ndb "$SOULFUL_DB_NAME" 2>/dev/null; then
      log "    new host database restored to its pre-run state"
    else
      log "    !! new host DB restore FAILED - it is in a partial state."
      log "       recover from: ${TARGET_SNAPSHOT}/db.sql.gz"
    fi
    # The object cache still holds keys populated from the database that was just
    # discarded. Serving from it after a rollback is the same defect as serving from it
    # after a successful load, and the success path already flushes.
    if docker ps --format '{{.Names}}' | grep -qx soulful-redis; then
      docker exec soulful-redis redis-cli FLUSHALL >/dev/null 2>&1 \
        && log "    object cache flushed (it was keyed to the rolled-back database)" \
        || log "    !! could not flush the object cache after rollback - restart soulful-redis before serving"
    fi
  fi

  # ALWAYS put the web tier back, and always after the database is settled. Every failure
  # between step 2 and step 7 used to exit with soulful-wp stopped and never restarted, so
  # the new host served 502 to everything -- including every "must be green before
  # cutover" check in the runbook -- and nothing in the output mentioned docker start.
  if [[ "${WP_STOPPED:-0}" -eq 1 ]]; then
    log "--- restarting the target web tier (it was stopped by this run) ---"
    if docker start soulful-wp >/dev/null 2>&1; then
      WP_STOPPED=0
      log "    soulful-wp restarted"
    else
      log "    !! COULD NOT RESTART soulful-wp - the new host is serving 502. Run BY HAND:"
      log "       docker start soulful-wp"
    fi
  fi

  # NOTE, stated plainly rather than implied: only the DATABASE is rolled back. rsync has
  # already rewritten FILES in the volume and those are NOT restored, so after a failure
  # past step 4 the host holds live's file tree with this host's previous database. That
  # is fine for a dry run (the trees are converged) but is NOT a general rollback.

  [[ "$MAINTENANCE_ON" -eq 1 ]] || return 0
  # The manual command is printed BEFORE the attempt. If the attempt hangs or the
  # controlling terminal is already gone, the operator still has the instruction in the
  # evidence file rather than it being printed only after a call that never returned.
  log "--- restoring live site to service ---"
  log "    if the next lines do not report success, run BY HAND NOW:"
  log "    FROM YOUR LAPTOP: ${UNFREEZE_LAPTOP}"
  log "    on this box   : ${UNFREEZE_ONBOX}"
  local i
  for i in 1 2 3; do
    if timeout 30 ssh -i "$SSHK" -p "$RPORT" -o BatchMode=yes -o ConnectTimeout=10 \
         "$RHOST" "rm -f ${RWP}/.maintenance" 2>/dev/null; then
      log "    maintenance lifted (attempt ${i}); live site is serving again"
      MAINTENANCE_ON=0
      return 0
    fi
    log "    attempt ${i} failed; retrying"
    sleep 3
  done
  log "    !! COULD NOT LIFT MAINTENANCE AFTER 3 ATTEMPTS - the command above is not optional"
  MAINTENANCE_ON=0
}

fail() { log "FATAL: $*"; restore_service; exit 1; }

# C2: a trap handler that merely RETURNS hands control back to the next command, so an
# aborted run used to continue through the remaining steps and print a banner claiming the
# freeze was open moments after lifting it. Verified on bash 5.2: execution resumes past a
# returning trap. INT and TERM must therefore terminate. EXIT stays a plain handler so it
# can also run on a normal exit path.
# clear_db_auth is chained in so the staged credential never outlives the run, including
# on the abort paths. restore_service is idempotent, so the EXIT trap firing after a signal
# trap already ran is harmless.
cleanup_and_restore() { restore_service; clear_db_auth; }
trap cleanup_and_restore EXIT
trap 'log "interrupted (SIGINT)"; cleanup_and_restore; exit 130' INT
trap 'log "terminated (SIGTERM)"; cleanup_and_restore; exit 143' TERM
trap 'log "hangup (SIGHUP)";      cleanup_and_restore; exit 129' HUP

log "=== soulful cutover sync - mode=${MODE} stamp=${STAMP} ==="

# =========================================================================================
# --rehearse-freeze : exercise ONLY the freeze -> assert -> unfreeze path, then stop.
#
# --dry-run skips the freeze entirely, which means the single highest-risk sequence in the
# whole operation -- write .maintenance, prove the site is refusing requests, put it back --
# would otherwise execute for the very first time on cutover day, against a live store.
# This mode makes that path rehearsable on its own.
#
# IT DOES BRIEFLY TAKE THE LIVE SITE DOWN (a few seconds of 503). Run it in the same
# low-traffic window as the cutover itself, immediately before --live, not casually.
# =========================================================================================
if [[ "$MODE" == "--rehearse-freeze" ]]; then
  log "--- rehearsing the freeze path (the live site WILL 503 briefly) ---"
  before=$(rssh "curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'Host: soulfulexpression.org' -H 'Cache-Control: no-cache' http://127.0.0.1/wp-login.php" 2>/dev/null | tr -d '[:space:]')
  log "    before: HTTP ${before}"
  [[ "$before" == "200" ]] || fail "live is not serving 200 before the rehearsal (got '${before}') - not touching it"

  MAINTENANCE_ON=1
  rssh "printf '<?php \$upgrading = time(); ?>' > ${RWP}/.maintenance"     || fail "could not write .maintenance"
  during=$(rssh "curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'Host: soulfulexpression.org' -H 'Cache-Control: no-cache' http://127.0.0.1/wp-login.php" 2>/dev/null | tr -d '[:space:]')
  log "    during: HTTP ${during}"

  rssh "rm -f ${RWP}/.maintenance" || fail "COULD NOT UNFREEZE - run by hand NOW from your laptop: ${UNFREEZE_LAPTOP}"
  MAINTENANCE_ON=0
  after=$(rssh "curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'Host: soulfulexpression.org' -H 'Cache-Control: no-cache' http://127.0.0.1/wp-login.php" 2>/dev/null | tr -d '[:space:]')
  log "    after : HTTP ${after}"

  [[ "$during" == "503" ]] || fail "freeze did NOT take effect (during=${during}). The real cutover would abort here."
  [[ "$after"  == "200" ]] || fail "site did NOT come back (after=${after}) - INVESTIGATE NOW"
  log "=== freeze path verified: 200 -> 503 -> 200 ==="
  log "evidence: ${EVIDENCE}"
  trap - EXIT INT TERM HUP
  exit 0
fi

log "    version=${CUTOVER_SYNC_VERSION} sha256=${SELF_SHA} host=$(hostname)"
if [[ -n "${REQUIRE_VERSION}" && "${REQUIRE_VERSION}" != "${CUTOVER_SYNC_VERSION}" ]]; then
  fail "version mismatch: this copy is ${CUTOVER_SYNC_VERSION}, the runbook asked for ${REQUIRE_VERSION}. Redeploy before running."
fi

# =========================================================================================
# 0. PRE-FLIGHT. Everything that can be checked without costing downtime is checked here,
#    because every failure moved out of the freeze window is downtime not spent.
# =========================================================================================
log "--- 0. pre-flight ---"

# 0a. Credentials. Parsed, not sourced: `source` on a compose .env lets a value containing
#     $(...) or backticks EXECUTE AS ROOT, and a CRLF from a Windows edit silently appends
#     \r to the password. Validated here rather than at first use, which used to be after
#     the freeze and after rsync --delete had already run.
[[ -r /root/soulful/.env ]] || fail "/root/soulful/.env is unreadable"
while IFS='=' read -r k v; do
  case "$k" in
    SOULFUL_DB_NAME|SOULFUL_DB_ROOT_PASSWORD) printf -v "$k" '%s' "${v%$'\r'}" ;;
  esac
done < /root/soulful/.env
# Match docker-compose.yml's own default rather than diverging from it.
SOULFUL_DB_NAME="${SOULFUL_DB_NAME:-soulful}"
[[ -n "$SOULFUL_DB_ROOT_PASSWORD" ]] || fail "SOULFUL_DB_ROOT_PASSWORD missing from /root/soulful/.env"

# M10: passwords never appear in an argv that `ps` can read. On the shared host in
# particular, a co-tenant running `ps aux` would otherwise see the customer database
# credential in full.
#
# The defaults file must live INSIDE the container: `docker exec` runs mariadb in the
# container's own filesystem namespace, so a --defaults-extra-file path on the host simply
# does not exist for it. Caught by this section's own credential pre-check on the first
# run of the rewrite - which is exactly why that check exists and why it runs before the
# freeze rather than at first use.
#
# It is piped in over stdin rather than passed as an argument, so the password never
# reaches an argv on either side. `docker exec -e MYSQL_PWD=...` would have put it straight
# back into the host's process list.
setup_db_auth || fail "could not stage DB credentials inside soulful-db"

for c in soulful-db soulful-wp; do
  st=$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null || echo missing)
  log "    ${c}: ${st}"
  [[ "$st" == "healthy" ]] || fail "${c} is '${st}' - fix the target before freezing writes"
done

# Proves the credential works while the site is still up, instead of discovering it does
# not at step 4 with the site already dark.
ndb -e "USE \`${SOULFUL_DB_NAME}\`" >/dev/null 2>&1 \
  || fail "cannot authenticate to soulful-db with the .env credentials"
log "    soulful-db credentials verified"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  -H 'Host: soulfulexpression.org' -H 'X-Forwarded-Proto: https' http://127.0.0.1:8081/)
log "    new host serves: HTTP ${code}"
[[ "$code" == "200" ]] || fail "new host returns ${code}, not 200"

[[ -f "$SSHK" ]] || fail "${SSHK} is not a regular file (docker would silently bind-mount a directory)"
rssh 'echo ok' >/dev/null 2>&1 || fail "cannot reach the live host over SSH"
log "    live host reachable"

# M6: refuse to mirror an empty or relocated source. rsync --delete against a source that
# has vanished would faithfully mirror that emptiness onto the production volume. This repo
# has already lost 769 MB to a delete-scope bug once (see backup-ks-aw-01.sh).
srcn=$(rssh "ls -1 ${RWP} | wc -l" 2>/dev/null | tr -d '[:space:]')
log "    live site root holds ${srcn:-0} entries"
[[ "${srcn:-0}" -ge 15 ]] || fail "live root has only ${srcn:-0} entries - refusing to mirror it"

# M3b: WP-CLI installs a filter that DISABLES maintenance mode, so a host crontab running
# `wp cron event run` would keep writing straight through the freeze. Verified absent on
# this host 2026-08-27, but it is one crontab edit away from being present.
wpcron=$(rssh "crontab -l 2>/dev/null | grep -icE 'wp-cron|wp +cron|wp-cli' || true" 2>/dev/null | tr -d '[:space:]')
log "    live crontab WP-CLI/cron entries: ${wpcron:-0}"
[[ "${wpcron:-0}" -eq 0 ]] || fail "live crontab runs WP-CLI cron - it BYPASSES maintenance mode. Suspend it before cutover."

# M9: snapshot the target BEFORE anything is modified, so the header's promise that a
# failure leaves both sides where they started is actually true. Costs zero downtime here.
# M9: every image this run needs is pulled HERE, before anything is frozen. The rsync
# helper build previously sat AFTER the freeze while a comment claimed the opposite, and
# alpine:3.20 is a floating minor tag -- a retag invalidates the layer cache and its
# `apk add` then runs live, so an Alpine mirror blip could fail the build with the store
# already dark and the reason discarded.
log "--- 0a. warming container images (pre-freeze, so the freeze has no network dependency) ---"
if ! docker image inspect alpine:3.20 >/dev/null 2>&1; then
  docker pull -q alpine:3.20 >/dev/null 2>&1 \
    || fail "could not pull alpine:3.20 - refusing to start with an unmet image dependency"
fi
docker image inspect alpine:3.20 >/dev/null 2>&1 || fail "alpine:3.20 still absent after pull"
log "    alpine:3.20 present"

# M3: the rsync helper is built HERE, in pre-flight, NOT inside the freeze window. Two
# comments previously claimed this was already so while the build sat at step 4, after
# the freeze opens. `apk add` reaches the Alpine CDN, so a mirror blip would have failed
# the build with the store already dark. Output goes to the log the failure message
# names; it was previously discarded to /dev/null, pointing the operator at a file that
# never existed, at the worst possible moment. known_hosts is passed in at run time so
# the leg with WRITE access to the production volume never accepts arbitrary host keys.
docker build -q -t soulful-rsync:local -f - "${WORK}" >"${WORK}/helper-build.log" 2>&1 <<'DOCKERFILE'
FROM alpine:3.20
RUN apk add --no-cache rsync openssh-client
DOCKERFILE
[[ $? -eq 0 ]] || fail "could not build the rsync helper image: $(tail -3 "${WORK}/helper-build.log" 2>/dev/null | tr '\n' ' ')"
docker image inspect soulful-rsync:local >/dev/null 2>&1 \
  || fail "soulful-rsync:local absent after a successful build - refusing to enter the freeze"
log "    soulful-rsync:local built"

log "--- 0b. snapshotting the new host (pre-freeze, zero downtime) ---"
TARGET_SNAPSHOT="${WORK}/target-snapshot"
mkdir -p "$TARGET_SNAPSHOT"
ndump --single-transaction --quick "$SOULFUL_DB_NAME" 2>/dev/null | gzip > "${TARGET_SNAPSHOT}/db.sql.gz"
snapb=$(stat -c %s "${TARGET_SNAPSHOT}/db.sql.gz" 2>/dev/null || echo 0)
[[ "$snapb" -ge 1000000 ]] || fail "target snapshot is only ${snapb}B - refusing to proceed without a usable rollback"
log "    target DB snapshot: $(du -h "${TARGET_SNAPSHOT}/db.sql.gz" | cut -f1)"

# =========================================================================================
# 1. FREEZE WRITES.
# =========================================================================================
FREEZE_START=$(date +%s)
if [[ "$MODE" == "--live" ]]; then
  log "--- 1. freezing writes on the LIVE site ---"
  # C3: the guard is raised BEFORE the attempt. The remote `>` redirect creates the file
  # the instant the remote shell starts, so an ssh that dies mid-session can leave the site
  # frozen while reporting failure. With the flag already set, restore_service cleans up;
  # `rm -f` on a file that was never created costs nothing.
  MAINTENANCE_ON=1
  # C1: `time()`, NOT a baked timestamp. WordPress core's wp_is_maintenance_mode() ignores
  # .maintenance once (time() - $upgrading) >= 600, so a constant written here silently
  # expires ten minutes later - i.e. in the middle of flipping DNS and verifying - and
  # Hostinger quietly resumes accepting orders that will never reach the new host. Writing
  # the call itself makes the expression re-evaluate on every request, so it never expires.
  rssh "printf '<?php \$upgrading = time(); ?>' > ${RWP}/.maintenance" \
    || fail "could not enable maintenance mode (a .maintenance file MAY exist; the restore above clears it)"

  # Assert the freeze rather than assume it. One curl converts "we wrote a file" into
  # "the site is actually refusing writes".
  # Host header + an UNCACHEABLE path, both deliberate:
  #   - without -H Host, curl sends "Host: 127.0.0.1" and shared hosting answers from the
  #     DEFAULT vhost, which is not necessarily soulfulexpression.org. The assertion would
  #     then be about some other site.
  #   - "/" can be served straight from litespeed-cache via .htaccess LSCACHE rules without
  #     PHP ever running, so a cache hit returns 200 while .maintenance IS in force -> the
  #     script would fail, unfreeze, and abort a cutover that was actually working.
  #     wp-login.php is never cached.
  fc=$(rssh "curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'Host: soulfulexpression.org' -H 'Cache-Control: no-cache' http://127.0.0.1/wp-login.php" 2>/dev/null | tr -d '[:space:]')
  log "    live site now returns: HTTP ${fc}"
  [[ "$fc" == "503" ]] || fail "freeze did not take effect - live returned '${fc}', not 503"
  rssh "cat ${RWP}/.maintenance" 2>/dev/null | sed 's/^/    marker: /' | tee -a "$EVIDENCE"

  log ""
  log "    >>> THE LIVE SITE IS NOW DARK. To abandon at any point, run:"
  log "    >>>   FROM YOUR LAPTOP: ${UNFREEZE_LAPTOP}"
  log "    >>>   on this box   : ${UNFREEZE_ONBOX}"
  log ""
else
  log "--- 1. [dry-run] NOT freezing writes; live site keeps serving ---"
fi

# M7: stop the target's web tier. rsync is about to rewrite plugin and core files, and the
# reload is about to DROP and recreate all 288 tables, underneath a PHP process that is
# executing from exactly those files and querying exactly those tables. DNS has not flipped,
# so this container is serving nobody and there is no reason to accept the race.
log "--- 2. stopping the target web tier during the rewrite ---"
# M6: the guard is set BEFORE the stop, same pattern as MAINTENANCE_ON. A failure at any
# later step used to exit with soulful-wp still stopped and no instruction anywhere, so
# the new host served 502 to everything and the runbook's green checks all failed.
# M1: assert UNCONDITIONALLY. The first version gated the assertion on the stop's own
# exit code, so a genuinely FAILED stop (daemon hiccup, container wedged) set WP_STOPPED=0,
# skipped the check entirely, mislabelled it "was not running", and let the script rsync
# core files and DROP 288 tables underneath a live PHP process. Pre-flight already proved
# this container is healthy, so "stop returned non-zero" here means trouble, not absence.
docker stop soulful-wp >/dev/null 2>&1 || log "    docker stop returned non-zero"
wp_running=$(docker inspect -f '{{.State.Running}}' soulful-wp 2>/dev/null || echo missing)
[[ "$wp_running" == "false" || "$wp_running" == "missing" ]]   || fail "soulful-wp is STILL RUNNING after docker stop - refusing to rewrite files and DROP tables under it"
if [[ "$wp_running" == "false" ]]; then WP_STOPPED=1; log "    soulful-wp stopped"; else WP_STOPPED=0; log "    soulful-wp was not present"; fi

# =========================================================================================
# 3. FINAL DB DUMP, streamed - never lands on the Hostinger disk.
# =========================================================================================
# C4: DRAIN before dumping. `.maintenance` is evaluated once per request at bootstrap, so
# a request that passed wp_maintenance() microseconds BEFORE the file landed runs to
# completion and can commit AFTER mysqldump --single-transaction takes its snapshot. The
# 503 assertion at step 1 only proves NEW requests are refused; it says nothing about the
# ones already inside. A checkout POST sitting in a Stripe round trip is exactly this
# shape, and its completion writes are UPDATEs (order status pending->processing, stock
# decrement) that COUNT-based parity metrics cannot see. Waiting for the writers to finish
# turns "3 seconds is probably enough" into a measurement.
# Runs in BOTH modes. The PROCESSLIST query is read-only, so there is no reason for the
# dry run to skip it -- a drain path that only ever executes on cutover day is an
# unrehearsed path in the highest-risk minute of the whole operation. In --live it LOOPS
# until the writer count reaches zero and fails on timeout; in --dry-run it samples once
# and only reports, because the live site is still serving and would never reach zero.
log "--- 2b. in-flight writers on the live host ---"
cat > "${WORK}/remote-drain.sh" <<'REMOTE'
set -eu
WP=/home/u942075013/domains/soulfulexpression.org/public_html
CNF="$HOME/.soulful-drain.cnf"
trap 'rm -f "$CNF"' EXIT
DBP=$(sed -n "s/^define( *'DB_PASSWORD', *'\(.*\)' *);/\1/p" "$WP/wp-config.php")
[ -n "$DBP" ] || { echo "could not read DB_PASSWORD" >&2; exit 1; }
umask 077
printf '[client]\nuser=u942075013_d1TYk\npassword=%s\nhost=127.0.0.1\n' "$DBP" > "$CNF"
i=0
while [ "$i" -lt "$DRAIN_MAX" ]; do
  n=$(mysql --defaults-extra-file="$CNF" -N -B -e "
      SELECT COUNT(*) FROM information_schema.PROCESSLIST
       WHERE DB='u942075013_hDaEZ' AND COMMAND<>'Sleep' AND ID<>CONNECTION_ID()" 2>/dev/null || echo "")
  [ -n "$n" ] || { echo "DRAIN=unmeasurable - could not read PROCESSLIST" >&2; exit 1; }
  if [ "$n" -eq 0 ]; then echo "DRAIN=clear after ${i}s"; exit 0; fi
  i=$((i+1)); sleep 1
done
if [ "$DRAIN_GATE" = "1" ]; then
  echo "DRAIN=timeout with $n writer(s) still active" >&2
  exit 1
fi
echo "DRAIN=sampled ${n} active writer(s) (not gated in dry-run)"
exit 0
REMOTE
if [[ "$MODE" == "--live" ]]; then dmax=60; dgate=1; else dmax=1; dgate=0; fi
{ printf 'DRAIN_MAX=%s\nDRAIN_GATE=%s\n' "$dmax" "$dgate"; cat "${WORK}/remote-drain.sh"; } > "${WORK}/remote-drain-run.sh"
drain_out=$(rssh_stdin 'bash -s' < "${WORK}/remote-drain-run.sh" 2>"${WORK}/drain.err") \
  || fail "in-flight writer check failed: $(head -1 "${WORK}/drain.err" 2>/dev/null) ${drain_out}"
log "    ${drain_out}"

log "--- 3. final DB dump ---"
cat > "${WORK}/remote-dump.sh" <<'REMOTE'
set -eu
WP=/home/u942075013/domains/soulfulexpression.org/public_html
CNF="$HOME/.soulful-dump.cnf"
trap 'rm -f "$CNF"' EXIT
DBP=$(sed -n "s/^define( *'DB_PASSWORD', *'\(.*\)' *);/\1/p" "$WP/wp-config.php")
[ -n "$DBP" ] || { echo "could not read DB_PASSWORD" >&2; exit 1; }
umask 077
printf '[client]\nuser=u942075013_d1TYk\npassword=%s\nhost=127.0.0.1\n' "$DBP" > "$CNF"
mysqldump --defaults-extra-file="$CNF" \
  --single-transaction --quick --default-character-set=utf8mb4 \
  --routines --triggers --events u942075013_hDaEZ
REMOTE
rssh_stdin 'bash -s' < "${WORK}/remote-dump.sh" 2>"${WORK}/dump.err" | gzip > "${WORK}/final-db.sql.gz"
DUMP_RC="${PIPESTATUS[0]}"
[[ "$DUMP_RC" -eq 0 ]] || fail "remote dump exited ${DUMP_RC}: $(head -2 "${WORK}/dump.err" 2>/dev/null)"

# Content verification, not format verification. A 20-byte valid gzip and a 4 KB gzip of a
# PHP backtrace both pass 'gzip -t'; this pipeline has produced both.
SZ=$(stat -c %s "${WORK}/final-db.sql.gz")
TBL=$(zcat "${WORK}/final-db.sql.gz" | grep -c '^CREATE TABLE' || true)
TRAILER=$(zcat "${WORK}/final-db.sql.gz" | tail -3 | grep -c 'Dump completed' || true)
log "    ${SZ} bytes, ${TBL} tables, completion trailer=${TRAILER}"
[[ "$SZ" -ge 5000000 ]] || fail "dump is ${SZ}B - far below the ~15MB this database produces"
[[ "$TBL" -ge 250 ]]    || fail "only ${TBL} CREATE TABLE statements, expected ~288"
[[ "$TRAILER" -ge 1 ]]  || fail "no mysqldump completion trailer - the dump was truncated"

# =========================================================================================
# 4. FILES DELTA.
# =========================================================================================
log "--- 4. files delta ---"
# The exclude list was derived from a real tree diff after the 2026-08-27 rehearsal, not
# guessed. Two categories came back, both benign once explained: files present only on live
# (all runtime logs, enumerated below rather than matched by a bare *.log wildcard, which
# rsync applies to the FINAL PATH COMPONENT at any depth and would therefore also drop a
# customer-uploaded report.log from wp-content/uploads), and files present only on the new
# host, all plugin caches keyed to a hostname.
#
# --exclude '.maintenance' is load-bearing: without it the freeze marker rides along into
# the target volume and the site keeps returning 503 AFTER a successful cutover, with the
# cause in a dotfile nobody thinks to look for.
# --exclude 'wp-config.php' likewise: the live one points at Hostinger's database.
docker run --rm -v soulful_wordpress_data:/dest -v "${WORK}":/work alpine:3.20 \
  sh -c 'cp -a /dest/wp-config.php /work/wp-config.keep' \
  || fail "could not preserve the new host's wp-config.php"


# M7: the exclude list is defined ONCE as an array and used by BOTH passes below. Two
# hand-maintained copies of a list like this drift, and a dry pass that excludes less than
# the real pass reports deletions that would never actually happen (or worse, the reverse).
RSYNC_EXCL=(
  --exclude '.maintenance'
  --exclude 'wp-config.php'
  --exclude 'wp-content/object-cache.php'
  --exclude 'wp-content/plugins/redis-cache/'
  # live has no advanced-cache.php TODAY (verified 2026-08-28), but litespeed-cache is
  # active there and can write one at any moment; wp-config here has WP_CACHE=true, so
  # a mirrored-in copy WOULD be loaded. Insurance, one line.
  --exclude 'wp-content/advanced-cache.php'
  --exclude 'wp-content/cache/'
  --exclude 'wp-content/plugins/*/cache/'
  --exclude 'wp-content/uploads/wc-logs/'
  --exclude 'wp-content/uploads/cartflows-logs/'
  --exclude 'wp-content/uploads/astra-sites/'
  --exclude 'wp-content/uploads/ai-builder/'
  --exclude 'wp-content/uploads/astra-sites-import-*'
)
RSYNC_SSH="ssh -i /key -p ${RPORT} -o UserKnownHostsFile=/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=20"
rsync_run() {
  docker run --rm \
    -v soulful_wordpress_data:/dest \
    -v "${SSHK}":/key:ro \
    -v /root/.ssh/known_hosts:/known_hosts:ro \
    -v "${WORK}":/work \
    soulful-rsync:local \
    rsync "$@" --delete --stats "${RSYNC_EXCL[@]}" \
      -e "$RSYNC_SSH" "${RHOST}:${RWP}/" /dest/
}

# M7: --max-delete stops rsync AT the limit - i.e. AFTER up to MAX_DELETE files are already
# gone from the production volume - and restore_service rolls back only the database, never
# files. A dry pass first turns "delete 2000 files, then abort" into "abort before touching
# anything". It costs about a second on a converged tree.
rsync_run -n -a >"${WORK}/rsync-dry.log" 2>&1 || true
PLANNED_DEL=$(sed -n 's/^Number of deleted files: *\([0-9,]*\).*/\1/p' "${WORK}/rsync-dry.log" | tr -d ',' | head -1)
if [[ -z "${PLANNED_DEL:-}" ]]; then
  fail "could not read a deletion count from the rsync dry pass - refusing to mirror blind: $(tail -2 "${WORK}/rsync-dry.log" 2>/dev/null | tr '\n' ' ')"
fi
log "    dry pass: ${PLANNED_DEL} deletion(s) planned (limit ${MAX_DELETE})"
if [[ "$PLANNED_DEL" -gt "$MAX_DELETE" ]]; then
  fail "rsync would delete ${PLANNED_DEL} files, over the ${MAX_DELETE} limit - the source looks wrong. NOTHING was changed."
fi

rsync_run -a --max-delete="${MAX_DELETE}" >"${WORK}/rsync.log" 2>&1
RC=$?
grep -E 'Number of (created|deleted|regular)' "${WORK}/rsync.log" | sed 's/^/    /' | tee -a "$EVIDENCE"
if [[ $RC -eq 25 ]]; then
  fail "rsync hit --max-delete=${MAX_DELETE} - the source looks wrong, NOT mirroring it"
fi
[[ $RC -eq 0 ]] || fail "rsync exited ${RC} (see ${WORK}/rsync.log)"

docker run --rm -v soulful_wordpress_data:/dest -v "${WORK}":/work alpine:3.20 \
  sh -c 'cp -a /work/wp-config.keep /dest/wp-config.php' \
  || fail "could not restore the new host's wp-config.php"

# M8: this used to be the only unguarded command, and its log line asserted success
# unconditionally. rsync as root without --numeric-ids writes files owned by Hostinger's
# UID, which Apache still READS fine - so all smoke checks pass and the damage only appears
# later as failed uploads and failed plugin updates. Assert, do not claim.
# -h so symlinks are changed themselves rather than dereferenced; without it a symlink
# inode keeps Hostinger's UID while chown still exits 0.
docker run --rm -v soulful_wordpress_data:/dest alpine:3.20 \
  sh -c 'chown -Rh 33:33 /dest && rm -f /dest/.maintenance' \
  || fail "could not normalise ownership"

# `-user`, NOT `-uid`. alpine ships BusyBox find, which has no -uid predicate at all:
# "find: unrecognized: -uid", exit 1, message on STDERR. The previous version sent that
# stderr to /dev/null and read only stdout, so $badown was ALWAYS empty, the guard could
# never fail, and the log line below wrote "ownership verified" into the evidence file as
# a fact that had never been checked. Verified against alpine:3.20 on ks-aw-01 2026-08-27.
# The exit code and stderr are now both checked: a check that cannot report its own
# failure is not a check, which is the entire reason this block exists (see M8 above).
ownck_err="${WORK}/ownership-check.err"
if ! badown=$(docker run --rm -v soulful_wordpress_data:/dest alpine:3.20 \
     sh -c 'find /dest ! -user 33 -print -quit' 2>"$ownck_err"); then
  fail "ownership check could not run: $(head -1 "$ownck_err" 2>/dev/null)"
fi
if [[ -s "$ownck_err" ]]; then
  fail "ownership check wrote to stderr (treating as unverified): $(head -1 "$ownck_err")"
fi
[[ -z "$badown" ]] || fail "ownership not normalised (example: ${badown})"
log "    ownership verified as www-data (uid 33) - checked, not assumed; .maintenance cleared"

# =========================================================================================
# 5. LOAD THE FINAL DUMP.
# =========================================================================================
log "--- 5. loading final DB into the new host ---"
if ! zcat "${WORK}/final-db.sql.gz" | ndb "$SOULFUL_DB_NAME" 2>"${WORK}/load.err"; then
  fail "DB load failed: $(head -2 "${WORK}/load.err" 2>/dev/null)"
fi
log "    loaded"

# The object cache holds entries keyed to the database that was here a moment ago, and
# that database has just been REPLACED wholesale. Serving from it after the swap means
# handing visitors values that no longer exist in the DB -- stale prices, stale stock,
# stale options -- with nothing to indicate anything is wrong. Flushed here, after the
# load and before the web tier restarts, so no request can observe the mixed state.
if docker ps --format '{{.Names}}' | grep -qx soulful-redis; then
  if docker exec soulful-redis redis-cli FLUSHALL >/dev/null 2>&1; then
    log "    object cache flushed (it was keyed to the database just replaced)"
  else
    fail "could not flush the object cache - refusing to serve a cache keyed to the old DB"
  fi
else
  log "    no soulful-redis container; no object cache to flush"
fi

# =========================================================================================
# 6. PARITY GATE.
# =========================================================================================
log "--- 6. parity check (live vs new) ---"
cat > "${WORK}/remote-counts.sh" <<'REMOTE'
set -eu
WP=/home/u942075013/domains/soulfulexpression.org/public_html
CNF="$HOME/.soulful-count.cnf"
trap 'rm -f "$CNF"' EXIT
DBP=$(sed -n "s/^define( *'DB_PASSWORD', *'\(.*\)' *);/\1/p" "$WP/wp-config.php")
umask 077
printf '[client]\nuser=u942075013_d1TYk\npassword=%s\nhost=127.0.0.1\n' "$DBP" > "$CNF"
q(){ mysql --defaults-extra-file="$CNF" -N u942075013_hDaEZ -e "$1"; }
echo "tables=$(q 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()')"
echo "posts=$(q 'SELECT COUNT(*) FROM wp_posts')"
echo "published=$(q "SELECT COUNT(*) FROM wp_posts WHERE post_status='publish'")"
echo "lastmod=$(q "SELECT COALESCE(MAX(post_modified_gmt),'-') FROM wp_posts")"
echo "postmeta=$(q 'SELECT COUNT(*) FROM wp_postmeta')"
echo "options=$(q 'SELECT COUNT(*) FROM wp_options')"
echo "users=$(q 'SELECT COUNT(*) FROM wp_users')"
echo "usermeta=$(q 'SELECT COUNT(*) FROM wp_usermeta')"
echo "attach=$(q "SELECT COUNT(*) FROM wp_posts WHERE post_type='attachment'")"
echo "orders_hpos=$(q 'SELECT COUNT(*) FROM wp_wc_orders')"
echo "orders_posts=$(q "SELECT COUNT(*) FROM wp_posts WHERE post_type LIKE 'shop_order%'")"
echo "orderitems=$(q 'SELECT COUNT(*) FROM wp_woocommerce_order_items')"
echo "comments=$(q 'SELECT COUNT(*) FROM wp_comments')"
echo "scheduler=$(q 'SELECT COUNT(*) FROM wp_actionscheduler_actions')"
REMOTE
LIVE=$(rssh_stdin 'bash -s' < "${WORK}/remote-counts.sh" 2>"${WORK}/counts.err")
[[ -n "$LIVE" ]] || log "    !! live counts came back EMPTY: $(head -2 "${WORK}/counts.err" 2>/dev/null)"

MISMATCH=0
printf "    %-13s %22s %22s\n" METRIC LIVE NEW | tee -a "$EVIDENCE"
check_metric() {
  local key="$1" sql="$2" lv nv mark=""
  lv=$(echo "$LIVE" | sed -n "s/^${key}=//p")
  nv=$(ndb -N "$SOULFUL_DB_NAME" -e "$sql" 2>/dev/null)
  # M1: unmeasurable is NOT agreement. Both sides empty used to compare equal and pass the
  # gate silently - "the detector went quiet" wearing the costume of "everything matches".
  if [[ -z "$lv" || -z "$nv" ]]; then
    mark="  <-- UNMEASURABLE"; MISMATCH=1
  elif [[ "$lv" != "$nv" ]]; then
    mark="  <-- MISMATCH"; MISMATCH=1
  fi
  printf "    %-13s %22s %22s%s\n" "$key" "${lv:-<empty>}" "${nv:-<empty>}" "$mark" | tee -a "$EVIDENCE"
}
check_metric tables       'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()'
check_metric posts        'SELECT COUNT(*) FROM wp_posts'
check_metric published    "SELECT COUNT(*) FROM wp_posts WHERE post_status='publish'"
# COUNT(*) cannot see an EDIT - a revised post, a changed price, an order moving from
# processing to completed. MAX(post_modified_gmt) converts the gate from "same number of
# rows" into "same latest write", which is what the invariant at the top actually claims.
check_metric lastmod      "SELECT COALESCE(MAX(post_modified_gmt),'-') FROM wp_posts"
check_metric postmeta     'SELECT COUNT(*) FROM wp_postmeta'
check_metric options      'SELECT COUNT(*) FROM wp_options'
check_metric users        'SELECT COUNT(*) FROM wp_users'
check_metric usermeta     'SELECT COUNT(*) FROM wp_usermeta'
check_metric attach       "SELECT COUNT(*) FROM wp_posts WHERE post_type='attachment'"
# Both order homes are checked. HPOS is enabled on this site and both were 0 on 2026-08-27
# (a store with no orders yet), but a metric that reads the wrong table would sit at 0=0
# forever - including on the day it matters.
check_metric orders_hpos  'SELECT COUNT(*) FROM wp_wc_orders'
check_metric orders_posts "SELECT COUNT(*) FROM wp_posts WHERE post_type LIKE 'shop_order%'"
check_metric orderitems   'SELECT COUNT(*) FROM wp_woocommerce_order_items'
check_metric comments     'SELECT COUNT(*) FROM wp_comments'
check_metric scheduler    'SELECT COUNT(*) FROM wp_actionscheduler_actions'

# -----------------------------------------------------------------------------------------
# ALL-TABLE comparison. The 14 metrics above are a human-readable summary, NOT the gate.
#
# Hand-picked metrics can only catch what someone thought of. This site runs FluentCRM
# (wp_fc_subscribers, wp_fc_campaign_*), UltimateMember (wp_um_metadata) and WooCommerce
# HPOS (wp_wc_orders_meta, wp_wc_order_stats, wp_wc_order_addresses,
# wp_woocommerce_order_itemmeta, wp_wc_product_meta_lookup) -- a newsletter signup or a
# profile edit touches NONE of the 14, so the gate was structurally blind to entire
# subsystems that the runbook itself names as permanently-lost-on-divergence.
#
# This enumerates every BASE TABLE on both sides and compares row counts, so a table
# nobody listed is still covered. One UNION ALL per side = one round trip, ~1s on a 15MB
# database, which is affordable inside the freeze window.
# -----------------------------------------------------------------------------------------
log "    -- all-table row-count comparison --"
cat > "${WORK}/remote-alltables.sh" <<'REMOTE'
set -eu
WP=/home/u942075013/domains/soulfulexpression.org/public_html
CNF="$HOME/.soulful-all.cnf"
trap 'rm -f "$CNF"' EXIT
DBP=$(sed -n "s/^define( *'DB_PASSWORD', *'\(.*\)' *);/\1/p" "$WP/wp-config.php")
umask 077
printf '[client]
user=u942075013_d1TYk
password=%s
host=127.0.0.1
' "$DBP" > "$CNF"
q(){ mysql --defaults-extra-file="$CNF" -N u942075013_hDaEZ -e "$1"; }
BT=$(printf '\140')
tl=$(q "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name")
sql=""
for t in $tl; do
  sql="${sql}${sql:+ UNION ALL }SELECT '${t}' t, COUNT(*) c FROM ${BT}${t}${BT}"
done
[ -n "$sql" ] || { echo "no tables found" >&2; exit 1; }
q "$sql"
REMOTE
rssh_stdin 'bash -s' < "${WORK}/remote-alltables.sh" 2>"${WORK}/alltables.err"   | sort > "${WORK}/live-alltables.tsv" || true
LIVE_TBL_N=$(wc -l < "${WORK}/live-alltables.tsv")

# Same enumeration on the new host.
NBT=$(printf '\140')
ntl=$(ndb -N "$SOULFUL_DB_NAME" -e "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name" 2>/dev/null)
nsql=""
for t in $ntl; do
  nsql="${nsql}${nsql:+ UNION ALL }SELECT '${t}' t, COUNT(*) c FROM ${NBT}${t}${NBT}"
done
if [[ -n "$nsql" ]]; then
  ndb -N "$SOULFUL_DB_NAME" -e "$nsql" 2>/dev/null | sort > "${WORK}/new-alltables.tsv" || true
else
  : > "${WORK}/new-alltables.tsv"
fi
NEW_TBL_N=$(wc -l < "${WORK}/new-alltables.tsv")

# Unmeasurable is not agreement (same rule as check_metric): two empty files would diff
# clean and pass the gate silently.
if [[ "$LIVE_TBL_N" -lt 250 || "$NEW_TBL_N" -lt 250 ]]; then
  log "    all-table compare UNMEASURABLE: live=${LIVE_TBL_N} new=${NEW_TBL_N} rows (expected ~288)"
  log "       $(head -1 "${WORK}/alltables.err" 2>/dev/null)"
  MISMATCH=1
else
  if diff -q "${WORK}/live-alltables.tsv" "${WORK}/new-alltables.tsv" >/dev/null 2>&1; then
    log "    all ${LIVE_TBL_N} tables match on row count"
  else
    log "    !! ALL-TABLE MISMATCH (live=${LIVE_TBL_N} new=${NEW_TBL_N}); differing rows:"
    diff "${WORK}/live-alltables.tsv" "${WORK}/new-alltables.tsv" 2>/dev/null       | grep -E '^[<>]' | head -25 | sed 's/^/       /' | tee -a "$EVIDENCE"
    MISMATCH=1
  fi
fi

if [[ "$MODE" == "--dry-run" ]]; then
  log "    [dry-run] mismatches here are EXPECTED - live kept accepting writes throughout."
  log "              This rehearsal proves every step RUNS, not that the two databases are"
  log "              equal. Only --live can prove that."
elif [[ "$MISMATCH" -eq 1 ]]; then
  fail "parity gate FAILED under a write freeze - not cutting over"
fi

# =========================================================================================
# 7. RESTART THE WEB TIER.
#
# Deliberately AFTER the parity gate. WordPress writes options the moment it boots (cron
# locks, transients), so measuring a database that has already served a request compares
# live against live+WordPress-startup. Rehearsal showed exactly that: options 1521 vs 1523,
# a pure false positive that in --live mode would have failed the gate and aborted the
# cutover with the site already frozen. Measure first, then start.
# =========================================================================================
log "--- 7. restarting the target web tier ---"
docker start soulful-wp >/dev/null 2>&1 || fail "could not restart soulful-wp"
for _ in $(seq 1 40); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' soulful-wp 2>/dev/null)" == "healthy" ]] && break
  sleep 3
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' soulful-wp 2>/dev/null)" == "healthy" ]] \
  || fail "soulful-wp did not return to healthy after the reload"
log "    soulful-wp healthy again"

# 7b. PLUGIN-STATE RECONCILIATION. The DB load replaced wp_options wholesale, and
# live's active_plugins has litespeed-cache ACTIVE (its cache layer is inert on
# nginx+Apache but its PHP side still runs, and it wants to own object-cache.php /
# advanced-cache.php) and redis-cache ABSENT (an "inactive" plugin invites a routine
# wp-admin cleanup that deletes the directory; the drop-in then survives only because
# phpredis is compiled in -- one rebuilt image away from a white screen). Reconciled
# HERE, every run, because every DB load resets it: a one-time manual fix would be
# silently undone by the next sync. DNS has not flipped, so no visitor sees the window.
# UPDATEs only -- row counts unchanged, so the parity gate above is not disturbed.
log "--- 7b. reconciling plugin state (DB load reset it to live's) ---"
docker exec soulful-wp wp --allow-root plugin deactivate litespeed-cache >/dev/null 2>&1 \
  && log "    litespeed-cache deactivated (inert cache layer, PHP side was still running)" \
  || log "    litespeed-cache already inactive or absent"
docker exec soulful-wp wp --allow-root plugin activate redis-cache >/dev/null 2>&1 \
  && log "    redis-cache activated (drop-in was already serving; this makes wp-admin agree)" \
  || fail "could not activate redis-cache - the object cache would show as deletable-inactive"

# =========================================================================================
# 8. SMOKE - through nginx and TLS, the way a visitor actually arrives.
# =========================================================================================
log "--- 8. smoke (via nginx + TLS, not the container port) ---"
CJK='/insights/general/%E6%84%9F%E6%81%A9%E6%97%A5%E8%A8%98%E6%94%B9%E8%AE%8A%E4%BA%BA%E7%94%9F%E7%9A%84%E4%BA%94%E5%88%86%E9%90%98%E7%BF%92%E6%85%A3/'
for p in / /wp-login.php /shop/ "$CJK"; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
      --resolve "soulfulexpression.org:443:127.0.0.1" "https://soulfulexpression.org${p}")
  log "    $(echo "$p" | cut -c1-40) -> ${c}"
  [[ "$c" == "200" ]] || fail "${p} returned ${c} after the sync"
done

FREEZE_LEN=$(( $(date +%s) - FREEZE_START ))
log "=== sync complete in ${FREEZE_LEN}s ==="

if [[ "$MODE" == "--dry-run" ]]; then
  log ""
  log "DRY RUN COMPLETE. The live site was never frozen."
  log "A real run would have held the write freeze for roughly ${FREEZE_LEN}s."
  exit 0
fi

if [[ "$FREEZE_LEN" -gt "$FREEZE_BUDGET_SEC" ]]; then
  log "    !! freeze ran ${FREEZE_LEN}s, over the ${FREEZE_BUDGET_SEC}s budget - proceed only if that is acceptable"
fi

# From here the freeze is intentional, not a failure state, so the traps are disarmed.
# The credential is still cleared: only the RESTORE is unwanted on this path.
clear_db_auth
trap - EXIT INT TERM HUP
log ""
# M12: re-measure immediately before asserting. The only 503 check happened at step 1,
# roughly a minute and six steps ago, and EVERYTHING downstream -- the DNS flip, the
# verification, the decision not to unfreeze -- rests on the freeze still being in force.
# An expired or manually-cleared marker here means the operator is about to flip DNS
# believing writes are stopped when they are not.
if [[ "$MAINTENANCE_ON" -eq 1 ]]; then
  fc2=$(rssh "curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'Host: soulfulexpression.org' -H 'Cache-Control: no-cache' http://127.0.0.1/wp-login.php" 2>/dev/null | tr -d '[:space:]')
  if [[ "$fc2" != "503" ]]; then
    log "############################################################"
    log "# !! THE FREEZE IS NOT IN FORCE ANY MORE (live returned '${fc2}', not 503)."
    log "# DO NOT FLIP DNS. Writes may have been accepted since the dump, which means"
    log "# the two databases may already differ and this run's parity result is stale."
    log "# Re-run this script from the start once you know why the marker went away."
    log "############################################################"
    log "evidence: ${EVIDENCE}"
    exit 1
  fi
  log "    freeze re-confirmed in force (HTTP ${fc2}) immediately before the banner"
  log "############################################################"
  log "# WRITE FREEZE IS OPEN - the live site is returning 503."
  log "# The new host is verified equal to it as of ${STAMP}."
  log "#"
  log "# Flip DNS now (CUTOVER_RUNBOOK.md), then confirm:"
  log "#   curl -sSI https://soulfulexpression.org/ | head -1"
  log "#"
  log "# To ABANDON instead, put the live site straight back:"
  log "#   FROM YOUR LAPTOP: ${UNFREEZE_LAPTOP}"
  log "#   on this box   : ${UNFREEZE_ONBOX}"
  log "############################################################"
else
  # The banner used to be an unconditional string, so an aborted-then-continued run printed
  # "the freeze is open" moments after lifting it. It is now gated on the actual state.
  log "############################################################"
  log "# NOTE: the write freeze is NOT open (it was lifted during this run)."
  log "# DO NOT flip DNS on the strength of this run - the live site has been"
  log "# accepting writes and the two sides may already have diverged."
  log "############################################################"
fi
log "evidence: ${EVIDENCE}"
