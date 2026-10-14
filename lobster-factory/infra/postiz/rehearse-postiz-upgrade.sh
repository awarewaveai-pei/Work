#!/usr/bin/env bash
# rehearse-postiz-upgrade.sh -- run upgrade-postiz.sh against a throwaway copy of the running Postiz stack, twice:
#   1. upgrade: must end "health | PASS";
#   2. from a fresh copy again, with a health timeout too short to pass: must end "ROLLBACK OK" with the database
#      restored from the backup (the rollback path a real failure takes, not a test switch).
# The copy: project postiz-rehearsal, every container_name suffixed -rehearsal, no published ports, every network,
# volume and bind its own; the postiz database is a pg_dump of prod restored into a scratch database of prod's own image
# (same superuser, same DROP/restore path). The copy can reach no real social account even with egress on (Prisma
# downloads itself): every *_SECRET is replaced (POSTIZ_JWT_SECRET decrypts stored app passwords), every channel loses
# its tokens and stored login and is disabled, every queued post is deleted; checked before the copy starts.
# Usage (root): bash rehearse-postiz-upgrade.sh <dir with the new docker-compose.yml, dynamicconfig/, postiz-boot/, expected-data-loss.txt>
# Leaves nothing behind: the project is removed with its volumes, its network and /root/postiz-rehearsal.
set -Eeuo pipefail
umask 077

SRC="$(cd "${1:?usage: rehearse-postiz-upgrade.sh <dir with the new compose>}" && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE=/root/postiz
W=/root/postiz-rehearsal
P=postiz-rehearsal
NET="${P}_rehearsal_db"
PW="$(openssl rand -hex 16)"
DB_IMAGE="$(docker inspect supabase-db --format '{{.Config.Image}}')"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] rehearsal | $*"; }
exec 8> /run/lock/postiz-rehearsal.lock
flock -n 8 || { log "another rehearsal is running"; exit 1; }
teardown() {
  local d
  for d in old new; do
    if [[ -f "$W/$d/docker-compose.yml" ]]; then
      docker compose -p "$P" -f "$W/$d/docker-compose.yml" --env-file "$W/$d/.env" down -v --remove-orphans >/dev/null 2>&1 || true
    fi
  done
  docker rm -f -v postiz-db-rehearsal >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$W"
}
trap teardown EXIT

# A compose file for the copy, from `config --format json` (variables resolved) of a real one. Volume and network names
# are re-derived from the project name (the resolved JSON names prod's own); a bind outside the compose dir aborts.
copy_compose() {  # copy_compose <compose dir> <out dir>
  local f
  mkdir -p "$2"
  cp "$W/base.env" "$2/.env"
  for f in dynamicconfig postiz-boot; do if [[ -d "$1/$f" ]]; then cp -a "$1/$f" "$2/$f"; fi; done
  docker compose -f "$1/docker-compose.yml" --env-file "$W/base.env" config --format json \
    | PW="$PW" P="$P" NET="$NET" IN="$(cd "$1" && pwd)" OUT="$2" python3 -c '
import json, os, sys
c = json.load(sys.stdin)
p, src, out = os.environ["P"], os.environ["IN"].rstrip("/"), os.environ["OUT"]
c["name"] = p
for name, s in c["services"].items():
    s["container_name"] = s.get("container_name", name) + "-rehearsal"
    s.pop("ports", None)
    nets = s.get("networks") or {}
    if "supabase_default" in nets:
        nets["rehearsal_db"] = nets.pop("supabase_default")
    for v in s.get("volumes", []):
        if v.get("type") == "bind":
            if not (v["source"] == src or v["source"].startswith(src + "/")):
                sys.exit("bind outside the compose dir: %s -> %s" % (v["source"], v["target"]))
            v["source"] = out + v["source"][len(src):]
c["services"]["postiz"]["environment"]["DATABASE_URL"] = "postgresql://postiz:%s@postiz-db-rehearsal:5432/postiz" % os.environ["PW"]
c["networks"] = {n: {"name": "%s_%s" % (p, n)} for n in c.get("networks", {}) if n != "supabase_default"}
c["networks"]["rehearsal_db"] = {"name": os.environ["NET"], "external": True}
c["volumes"] = {v["source"]: {} for s in c["services"].values() for v in s.get("volumes", []) if v.get("type") == "volume"}
json.dump(c, open(os.path.join(out, "docker-compose.yml"), "w"), indent=1)'
}

wait_old() {  # the running (old) copy answers a keyed call: its own start (Prisma push, pm2) is done
  local key; key="$(sed -n 's/^POSTIZ_API_KEY=//p' /root/lobster-phase1/.env | tr -d "\"'")"
  for _ in $(seq 60); do
    [[ "$(POSTIZ_API_KEY="$key" docker exec -e POSTIZ_API_KEY postiz-rehearsal node -e '
      fetch("http://localhost:3000/public/v1/is-connected", { headers: { Authorization: process.env.POSTIZ_API_KEY }, signal: AbortSignal.timeout(10000) })
        .then((r) => console.log(r.status)).catch(() => console.log(0))' 2>/dev/null)" == 200 ]] && return 0
    sleep 10
  done
  log "FAIL: the old copy never answered"; docker logs --tail 30 postiz-rehearsal; exit 1
}

dbq() { docker exec -i postiz-db-rehearsal psql -U supabase_admin -v ON_ERROR_STOP=1 -At "$@"; }

fresh_copy() {  # scratch DB with prod's postiz restored and defanged, then the running version on top
  teardown
  mkdir -p "$W"
  # every *_SECRET replaced: POSTIZ_JWT_SECRET is the key Postiz decrypts stored app passwords (Bluesky) with
  { cat "$LIVE/.env"; echo; echo "TEMPORAL_DB_PASSWORD=$(openssl rand -hex 24)"; } | grep -v '^$' \
    | while IFS= read -r line; do
        if [[ "$line" =~ ^([A-Z0-9_]*_SECRET)= ]]; then echo "${BASH_REMATCH[1]}=$(openssl rand -hex 32)"; else echo "$line"; fi
      done > "$W/base.env"
  copy_compose "$LIVE" "$W/old"
  copy_compose "$SRC" "$W/new"
  cp "$SRC/expected-data-loss.txt" "$W/new/"
  docker network create "$NET" >/dev/null
  docker run -d --name postiz-db-rehearsal --network "$NET" -e POSTGRES_PASSWORD="$PW" -e PGPASSWORD="$PW" "$DB_IMAGE" >/dev/null
  for _ in $(seq 90); do docker exec postiz-db-rehearsal pg_isready -q -h 127.0.0.1 -U postgres && break; sleep 2; done
  dbq -d postgres -c "CREATE ROLE postiz LOGIN PASSWORD '$PW'" >/dev/null
  docker exec supabase-db pg_dump -U supabase_admin -Fc --create postiz | docker exec -i postiz-db-rehearsal pg_restore -U supabase_admin --create --exit-on-error -d postgres
  dbq -d postiz -c "UPDATE \"Integration\" SET token = 'rehearsal-invalid', \"refreshToken\" = NULL, \"customInstanceDetails\" = NULL, disabled = true;
                    UPDATE \"Post\" SET \"deletedAt\" = now() WHERE \"deletedAt\" IS NULL AND state = 'QUEUE'" >/dev/null
  local armed
  armed="$(dbq -d postiz -c "SELECT (SELECT count(*) FROM \"Integration\" WHERE NOT disabled OR \"customInstanceDetails\" IS NOT NULL OR token <> 'rehearsal-invalid' OR \"refreshToken\" IS NOT NULL)
                            + (SELECT count(*) FROM \"Post\" WHERE \"deletedAt\" IS NULL AND state = 'QUEUE')")"
  [[ "$armed" == 0 ]] || { log "FAIL: $armed channel(s) or queued post(s) still usable in the copy; not starting it"; exit 1; }
  docker compose -p "$P" -f "$W/old/docker-compose.yml" --env-file "$W/old/.env" up -d >/dev/null 2>&1
  wait_old
  log "copy of $(docker inspect postiz-rehearsal --format '{{.Config.Image}}') answers on a defanged copy of the postiz database"
}

run_upgrade() {  # run_upgrade <health timeout>: the real script, pointed at the copy
  POSTIZ_DIR="$W/old" COMPOSE_PROJECT="$P" POSTIZ_CONTAINER=postiz-rehearsal TEMPORAL_CONTAINER=temporal-rehearsal \
    DB_CONTAINER=postiz-db-rehearsal DB_SUPERUSER=supabase_admin DB_NETWORK="$NET" BACKUP_ROOT="$W/backups" \
    UPGRADE_LOG="$W/upgrade.log" LOCK_FILE="$W/upgrade.lock" FRESH_REGISTRATION="$W/fresh.d/postiz-upgrade" ALERT=0 \
    HEALTH_TIMEOUT="$1" ROLLBACK_HEALTH_TIMEOUT=900 bash "$HERE/upgrade-postiz.sh" "$W/new"
}

fresh_copy
rc=0; run_upgrade 900 || rc=$?
grep -h 'reviewed data loss\|in sync' "$W/upgrade.log" || true
if [[ $rc != 0 ]] || ! grep -q 'health | PASS' "$W/upgrade.log"; then
  log "FAIL: upgrade exit $rc"; tail -40 "$W/upgrade.log"; cat "$W"/backups/*/prisma-push*.out 2>/dev/null | tail -20; exit 1
fi
log "upgrade PASS"

fresh_copy
rc=0; run_upgrade 20 || rc=$?
if [[ $rc != 1 ]] || ! grep -q 'ROLLBACK OK' "$W/upgrade.log" || ! grep -q 'schema push attempted: restoring' "$W/upgrade.log"; then
  log "FAIL: rollback exit $rc"; tail -40 "$W/upgrade.log"; exit 1
fi
log "rollback PASS (database restored, old version healthy)"
log "=== rehearsal PASSED ==="
