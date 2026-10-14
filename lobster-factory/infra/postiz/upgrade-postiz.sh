#!/usr/bin/env bash
# upgrade-postiz.sh -- upgrade the RUNNING Postiz stack on ks-aw-01 to a copy of lobster-factory/infra/postiz/ (upgrade
# only: it backs up and rolls back to what runs). safe-infra-patch.sh covers /root/lobster-phase1 only, so this
# /root/postiz project gets the same discipline here:
#   preflight -> backup -> schema gate -> apply -> health gate; any failure -> rollback (the database too once a schema
#   push was attempted) -> the same health gate on the old version. A rollback that cannot get the old version healthy
#   exits 3 and pages through endpoint-alert (a fresh.d registration whose stamp is at epoch 0).
# Invariants: one run at a time (flock); a rollback runs once, in the main shell, and no signal stops it; no upgrade
# while posts wait in the old queue (neither direction keeps exactly-once); the copy a rehearsal runs on can touch no
# prod path (every path below is overridable). rehearse-postiz-upgrade.sh runs this file on a throwaway copy first.
# Run it detached so an SSH drop cannot end it:  systemd-run --unit=postiz-upgrade --collect bash upgrade-postiz.sh <dir>
#
# Usage (root): bash upgrade-postiz.sh <dir with docker-compose.yml, dynamicconfig/, postiz-boot/, expected-data-loss.txt>
# Env, for the rehearsal: POSTIZ_DIR COMPOSE_PROJECT POSTIZ_CONTAINER TEMPORAL_CONTAINER DB_CONTAINER DB_SUPERUSER DB_NAME
#   DB_NETWORK BACKUP_ROOT UPGRADE_LOG LOCK_FILE FRESH_REGISTRATION ALERT(1=page on a failed rollback) HEALTH_TIMEOUT
#   ROLLBACK_HEALTH_TIMEOUT API_KEY_FILE
# -E: without it a failure inside a function exits under -e WITHOUT the ERR trap, i.e. no rollback.
set -Eeuo pipefail
umask 077

SRC="${1:?usage: upgrade-postiz.sh <dir with docker-compose.yml, dynamicconfig/, postiz-boot/, expected-data-loss.txt>}"
DEST="${POSTIZ_DIR:-/root/postiz}"
PROJECT="${COMPOSE_PROJECT:-postiz}"
APP="${POSTIZ_CONTAINER:-postiz}"
TEMPORAL="${TEMPORAL_CONTAINER:-temporal}"
DB="${DB_CONTAINER:-supabase-db}"
DB_SU="${DB_SUPERUSER:-supabase_admin}"
DB_NAME="${DB_NAME:-postiz}"
DB_NET="${DB_NETWORK:-supabase_default}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-600}"
ROLLBACK_HEALTH_TIMEOUT="${ROLLBACK_HEALTH_TIMEOUT:-600}"
ALERT="${ALERT:-1}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BK="${BACKUP_ROOT:-/root/postiz-upgrade-backups}/${STAMP}"
LOG="${UPGRADE_LOG:-/var/log/postiz-upgrade.log}"
FRESH="${FRESH_REGISTRATION:-/etc/awarewave-alert/fresh.d/postiz-upgrade}"
PAGE_STAMP="${FRESH}.stamp-file"
PRISMA_PUSH='cd /app && pnpm dlx prisma@6.5.0 db push --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma --skip-generate'
COPIED=(docker-compose.yml dynamicconfig postiz-boot)  # what this directory owns in $DEST; restored as a set
PUSHED=0
IN_ROLLBACK=0

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }
compose() { docker compose -p "$PROJECT" -f "$DEST/docker-compose.yml" --env-file "$DEST/.env" "$@"; }
psql_su() { docker exec -i "$DB" psql -U "$DB_SU" -v ON_ERROR_STOP=1 -At "$@"; }
# The whole schema (columns, defaults, enums, indexes, constraints), to check a restore brought it back exactly.
schema_fp() { docker exec "$DB" pg_dump -U "$DB_SU" -s "$DB_NAME" | grep -v '^\\\(un\)\?restrict ' | md5sum | cut -d' ' -f1; }
# temporal CLI against this stack's frontend (flags after the subcommand, the form every call here uses).
tcli() { docker exec "$TEMPORAL" temporal "$@" --namespace default --address "$TEMPORAL:7233"; }
# Channels as the sender sees them: what stops a post is disabled, refreshNeeded or inBetweenSteps.
channels() { psql_su -d "$DB_NAME" -c "SELECT id || ' ' || disabled || ' ' || \"refreshNeeded\" || ' ' || \"inBetweenSteps\" FROM \"Integration\" WHERE \"deletedAt\" IS NULL ORDER BY id"; }
# The postiz service of a compose file as comparable lines: env KEY=VALUE, ports, volume targets. Fails when empty.
service_lines() {
  docker compose -f "$1" --env-file "$DEST/.env" config --format json | python3 -c '
import json, sys
s = json.load(sys.stdin)["services"]["postiz"]
out = ["env %s=%s" % kv for kv in s.get("environment", {}).items()]
out += ["port %s:%s->%s" % (p.get("host_ip", ""), p.get("published", ""), p.get("target")) for p in s.get("ports", [])]
out += ["volume %s" % v["target"] for v in s.get("volumes", [])]
if not out:
    sys.exit("no postiz service lines")
print("\n".join(sorted(out)))'
}
compose_env() {  # compose_env <compose file> <VAR>: the postiz service's value after interpolation (one source: the file)
  docker compose -f "$1" --env-file "$DEST/.env" config --format json \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["postiz"]["environment"].get(sys.argv[1], ""))' "$2"
}
# HTTP from inside the app container (no host port needed; the rehearsal publishes none). Prints "<status>\n<body>".
api() {
  docker exec -e POSTIZ_API_KEY "$APP" node -e '
    const h = process.argv[2] === "keyed" ? { Authorization: process.env.POSTIZ_API_KEY } : {};
    fetch(process.argv[1], { headers: h, signal: AbortSignal.timeout(10000) })
      .then(async (r) => console.log(r.status + "\n" + (await r.text())))
      .catch(() => console.log("000"));' "$1" "${2:-}" 2>/dev/null || echo 000
}
page() {  # a registration whose stamp is at epoch 0: endpoint-alert sends the alert within minutes (B5 mechanism)
  [[ "$ALERT" == 1 ]] || return 0
  mkdir -p "$(dirname "$FRESH")"
  touch -d @0 "$PAGE_STAMP"
  echo "$PAGE_STAMP 60 postiz-upgrade-rollback-failed" > "$FRESH"
  log "PAGED | $FRESH registered (stamp at epoch 0)"
}

# health new|old <seconds>: every check passes in one round. new = Temporal ready with Postiz's search attributes, a
# worker polling the main queue, the backend's missing-post workflow running. Both = all pm2 apps online, the backend
# answers a keyed call, the frontend answers, channels as before the upgrade.
health_once() {
  local want="$1" status
  status="$(docker inspect "$APP" --format '{{.State.Status}}' 2>/dev/null || echo missing)"
  [[ "$status" == running ]] || { echo "container $status"; return 2; }
  if [[ "$want" == new ]]; then
    [[ "$(docker inspect "$TEMPORAL" --format '{{.State.Health.Status}}' 2>/dev/null)" == healthy ]] || { echo "temporal not healthy"; return 1; }
    [[ "$(tcli operator search-attribute list 2>/dev/null | grep -cE '\b(organizationId|postId)\b' || true)" -ge 2 ]] \
      || { echo "search attributes not registered"; return 1; }
    # A poller row below the "Pollers:" header (the header line itself prints even with no worker at all).
    tcli task-queue describe --task-queue main 2>/dev/null \
      | awk '/^Pollers:/ { p = 1; next } p && NF && $1 != "BuildID" { n++ } END { exit n > 0 ? 0 : 1 }' \
      || { echo "no worker polls the main queue"; return 1; }
    # Started by the backend when RUN_CRON is set (infinite.workflow.register.ts:9-14); its start error is swallowed.
    tcli workflow describe --workflow-id missing-post-workflow -o json 2>/dev/null | grep -q 'WORKFLOW_EXECUTION_STATUS_RUNNING' \
      || { echo "missing-post workflow not running (backend did not reach Temporal)"; return 1; }
  fi
  # pm2 prints its daemon banner before the JSON while it starts: unparseable = not online yet, retried.
  docker exec "$APP" pm2 jlist 2>/dev/null | python3 -c '
import json, sys
apps = json.load(sys.stdin)
sys.exit(0 if apps and all(a["pm2_env"]["status"] == "online" for a in apps) else 1)' 2>/dev/null || { echo "a pm2 app is not online"; return 1; }
  [[ "$(api http://localhost:3000/public/v1/is-connected keyed | head -1)" == 200 ]] || { echo "backend keyed call not 200"; return 1; }
  [[ "$(api http://localhost:5000/ | head -1)" =~ ^(200|30[0-9])$ ]] || { echo "frontend not answering"; return 1; }
  [[ "$(channels)" == "$(cat "$BK/channels.before")" ]] || { echo "a channel was added, removed, disabled or needs a refresh"; return 1; }
}
health() {  # health new|old <seconds>
  local deadline=$(( $(date +%s) + $2 )) why rc
  while :; do
    # trap - ERR: a failing check is an answer here, not an error (with -E it would otherwise fire inside the $()).
    why="$(trap - ERR; health_once "$1")" && return 0 || rc=$?
    if (( rc == 2 )) || (( $(date +%s) > deadline )); then
      docker logs --tail 40 "$APP" >> "$LOG" 2>&1 || true
      echo "$why"
      return 1
    fi
    sleep 10
  done
}

restore_copied() {  # $DEST's compose, dynamicconfig/, postiz-boot/ exactly as backed up (absent stays absent)
  local f
  for f in "${COPIED[@]}"; do
    rm -rf "${DEST:?}/$f"
    if [[ -e "$BK/$f" ]]; then cp -a "$BK/$f" "$DEST/$f"; fi
  done
}

rollback() {
  # Only the main shell rolls back (set -E fires the ERR trap inside command substitutions too); only once; and from
  # here no signal stops it -- '' is inherited by docker exec / pg_restore, so a dropped SSH cannot cut a restore.
  local st=$?
  [[ $BASHPID == $$ ]] || exit "$st"
  (( IN_ROLLBACK == 0 )) || exit 3
  IN_ROLLBACK=1
  trap '' HUP INT TERM
  trap - ERR
  set +e
  log "ROLLBACK | reason=$1"
  docker stop -t 60 "$APP" >/dev/null 2>&1
  if (( PUSHED )); then
    # The old version cannot start on a pushed schema; restore the database as backed up (--create carries its owner and
    # grants). Rows changed in the window are listed for a person: social_posts is the record of what to send (ADR 016).
    psql_su -d "$DB_NAME" -c "SELECT 'Post ' || id || ' ' || state FROM \"Post\" WHERE \"updatedAt\" > '$(cat "$BK/taken_at")' UNION ALL
      SELECT 'Integration ' || id FROM \"Integration\" WHERE \"updatedAt\" > '$(cat "$BK/taken_at")'" > "$BK/changed-in-window" 2>&1
    log "ROLLBACK | schema push attempted: restoring $DB_NAME from $BK/postiz.dump (rows changed in the window: $BK/changed-in-window)"
    psql_su -d postgres -c "DROP DATABASE \"$DB_NAME\" WITH (FORCE)" >> "$LOG" 2>&1 \
      && docker exec -i "$DB" pg_restore -U "$DB_SU" --create --exit-on-error -d postgres < "$BK/postiz.dump" >> "$LOG" 2>&1 \
      || { log "ROLLBACK FAILED | database restore failed; dump kept at $BK/postiz.dump"; page; exit 3; }
    # pg_restore --exit-on-error loaded every row of the dump; the schema must be the backed-up one, exactly.
    if [[ "$(schema_fp)" != "$(cat "$BK/schema.fp")" ]]; then
      log "ROLLBACK FAILED | restored schema differs from the backup"; page; exit 3
    fi
  fi
  restore_copied
  compose up -d --remove-orphans >> "$LOG" 2>&1
  local why
  if why="$(trap - ERR; health old "$ROLLBACK_HEALTH_TIMEOUT")"; then
    log "ROLLBACK OK | $(cat "$BK/postiz-image") healthy again"
    exit 1
  fi
  log "ROLLBACK FAILED | old version not healthy: $why"
  page
  exit 3
}

# 0. Preflight: one run at a time, then nothing is changed until it passes (except the new TEMPORAL_DB_PASSWORD line,
# which the old version does not read).
exec 9> "${LOCK_FILE:-/run/lock/postiz-upgrade.lock}"
flock -n 9 || { echo "another upgrade-postiz.sh holds the lock"; exit 1; }
for f in "${COPIED[@]}" expected-data-loss.txt; do
  [[ -e "$SRC/$f" ]] || { log "abort: $SRC lacks $f"; exit 1; }
done
POSTIZ_API_KEY="$(sed -n 's/^POSTIZ_API_KEY=//p' "${API_KEY_FILE:-/root/lobster-phase1/.env}" | tr -d "\"'")"
export POSTIZ_API_KEY
[[ -n "$POSTIZ_API_KEY" ]] || { log "abort: no POSTIZ_API_KEY for the keyed health checks"; exit 1; }
queued="$(psql_su -d "$DB_NAME" -c "SELECT count(*) FROM \"Post\" WHERE state = 'QUEUE' AND \"deletedAt\" IS NULL")"
[[ "$queued" == 0 ]] || { log "abort: $queued post(s) wait in the old queue; an upgrade or a rollback could send them late or twice"; exit 1; }
if ! grep -q '^TEMPORAL_DB_PASSWORD=' "$DEST/.env"; then
  [[ -z "$(tail -c1 "$DEST/.env")" ]] || echo >> "$DEST/.env"
  echo "TEMPORAL_DB_PASSWORD=$(openssl rand -hex 24)" >> "$DEST/.env"
  log "preflight | generated TEMPORAL_DB_PASSWORD in $DEST/.env"
fi
grep -qE '^TEMPORAL_DB_PASSWORD=[0-9a-f]{48}$' "$DEST/.env" || { log "abort: TEMPORAL_DB_PASSWORD line in $DEST/.env is malformed"; exit 1; }
old_lines="$(service_lines "$DEST/docker-compose.yml")"
new_lines="$(service_lines "$SRC/docker-compose.yml")"
lost="$(comm -23 <(echo "$old_lines") <(echo "$new_lines") | sed -E 's/^(env [^=]+)=.*/\1/')"   # never print a value
[[ -z "$lost" ]] || { log "abort: the new compose drops or changes what the running postiz has: $(echo $lost)"; exit 1; }
docker compose -f "$SRC/docker-compose.yml" --env-file "$DEST/.env" pull --quiet || { log "abort: cannot pull the new images"; exit 1; }
NEW_IMAGE="$(docker compose -f "$SRC/docker-compose.yml" --env-file "$DEST/.env" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["postiz"]["image"])')"
DATABASE_URL="$(compose_env "$SRC/docker-compose.yml" DATABASE_URL)"
export DATABASE_URL
expected="$(grep -vE '^\s*(#|$)' "$SRC/expected-data-loss.txt" | sort -u || true)"

# 1. Backup
mkdir -p "$BK"
cp -a "$DEST/.env" "$BK/"
for f in "${COPIED[@]}"; do if [[ -e "$DEST/$f" ]]; then cp -a "$DEST/$f" "$BK/"; fi; done
docker inspect "$APP" --format '{{.Config.Image}} ({{.Image}})' > "$BK/postiz-image"
date -u +%Y-%m-%dT%H:%M:%SZ > "$BK/taken_at"
docker exec "$DB" pg_dump -U "$DB_SU" -Fc --create "$DB_NAME" > "$BK/postiz.dump"
docker exec -i "$DB" pg_restore -l < "$BK/postiz.dump" > /dev/null
schema_fp > "$BK/schema.fp"
channels > "$BK/channels.before"
log "backup | $BK | image=$(cat "$BK/postiz-image") | dump $(du -h "$BK/postiz.dump" | cut -f1) | channels $(wc -l < "$BK/channels.before")"
ls -1d "$(dirname "$BK")"/20* 2>/dev/null | sort | head -n -5 | xargs -r rm -rf   # keep the last 5 backups
trap 'rollback "error at line $LINENO"' ERR
trap 'rollback "interrupted"' HUP INT TERM

# 2. Schema gate: the new image's own Prisma push, with the app stopped. Without --accept-data-loss Prisma applies
# nothing when a change would lose data and lists why; only a list that matches expected-data-loss.txt goes ahead.
docker stop -t 60 "$APP" >/dev/null
push() {  # push <output file> [--accept-data-loss]
  local name="postiz-prisma-push-$STAMP" rc=0
  PUSHED=1
  timeout 900 docker run --rm --name "$name" --network "$DB_NET" -e DATABASE_URL --entrypoint sh "$NEW_IMAGE" \
    -c "$PRISMA_PUSH ${2:-}" > "$1" 2>&1 || rc=$?
  docker rm -f "$name" >/dev/null 2>&1 || true   # after a timeout the container may still run
  return "$rc"
}
if push "$BK/prisma-push.out"; then
  log "schema | in sync without data loss"
else
  found="$(grep -E '^\s*•' "$BK/prisma-push.out" | sed -E 's/^\s*•\s*//; s/, which still contains [0-9]+ non-null values\.?$//; s/\.$//' | sort -u || true)"
  [[ -n "$found" ]] || rollback "prisma db push failed without a data-loss list (see $BK/prisma-push.out)"
  unexpected="$(comm -23 <(echo "$found") <(echo "$expected") || true)"
  [[ -z "$unexpected" ]] || rollback "unreviewed data loss: $unexpected"
  log "schema | reviewed data loss: $(echo $found)"
  push "$BK/prisma-push-accept.out" --accept-data-loss || rollback "prisma db push --accept-data-loss failed (see $BK/prisma-push-accept.out)"
fi

# 3. Apply
for f in "${COPIED[@]}"; do rm -rf "${DEST:?}/$f"; cp -a "$SRC/$f" "$DEST/$f"; done
compose config --quiet
compose up -d --remove-orphans >> "$LOG" 2>&1
log "apply | started $(docker inspect "$APP" --format '{{.Config.Image}}' || true)"

# 4. Health
if why="$(trap - ERR; health new "$HEALTH_TIMEOUT")"; then
  trap - ERR HUP INT TERM
  if [[ "$ALERT" == 1 ]]; then rm -f "$FRESH" "$PAGE_STAMP"; fi
  log "health | PASS | temporal ready, worker polling, missing-post workflow running, pm2 online, keyed API 200, frontend up, channels unchanged"
else
  rollback "not healthy after ${HEALTH_TIMEOUT}s: $why"
fi
