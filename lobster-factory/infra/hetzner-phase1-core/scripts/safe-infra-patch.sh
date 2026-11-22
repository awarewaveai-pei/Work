#!/usr/bin/env bash
# safe-infra-patch.sh — backup-apply-health-rollback wrapper for critical infra files.
#
# Required by Auto-Repair 紅線: ANY agent modifying nginx/Dockerfile/docker-compose
# MUST use this script. Four steps are mandatory; zero tolerance for skipping.
#
# Usage:
#   echo "new content" | safe-infra-patch.sh compose <file-path> <service>   # any project: /root/chatwoot/docker-compose.yml too
#   echo "new content" | safe-infra-patch.sh nginx   <file-path>
#   echo "new content" | safe-infra-patch.sh host-nginx /etc/nginx/<file> <vhost-to-probe>[/open-path]
#   echo "new content" | safe-infra-patch.sh file    <file-path>   # no health check
#   echo "new content" | safe-infra-patch.sh compose-new <file-path> <service>   # file must NOT exist (new site)
#   echo "new content" | safe-infra-patch.sh host-nginx-new /etc/nginx/sites-available/<name> <vhost-to-probe>[/open-path]
#
# compose-new / host-nginx-new create what did not exist; their rollback removes only what this run created:
# compose-new = `docker compose -f <file> down` (never -v: volumes stay) + the file + parent dirs it made (if empty);
# host-nginx-new = the sites-enabled link + the file, then a reload only if the new config had been reloaded.
#
# nginx = the lobster-nginx CONTAINER. host-nginx = the host's own /etc/nginx (client vhosts such as
# soulfulexpression.org); `nginx` on a host file would pass without testing or reloading it.
#
# Exit 0 = applied + verified. Exit 1 = failed + rolled back.
# Audit log: /root/lobster-phase1/safe-patch.log

set -euo pipefail

TYPE="${1:-}"
FILE_PATH="${2:-}"
TARGET="${3:-}"

[[ -z "$TYPE" || -z "$FILE_PATH" ]] && {
  echo "Usage: safe-infra-patch.sh <compose|nginx|host-nginx|file|compose-new|host-nginx-new> <file-path> [service|vhost]" >&2
  exit 1
}
NEW_TYPE=0
case "$TYPE" in compose-new|host-nginx-new) NEW_TYPE=1 ;; esac
# New types: every refusal happens here, before anything is written -- their rollback deletes the file, so it must
# never run against a file this run did not create.
if (( NEW_TYPE )); then
  refuse() { echo "ERROR: $TYPE: $*" >&2; exit 1; }
  [[ -e "$FILE_PATH" || -L "$FILE_PATH" ]] && refuse "file already exists: $FILE_PATH (change it with the non-new type)"
  FILE_PATH="$(realpath -m "$FILE_PATH")"   # `a/missing/../f` passes -e above yet resolves to an existing a/f
  [[ -e "$FILE_PATH" || -L "$FILE_PATH" ]] && refuse "file already exists: $FILE_PATH (change it with the non-new type)"
  if [[ "$TYPE" == compose-new ]]; then
    [[ "$TARGET" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || refuse "service name required"
  else
    [[ "$(dirname "$FILE_PATH")" == /etc/nginx/sites-available ]] || refuse "file must be directly in /etc/nginx/sites-available: $FILE_PATH"
    [[ "$(basename "$FILE_PATH")" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || refuse "bad vhost file name: $(basename "$FILE_PATH")"
    [[ "$TARGET" =~ ^[a-z0-9.-]+(/[A-Za-z0-9._/-]*)?$ ]] || refuse "needs a vhost to probe"
    [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]] || refuse "/etc/nginx/sites-available or sites-enabled missing"
    LINK="/etc/nginx/sites-enabled/$(basename "$FILE_PATH")"
    [[ -e "$LINK" || -L "$LINK" ]] && refuse "link already exists: $LINK"
  fi
else
  [[ -f "$FILE_PATH" ]] || { echo "ERROR: file not found: $FILE_PATH" >&2; exit 1; }
fi

LOGFILE="/root/lobster-phase1/safe-patch.log"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGING_DIR="/root/lobster-phase1"
BACKUP="${FILE_PATH}.bak.safe-patch-${STAMP}"
# host-nginx: never next to the file -- nginx includes whole directories (sites-enabled/*), so a backup
# there would load as a second copy of the vhost.
if [[ "$TYPE" == host-nginx ]]; then
  mkdir -p "$STAGING_DIR/safe-patch-backups"
  BACKUP="$STAGING_DIR/safe-patch-backups/$(realpath -m "$FILE_PATH" | tr / _).safe-patch-${STAMP}"
fi
HEALTH_TIMEOUT="${SAFE_PATCH_HEALTH_TIMEOUT:-90}"
# compose. Invariant: the file patched is a file compose loads for TARGET, and compose runs with exactly the inputs
# that created it. (a) TARGET already has a container whose compose labels list this file: reuse its project, working
# dir, files and env file -- the only way to reach a non-default name (docker-compose.observability.yml in lobster-phase1,
# docker-compose.video.yml with --env-file .env.video). Exactly one such container, else refused.
# (b) no container yet: the project is the file's own directory and the file must be the first default name in compose's
# lookup order; COMPOSE_FILE in shell (unset below) or in the project .env (refused) would change what loads.
COMPOSE_ARGS=()
if [[ "$TYPE" == compose-new ]]; then   # parent dir may not exist yet; -f pins the file, its dir is the project dir
  COMPOSE_DIR="$(dirname "$FILE_PATH")"
  COMPOSE_ARGS=(-f "$FILE_PATH")
else
  COMPOSE_DIR="$(cd "$(dirname "$FILE_PATH")" && pwd)"
fi
if [[ "$TYPE" == compose && -n "$TARGET" ]]; then
  ABS_FILE="$COMPOSE_DIR/$(basename "$FILE_PATH")"
  L='{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{index .Config.Labels "com.docker.compose.project.config_files"}}|{{index .Config.Labels "com.docker.compose.project.environment_file"}}'
  matches=()
  while IFS= read -r cid; do
    [[ -n "$cid" ]] || continue
    m="$(docker inspect --format "$L" "$cid")"
    IFS=, read -ra files <<<"$(cut -d'|' -f3 <<<"$m")"
    for f in "${files[@]}"; do [[ "$f" == "$ABS_FILE" ]] && { matches+=("$m"); break; }; done
  done < <(docker ps -aq --filter "label=com.docker.compose.service=$TARGET")
  if (( ${#matches[@]} > 1 )) && [[ "$(printf '%s\n' "${matches[@]}" | sort -u | wc -l)" -gt 1 ]]; then
    echo "ERROR: containers of service $TARGET from $ABS_FILE disagree on project/files/env: ${matches[*]}" >&2
    exit 1
  fi
  if (( ${#matches[@]} )); then
    IFS='|' read -r c_project c_dir c_files c_env <<<"${matches[0]}"
    COMPOSE_DIR="$c_dir"
    COMPOSE_ARGS=(-p "$c_project" --project-directory "$c_dir")
    IFS=, read -ra files <<<"$c_files"
    for f in "${files[@]}"; do COMPOSE_ARGS+=(-f "$f"); done
    IFS=, read -ra envs <<<"$c_env"
    for e in "${envs[@]}"; do [[ -n "$e" ]] && COMPOSE_ARGS+=(--env-file "$e"); done
  fi
fi
if [[ "$TYPE" == compose && ${#COMPOSE_ARGS[@]} -eq 0 ]]; then
  loaded=""
  for n in compose.yaml compose.yml docker-compose.yaml docker-compose.yml; do
    [[ -f "$COMPOSE_DIR/$n" ]] && { loaded="$n"; break; }
  done
  if [[ "$(basename "$FILE_PATH")" != "$loaded" ]]; then
    echo "ERROR: docker compose in $COMPOSE_DIR loads '${loaded:-nothing}', not $(basename "$FILE_PATH")" >&2
    exit 1
  fi
  if [[ -f "$COMPOSE_DIR/.env" ]] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?COMPOSE_FILE[[:space:]]*=' "$COMPOSE_DIR/.env"; then
    echo "ERROR: $COMPOSE_DIR/.env sets COMPOSE_FILE; the patched file may not be the one compose loads" >&2
    exit 1
  fi
fi
compose() {
  (cd "$COMPOSE_DIR" && unset COMPOSE_FILE
   if (( ${#COMPOSE_ARGS[@]} )); then docker compose "${COMPOSE_ARGS[@]}" "$@"
   elif [[ -f .env ]]; then docker compose --env-file .env "$@"; else docker compose "$@"; fi)
}

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOGFILE"; }

# ── Step 1: Backup (new types: nothing to back up) ───────────────────────────
if (( ! NEW_TYPE )); then
  cp "$FILE_PATH" "$BACKUP"
  log "backup | file=$FILE_PATH | backup=$BACKUP"
fi

# ── Step 2: Apply (stdin) ─────────────────────────────────────────────────────
NEW_CONTENT="$(cat)"
if [[ -z "$NEW_CONTENT" ]]; then
  log "abort | reason=empty stdin"
  rm -f "$BACKUP"
  echo "ERROR: no content on stdin" >&2
  exit 1
fi
# Invariant: exit 0 <=> the new content was verified and stays; any other end -- an unexpected failure under set -e
# (2026-10-24: a failing `compose up` exited here before Step 4 and kept the new file), TERM/HUP/INT (SSH dropped) or a
# failure while reporting success -- restores the backup. So finished=1 is the script's last statement.
finished=0
CREATED_DIRS=(); CREATED_FILE=0; CREATED_LINK=0; UP_STARTED=0; RELOADED=0
rollback_new() {  # remove only what this run created; never `down -v`
  log "rollback | type=$TYPE | file=$FILE_PATH | removing what this run created"
  local removed=() i
  if [[ "$TYPE" == compose-new && $UP_STARTED -eq 1 ]] && ! compose down 2>&1 | tail -3; then
    # Keep the file: without it nobody can `down` what is left (and the project check refuses a re-run).
    log "rollback-warn | compose down failed; kept $FILE_PATH -- run: docker compose -f $FILE_PATH down"
    CREATED_FILE=0; CREATED_DIRS=()
  fi
  # The flag is set before `ln`, so the link is removed only if it points at our file (a TERM between ln and the flag
  # would otherwise leave a dangling link that fails every later `nginx -t`).
  if [[ $CREATED_LINK -eq 1 && "$(readlink "$LINK" 2>/dev/null)" == "$FILE_PATH" ]]; then rm -f "$LINK"; removed+=("$LINK"); fi
  if [[ $CREATED_FILE -eq 1 ]]; then rm -f "$FILE_PATH"; removed+=("$FILE_PATH"); fi
  for (( i = ${#CREATED_DIRS[@]} - 1; i >= 0; i-- )); do rmdir "${CREATED_DIRS[i]}" 2>/dev/null && removed+=("${CREATED_DIRS[i]}"); done
  if [[ "$TYPE" == host-nginx-new && $RELOADED -eq 1 ]]; then
    { nginx -t >/dev/null 2>&1 && systemctl reload nginx; } || log "rollback-warn | host nginx not reloaded; run nginx -t"
  fi
  log "rollback-done | file=$FILE_PATH | removed=${removed[*]:-nothing}"
  echo "SAFE-PATCH FAILED: removed what this run created (${removed[*]:-nothing})" >&2
}
rollback() {
  (( NEW_TYPE )) && { rollback_new; return; }
  log "rollback | file=$FILE_PATH | restoring=$BACKUP"
  cp "$BACKUP" "$FILE_PATH"
  case "$TYPE" in
    compose)
      compose up -d --no-build "$TARGET" 2>&1 | tail -3 || true
      ;;
    nginx)
      docker exec lobster-nginx nginx -s reload 2>/dev/null || true
      ;;
    host-nginx)
      { nginx -t >/dev/null 2>&1 && systemctl reload nginx; } || log "rollback-warn | host nginx not reloaded; run nginx -t"
      ;;
  esac
  log "rollback-done | file=$FILE_PATH | status=restored"
  echo "SAFE-PATCH FAILED: rolled back to backup $BACKUP" >&2
}
on_exit() { trap - EXIT; set +e; [[ $finished -eq 1 ]] || { rollback; exit 1; }; }
trap on_exit EXIT
trap 'exit 1' TERM HUP INT
if (( NEW_TYPE )); then
  missing=(); d="$(dirname "$FILE_PATH")"
  while [[ ! -d "$d" ]]; do missing=("$d" "${missing[@]}"); d="$(dirname "$d")"; done
  for d in "${missing[@]}"; do mkdir -m 0700 "$d"; CREATED_DIRS+=("$d"); done
  (set -C; printf '%s\n' "$NEW_CONTENT" > "$FILE_PATH")   # noclobber: a file that appeared since the check is not ours
  CREATED_FILE=1
  if [[ "$TYPE" == host-nginx-new ]]; then CREATED_LINK=1; ln -s "$FILE_PATH" "$LINK"; fi
else
  printf '%s\n' "$NEW_CONTENT" > "$FILE_PATH"
fi
log "apply | file=$FILE_PATH | bytes=${#NEW_CONTENT}"

# A reload the master refuses at runtime -- `nginx -t` passes, HUP is delivered, exit 0 -- keeps the OLD workers and logs
# only an [emerg] (2026-11-01: a limit_req zone whose key changed kept lobster-nginx on a two-day-old config while every
# patch reported success). The one proof a reload happened is a new set of worker PIDs.
# Workers = children of that nginx's own master whose title is exactly "worker process" (not "... is shutting down": an
# old worker draining after an earlier reload; the host's pgrep also sees every container's nginx).
nginx_worker_pids() {  # $1 = host | <container>
  if [[ "$1" == host ]]; then
    local m; m="$(cat /run/nginx.pid 2>/dev/null)"; [[ -n "$m" ]] && pgrep -P "$m" -f 'nginx: worker process$' | sort
  else
    docker top "$1" -o pid,ppid,cmd 2>/dev/null | awk '
      /nginx: master process/ {m = $1}
      {pid[NR] = $1; ppid[NR] = $2; worker[NR] = ($0 ~ /nginx: worker process$/)}
      END {for (i = 1; i <= NR; i++) if (worker[i] && ppid[i] == m) print pid[i]}' | sort
  fi
}
# host-nginx-new: a 2xx from the probe proves nothing on its own -- the 443 default_server (placeholder) answers 200 for
# any host. So the new file must be loaded via its sites-enabled link, name the probed vhost, and not lose it to an
# earlier server block (nginx -t only warns "conflicting server name").
new_vhost_loaded() {  # $1 = nginx -t output
  if ! nginx -T 2>/dev/null | grep -xF "# configuration file $LINK:" >/dev/null; then   # not -q: SIGPIPE + pipefail
    log "health-fail | reason=$LINK not loaded by nginx (check the include of sites-enabled)"; return 1
  fi
  if ! sed 's/#.*//' "$FILE_PATH" | grep -oE '(^|[[:space:];{}])server_name[[:space:]][^;]*' | sed -E 's/^.*server_name//' \
       | tr -s '[:space:]' '\n' | grep -xF -- "$probe_host" >/dev/null; then
    log "health-fail | reason=$FILE_PATH has no server_name $probe_host"; return 1
  fi
  if grep -qF "conflicting server name \"$probe_host\"" <<<"$1"; then
    log "health-fail | reason=server_name $probe_host is already served by another vhost"; return 1
  fi
}
reload_verified() {  # $1 = host | <container>; $2.. = the reload command. Passes only when a worker PID not there before appears within 10 s.
  local before after; before="$(nginx_worker_pids "$1")"
  "${@:2}" || return 1
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1; after="$(nginx_worker_pids "$1")"
    [[ -n "$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | grep -v '^$')" ]] && return 0
  done
  return 1
}

# ── Step 3: Health check ──────────────────────────────────────────────────────
health_ok=1

wait_container_healthy() {  # $2 = strict (compose-new): no container or no healthcheck fails instead of passing
  local svc="$1" strict="${2:-}" elapsed=0 cname status hc
  cname=$(compose ps -q "$svc" 2>/dev/null | head -1 || true)
  if [[ -z "$cname" ]]; then
    [[ -n "$strict" ]] && { log "health-fail | container for $svc not found"; return 1; }
    log "health-warn | container for $svc not found"; return 0
  fi
  hc=$(docker inspect --format='{{if .Config.Healthcheck}}yes{{end}}' "$cname" 2>/dev/null || true)
  if [[ "$hc" != "yes" ]]; then
    [[ -n "$strict" ]] && { log "health-fail | $svc has no healthcheck (compose-new requires one)"; return 1; }
    log "health-warn | $svc has no healthcheck — skipping wait"; return 0
  fi
  echo -n "  Waiting for $svc healthy"
  while true; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$cname" 2>/dev/null || echo "unknown")
    case "$status" in
      healthy)   echo " PASS (${elapsed}s)"; return 0 ;;
      unhealthy) echo " FAIL";               return 1 ;;
    esac
    sleep 3; elapsed=$((elapsed + 3)); printf "."
    if [[ $elapsed -ge $HEALTH_TIMEOUT ]]; then echo " TIMEOUT (${HEALTH_TIMEOUT}s)"; return 1; fi
  done
}

case "$TYPE" in
  compose)
    [[ -z "$TARGET" ]] && { echo "ERROR: service required for compose type" >&2; health_ok=0; }
    if [[ $health_ok -eq 1 ]]; then
      if ! compose config --quiet 2>/dev/null; then
        log "health-fail | reason=compose config invalid ($COMPOSE_DIR)"
        health_ok=0
      else
        compose up -d --no-build "$TARGET" 2>&1 | tail -5
        wait_container_healthy "$TARGET" || health_ok=0
      fi
    fi
    ;;
  compose-new)
    # Project name as compose resolves it; a project that already has containers is not ours -- refused before `up`,
    # so the rollback never runs `down` against it.
    project="$(compose config 2>/dev/null | sed -n 's/^name: //p' | head -1 || true)"
    if ! compose config --quiet 2>/dev/null; then
      log "health-fail | reason=compose config invalid ($FILE_PATH)"
      health_ok=0
    elif ! compose config --services 2>/dev/null | grep -x -- "$TARGET" >/dev/null; then
      log "health-fail | reason=service $TARGET not in $FILE_PATH"
      health_ok=0
    elif [[ -z "$project" ]] || [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ]]; then
      log "health-fail | reason=compose project '$project' already has containers (or has no name); not ours to start or remove"
      health_ok=0
    elif [[ "${SAFE_PATCH_REUSE_VOLUMES:-}" != 1 && -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ]]; then
      # Rollback keeps volumes, so a reused project name (same slug, or another dir with the same basename) would mount
      # a previous site's data. Reusing them is an explicit choice: SAFE_PATCH_REUSE_VOLUMES=1.
      log "health-fail | reason=compose project '$project' already has volumes ($(docker volume ls -q --filter "label=com.docker.compose.project=$project" | tr '\n' ' ')); set SAFE_PATCH_REUSE_VOLUMES=1 to reuse them"
      health_ok=0
    else
      UP_STARTED=1
      compose up -d --no-build 2>&1 | tail -5
      wait_container_healthy "$TARGET" strict || health_ok=0
    fi
    ;;
  nginx)
    if ! docker exec lobster-nginx nginx -t 2>/dev/null; then
      log "health-fail | reason=nginx -t failed"
      health_ok=0
    elif ! reload_verified lobster-nginx docker exec lobster-nginx nginx -s reload; then
      log "health-fail | reason=lobster-nginx kept its old workers after reload (config refused at runtime; a changed limit_req zone key needs a container restart): $(tail -n 5 /var/log/lobster-nginx/error.log 2>/dev/null | grep emerg | tail -1)"
      health_ok=0
    else
      # Probe lobster-nginx itself, not the outer host-nginx (port 80, Certbot-managed,
      # force-redirects several domains to HTTPS) -- resolved at runtime, not hardcoded,
      # because the host port is NGINX_HOST_PORT-driven (docker-compose.yml) and varies
      # by environment/host.
      nginx_probe_port=$(docker port lobster-nginx 80/tcp 2>/dev/null | head -1 | sed 's/.*://')
      nginx_probe_port="${nginx_probe_port:-80}"
      http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Host: app.aware-wave.com" "http://127.0.0.1:${nginx_probe_port}/api/ops/summary" 2>/dev/null)
      http_code="${http_code:-000}"
      if [[ "$http_code" != "200" ]]; then
        log "health-fail | reason=nginx smoke check returned $http_code"
        health_ok=0
      fi
    fi
    ;;
  host-nginx|host-nginx-new)
    # TARGET = a vhost this file serves, probed over 127.0.0.1 (cf-only.conf admits loopback); `vhost/path` when the
    # vhost's / is behind auth (an API gateway answers 401 there) and an open path proves the upstream answers.
    case "$(realpath -m "$FILE_PATH")" in /etc/nginx/*) ;; *)
      log "health-fail | reason=host-nginx file outside /etc/nginx"; health_ok=0 ;; esac
    [[ "$TARGET" =~ ^[a-z0-9.-]+(/[A-Za-z0-9._/-]*)?$ ]] || { log "health-fail | reason=host-nginx needs a vhost to probe"; health_ok=0; }
    probe_host="${TARGET%%/*}"
    probe_path="${TARGET#"$probe_host"}"; probe_path="${probe_path:-/}"
    if [[ $health_ok -eq 1 ]]; then
      if ! nt="$(nginx -t 2>&1)"; then
        log "health-fail | reason=nginx -t failed: $(printf '%s' "$nt" | tail -2 | tr '\n' ' ')"
        health_ok=0
      elif ! { RELOADED=1; reload_verified host systemctl reload nginx; }; then
        log "health-fail | reason=host nginx kept its old workers after reload (config refused at runtime): $(tail -n 5 /var/log/nginx/error.log 2>/dev/null | grep emerg | tail -1)"
        health_ok=0
      elif [[ "$TYPE" == host-nginx-new ]] && ! new_vhost_loaded "$nt"; then
        health_ok=0
      else
        http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 30 \
          --resolve "${probe_host}:443:127.0.0.1" "https://${probe_host}${probe_path}" 2>/dev/null || true)
        if [[ ! "${http_code:-000}" =~ ^[23][0-9][0-9]$ ]]; then
          log "health-fail | reason=https://${probe_host}${probe_path} via 127.0.0.1 returned ${http_code:-000}"
          health_ok=0
        fi
      fi
    fi
    ;;
  file)
    log "apply | type=file | health-check=skipped"
    ;;
  *)
    echo "ERROR: unknown type '$TYPE'. Valid: compose|nginx|host-nginx|file|compose-new|host-nginx-new" >&2
    health_ok=0
    ;;
esac

# ── Step 4: Rollback if failed (on_exit) ──────────────────────────────────────
[[ $health_ok -eq 1 ]] || exit 1

if (( NEW_TYPE )); then
  log "success | type=$TYPE | file=$FILE_PATH | created"
  echo "safe-infra-patch OK. Created: $FILE_PATH"
else
  log "success | type=$TYPE | file=$FILE_PATH | backup=$BACKUP"
  echo "safe-infra-patch OK. Backup: $BACKUP"
fi
finished=1
