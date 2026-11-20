#!/usr/bin/env bash
# own-compose-apps.sh -- sourced, never run. The ONE place that says how an app with its own compose file (not
# /root/lobster-phase1/docker-compose.yml) is synced, built, tested and started on ks-aw-01. sg-deploy.sh (deploy +
# auto-rollback) and rollback-phase1.sh (save / restore) both call oc_compose, so the compose file, project and env file
# are written nowhere else. Why: 2026-11-20 a hand-typed compose command for video-service that left out its env file
# (.env.video) left the new AND the rolled-back container unable to start (~10 min down; WORKLOG 2026-11-20 C1).
# Tests: tests/host-scripts/own-compose-apps.test.sh (stubs), own-compose-deploy.test.sh (Docker end-to-end).
#
# own_compose_spec <app>  -> 0 and sets OC_* for an app listed in OWN_COMPOSE_APPS; 1 for any other name.
#   OC_DIR OC_FILE OC_ENV_FILE OC_PROJECT OC_SERVICE  how compose runs it (OC_ENV_FILE empty = the compose file reads
#                                                     its secrets through env_file:, nothing to pass)
#   OC_CONTAINER  container_name;  OC_IMAGE_REPO  image = $OC_IMAGE_REPO:local, the tag the compose file must name
#   OC_REQUIRED_VARS  container environment that must resolve non-empty (an empty RENDER_AUTH_TOKEN = the outage)
#   OC_SRC        source in the git checkout, relative to it
#   OC_SYNC_DIR   rsync target the build reads (empty = build straight from the git checkout)
#   OC_TEST       run by `sh -c` inside the freshly built image, no network, the container's own CPU/memory limits
#   OC_SMOKE_URL  host-side probe that must answer 2xx once the container is healthy
#   OC_HEALTH_TIMEOUT  seconds to wait for healthy (remotion: start_period 60 s)

OWN_COMPOSE_APPS="video-service remotion-service"
# apps/ directories that have a Dockerfile but are deployed neither by the staging compose nor by this file. Each is a
# known gap, not an oversight: the test refuses a new app directory that is in none of the three lists.
OWN_COMPOSE_NOT_IN_SG_DEPLOY="video-whisper-worker r2-egress-proxy"

# Production paths live under /root. Only the tests move them, and only through this explicitly named variable.
OC_HOST_ROOT="${OC_TEST_HOST_ROOT:-/root}"

own_compose_spec() {
  local apps="lobster-factory/infra/hetzner-phase1-core/apps"
  case "$1" in
    video-service)
      OC_DIR="$OC_HOST_ROOT/lobster-phase1/apps/video-service"; OC_FILE=docker-compose.video.yml; OC_ENV_FILE=.env.video
      OC_PROJECT=video-service; OC_SERVICE=video-service; OC_CONTAINER=lobster-video-service
      OC_IMAGE_REPO=lobster-video-service
      OC_REQUIRED_VARS="RENDER_AUTH_TOKEN R2_API_TOKEN R2_ACCOUNT_ID R2_VIDEO_PUBLIC_BASE"
      OC_SRC="$apps/video-service"; OC_SYNC_DIR="$OC_DIR"
      OC_TEST='python -m unittest discover -s tests'
      OC_SMOKE_URL=http://127.0.0.1:8732/health; OC_HEALTH_TIMEOUT=120 ;;
    remotion-service)
      OC_DIR="$OC_HOST_ROOT/render-services"; OC_FILE=docker-compose.yml; OC_ENV_FILE=""
      OC_PROJECT=render-services; OC_SERVICE=lobster-remotion-service; OC_CONTAINER=lobster-remotion-service
      OC_IMAGE_REPO=lobster-remotion-service
      OC_REQUIRED_VARS="RENDER_AUTH_TOKEN"
      OC_SRC="$apps/remotion-service"; OC_SYNC_DIR=""
      OC_TEST='node --test test/*.test.cjs'
      OC_SMOKE_URL=http://127.0.0.1:8733/health; OC_HEALTH_TIMEOUT=180 ;;
    *) return 1 ;;
  esac
}

# oc_compose <compose args...> -- for the app own_compose_spec last loaded. COMPOSE_FILE would change which files load,
# and a caller's exported OC_REQUIRED_VARS would override the env file's values, so both are dropped.
oc_compose() {
  local -a a=(-p "$OC_PROJECT" --project-directory "$OC_DIR" -f "$OC_DIR/$OC_FILE")
  [[ -n "$OC_ENV_FILE" ]] && a+=(--env-file "$OC_DIR/$OC_ENV_FILE")
  # shellcheck disable=SC2086
  (cd "$OC_DIR" && unset COMPOSE_FILE $OC_REQUIRED_VARS && docker compose "${a[@]}" "$@")
}

# own_compose_check_labels -> 0 when the running container was started by exactly this spec, or no container of this
# service exists (first deploy); 1 and the difference otherwise -- including "docker could not answer", which must
# never pass as "first deploy".
own_compose_check_labels() {
  local f='{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{index .Config.Labels "com.docker.compose.project.config_files"}}|{{index .Config.Labels "com.docker.compose.project.environment_file"}}|{{index .Config.Labels "com.docker.compose.service"}}'
  local got want err others
  if ! got="$(docker inspect --type container -f "$f" "$OC_CONTAINER" 2>&1)"; then
    err="$got"
    grep -qi 'no such' <<<"$err" || { echo "cannot inspect $OC_CONTAINER: $err"; return 1; }
    # No container under that name: refuse if one runs for this service under another name (spec drifted).
    others="$(docker ps -aq --filter "label=com.docker.compose.service=$OC_SERVICE" 2>&1)" || { echo "cannot list containers: $others"; return 1; }
    [[ -z "$others" ]] || { echo "no container named $OC_CONTAINER, but compose service $OC_SERVICE runs as: $others"; return 1; }
    echo "no container $OC_CONTAINER yet -- first deploy"; return 0
  fi
  # The label holds the absolute path of each --env-file given; with none, compose 2.x leaves it empty (some versions
  # record the default <dir>/.env instead -- the same inputs, so accepted as equal).
  want="$OC_PROJECT|$OC_DIR|$OC_DIR/$OC_FILE|${OC_ENV_FILE:+$OC_DIR/$OC_ENV_FILE}|$OC_SERVICE"
  [[ -z "$OC_ENV_FILE" && "$got" == "$OC_PROJECT|$OC_DIR|$OC_DIR/$OC_FILE|$OC_DIR/.env|$OC_SERVICE" ]] && got="$want"
  if [[ "$got" != "$want" ]]; then
    echo "$OC_CONTAINER compose labels (project|dir|files|env file|service) differ from own-compose-apps.sh:"
    echo "  container: $got"
    echo "  spec:      $want"
    return 1
  fi
  echo "$OC_CONTAINER labels match the spec ($want)"
}

# own_compose_preflight -> 0 when compose, as the spec runs it, would start OC_CONTAINER from $OC_IMAGE_REPO:local with
# every OC_REQUIRED_VARS non-empty; 1 and the reasons otherwise. Read-only. Without the image check a host compose
# naming another image would let `up` keep the old container and the deploy report success with old code.
own_compose_preflight() {
  local cfg img bad="" v val
  [[ -f "$OC_DIR/$OC_FILE" ]] || { echo "$OC_DIR/$OC_FILE not found"; return 1; }
  [[ -z "$OC_ENV_FILE" || -f "$OC_DIR/$OC_ENV_FILE" ]] || { echo "$OC_DIR/$OC_ENV_FILE not found -- $OC_SERVICE cannot start without it"; return 1; }
  cfg="$(oc_compose config "$OC_SERVICE" 2>&1)" || { echo "compose config failed: $cfg"; return 1; }
  [[ -z "$(grep -i 'variable is not set' <<<"$cfg" || true)" ]] || bad+=$'\n'"$(grep -i 'variable is not set' <<<"$cfg")"
  img="$(oc_compose config --images "$OC_SERVICE" 2>/dev/null | tail -1)"
  [[ "$img" == "$OC_IMAGE_REPO:local" ]] || bad+=$'\n'"service $OC_SERVICE uses image '${img:-?}', the deploy builds $OC_IMAGE_REPO:local"
  [[ -n "$(grep -E "^    container_name: $OC_CONTAINER\$" <<<"$cfg" || true)" ]] || bad+=$'\n'"service $OC_SERVICE is not container_name $OC_CONTAINER"
  for v in $OC_REQUIRED_VARS; do
    val="$(sed -nE "s/^      $v: (.*)\$/\1/p" <<<"$cfg" | head -1)"
    [[ -n "$val" && "$val" != '""' ]] || bad+=$'\n'"$v resolves empty in the container environment"
  done
  if [[ -n "$bad" ]]; then printf '%s: compose would not start the deployed image correctly:%s\n' "$OC_SERVICE" "$bad"; return 1; fi
  echo "$OC_SERVICE preflight ok: image $img, container $OC_CONTAINER, required vars set ($OC_REQUIRED_VARS)"
}
