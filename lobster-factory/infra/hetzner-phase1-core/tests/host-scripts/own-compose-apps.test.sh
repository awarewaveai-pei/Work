#!/usr/bin/env bash
# own-compose-apps.sh, no Docker needed (a stub `docker` records its arguments). From the repo root:
#   bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/own-compose-apps.test.sh
# Checks the two invariants the 2026-11-20 video-service outage broke:
#   1. every app directory with a Dockerfile has a deploy path: a service of the staging compose, an app in
#      OWN_COMPOSE_APPS (sg-deploy.sh's own-compose path), or a named gap in OWN_COMPOSE_NOT_IN_SG_DEPLOY;
#   2. an app whose spec has an env file is never started without it -- by oc_compose (deploy and rollback-phase1.sh
#      restore alike), never past the preflight with a required variable empty, and by no manual `docker compose`
#      command written in this repository's live docs.
# sg-deploy.sh itself (build, tests in the image, healthy, auto-rollback, its refusals) is own-compose-deploy.test.sh.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CORE="$(cd "$HERE/../.." && pwd)"
REPO="$(cd "$CORE/../../.." && pwd)"
LIB="${LIB:-$CORE/scripts/own-compose-apps.sh}"
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
# Stub docker, appending every call to $T/calls. inspect: $T/labels (absent = "No such object"; $T/inspect-error =
# daemon trouble); ps: $T/ps; compose ... config --images: $T/image; compose ... config: $T/config.
cat > "$T/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_DIR/calls"
case "$1" in
  inspect)
    [[ -f "$STUB_DIR/inspect-error" ]] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    [[ -f "$STUB_DIR/labels" ]] || { echo "Error: No such object: x" >&2; exit 1; }
    cat "$STUB_DIR/labels" ;;
  ps) cat "$STUB_DIR/ps" 2>/dev/null ;;
  compose)
    if [[ " $* " == *" config --images "* ]]; then cat "$STUB_DIR/image" 2>/dev/null
    elif [[ " $* " == *" config "* ]]; then cat "$STUB_DIR/config" 2>/dev/null; fi ;;
esac
exit 0
STUB
chmod +x "$T/bin/docker"
export STUB_DIR="$T" PATH="$T/bin:$PATH" OC_TEST_HOST_ROOT="$T/root"
# shellcheck source=/dev/null
source "$LIB"
no() { ! "$@" >/dev/null 2>&1; }

# ---- 1. every app directory has a deploy path ----
staging_services="$(awk '/^services:/{s=1; next} /^[^ #]/{s=0} s && /^  [a-z0-9-]+:[[:space:]]*$/{sub(/:.*/, ""); sub(/^  /, ""); print}' "$CORE/docker-compose.yml")"
check "staging compose services parsed" grep -qx next-admin <<<"$staging_services"
for d in "$CORE"/apps/*/; do
  app="$(basename "$d")"
  [[ -f "$d/Dockerfile" ]] || continue
  path=""
  grep -qx "$app" <<<"$staging_services" && path="staging compose"
  [[ " $OWN_COMPOSE_APPS " == *" $app "* ]] && path="${path:+$path + }own compose"
  [[ " $OWN_COMPOSE_NOT_IN_SG_DEPLOY " == *" $app "* ]] && path="${path:+$path + }known gap"
  check "apps/$app has exactly one deploy path (${path:-none})" test -n "$path" -a "${path/+/}" = "$path"
done

# ---- 2. each own-compose spec ----
for app in $OWN_COMPOSE_APPS; do
  unset OC_DIR OC_FILE OC_ENV_FILE OC_PROJECT OC_SERVICE OC_CONTAINER OC_IMAGE_REPO OC_REQUIRED_VARS OC_SRC OC_SYNC_DIR OC_TEST OC_SMOKE_URL OC_HEALTH_TIMEOUT
  check "$app: spec exists" own_compose_spec "$app"
  missing=""
  for v in OC_DIR OC_FILE OC_PROJECT OC_SERVICE OC_CONTAINER OC_IMAGE_REPO OC_REQUIRED_VARS OC_SRC OC_TEST OC_SMOKE_URL OC_HEALTH_TIMEOUT; do
    [[ -n "${!v:-}" ]] || missing+=" $v"
  done
  check "$app: every required field set${missing:+ (missing:$missing)}" test -z "$missing"
  check "$app: production paths under /root unless the test variable says otherwise" \
    bash -c "unset OC_TEST_HOST_ROOT; source '$LIB'; own_compose_spec $app; [[ \$OC_DIR == /root/* ]]"
  check "$app: source has a Dockerfile" test -f "$REPO/$OC_SRC/Dockerfile"
  # When the compose file is synced next to the source, the repo copy is the reference for names and variables.
  repo_compose="$REPO/$OC_SRC/$OC_FILE"
  if [[ -n "$OC_SYNC_DIR" ]]; then
    check "$app: repo has $OC_FILE" test -f "$repo_compose"
    check "$app: container_name = $OC_CONTAINER" grep -qE "^\s+container_name:\s*$OC_CONTAINER\s*$" "$repo_compose"
    check "$app: image = $OC_IMAGE_REPO:local" grep -qE "^\s+image:\s*$OC_IMAGE_REPO:local\s*$" "$repo_compose"
    check "$app: service $OC_SERVICE" grep -qE "^  $OC_SERVICE:\s*$" "$repo_compose"
    for v in $OC_REQUIRED_VARS; do
      check "$app: required $v is a variable of the repo compose" grep -qE "^\s+$v:\s*\\\$\{$v\}" "$repo_compose"
    done
  fi

  # oc_compose passes exactly the spec: project, dir, file, and the env file when there is one.
  mkdir -p "$OC_DIR"; : > "$T/calls"
  oc_compose up -d --no-build "$OC_SERVICE"
  want="compose -p $OC_PROJECT --project-directory $OC_DIR -f $OC_DIR/$OC_FILE${OC_ENV_FILE:+ --env-file $OC_DIR/$OC_ENV_FILE} up -d --no-build $OC_SERVICE"
  check "$app: oc_compose runs '$want'" test "$(cat "$T/calls")" = "$want"
  first="$(echo "$OC_REQUIRED_VARS" | cut -d' ' -f1)"
  check "$app: a caller's exported $first never reaches compose" \
    test "$(env "$first=from-shell" bash -c "source '$LIB'; own_compose_spec $app; docker() { printenv $first || echo unset; }; oc_compose x")" = unset

  # Label check.
  rm -f "$T/labels" "$T/ps" "$T/inspect-error"
  check "$app: no container -> allowed (first deploy)" own_compose_check_labels
  echo abc123 > "$T/ps"
  check "$app: no container by that name, but the service runs under another -> refused" no own_compose_check_labels
  rm -f "$T/ps"; touch "$T/inspect-error"
  check "$app: docker cannot answer -> refused, never 'first deploy'" no own_compose_check_labels
  rm -f "$T/inspect-error"
  env_label="${OC_ENV_FILE:+$OC_DIR/$OC_ENV_FILE}"
  echo "$OC_PROJECT|$OC_DIR|$OC_DIR/$OC_FILE|$env_label|$OC_SERVICE" > "$T/labels"
  check "$app: labels equal to the spec -> allowed" own_compose_check_labels
  echo "other|$OC_DIR|$OC_DIR/$OC_FILE|$env_label|$OC_SERVICE" > "$T/labels"
  check "$app: other project -> refused" no own_compose_check_labels
  if [[ -n "$OC_ENV_FILE" ]]; then
    echo "$OC_PROJECT|$OC_DIR|$OC_DIR/$OC_FILE||$OC_SERVICE" > "$T/labels"
    check "$app: container started without $OC_ENV_FILE -> refused" no own_compose_check_labels
  else
    echo "$OC_PROJECT|$OC_DIR|$OC_DIR/$OC_FILE|$OC_DIR/.env|$OC_SERVICE" > "$T/labels"
    check "$app: default .env recorded in the label -> same inputs, allowed" own_compose_check_labels
  fi
  rm -f "$T/labels"

  # Preflight: what compose would actually start (stubbed config output in compose's own layout).
  cfg() {  # <image> <rendered value of every required var>
    echo "$1" > "$T/image"
    { echo "services:"; echo "  $OC_SERVICE:"; echo "    container_name: $OC_CONTAINER"; echo "    environment:"
      for v in $OC_REQUIRED_VARS; do echo "      $v: $2"; done; echo "    image: $1"; } > "$T/config"
  }
  touch "$OC_DIR/$OC_FILE"; [[ -n "$OC_ENV_FILE" ]] && touch "$OC_DIR/$OC_ENV_FILE"
  cfg "$OC_IMAGE_REPO:local" secret
  check "$app: preflight passes on the built image with required vars set" own_compose_preflight
  cfg "$OC_IMAGE_REPO:local" '""'
  check "$app: required var resolving empty -> refused" no own_compose_preflight
  cfg "other-image:latest" secret
  check "$app: compose names another image -> refused (old code would pass as new)" no own_compose_preflight
  cfg "$OC_IMAGE_REPO:local" secret; sed -i "s/container_name: .*/container_name: other/" "$T/config"
  check "$app: another container_name -> refused" no own_compose_preflight
  cfg "$OC_IMAGE_REPO:local" secret; echo 'level=warning msg="The \"X\" variable is not set."' >> "$T/config"
  check "$app: unset-variable warning -> refused" no own_compose_preflight
  if [[ -n "$OC_ENV_FILE" ]]; then
    cfg "$OC_IMAGE_REPO:local" secret; rm -f "$OC_DIR/$OC_ENV_FILE"
    check "$app: env file missing -> refused" no own_compose_preflight
  fi
  rm -f "$T/image" "$T/config"
done

# ---- 3. rollback-phase1.sh restore goes through the same spec ----
mkdir -p "$T/core/scripts"
cp "$CORE/scripts/rollback-phase1.sh" "$LIB" "$T/core/scripts/"
own_compose_spec video-service
mkdir -p "$OC_DIR"; rm -f "$OC_DIR/$OC_ENV_FILE"; : > "$T/calls"
out="$(bash "$T/core/scripts/rollback-phase1.sh" restore video-service rollback-1 2>&1)"; rc=$?
check "restore video-service without .env.video -> refused (rc=$rc)" test "$rc" -ne 0
check "  ... before re-tagging or starting anything" test -z "$(grep -E '^(tag|compose)' "$T/calls")"
touch "$OC_DIR/$OC_ENV_FILE"; : > "$T/calls"
bash "$T/core/scripts/rollback-phase1.sh" restore video-service rollback-1 >/dev/null 2>&1
check "restore video-service re-tags the snapshot" grep -qx 'tag lobster-video-service:rollback-1 lobster-video-service:local' "$T/calls"
check "restore video-service starts it with --env-file" \
  grep -qx "compose -p video-service --project-directory $OC_DIR -f $OC_DIR/docker-compose.video.yml --env-file $OC_DIR/.env.video up -d --no-build video-service" "$T/calls"
own_compose_spec remotion-service; mkdir -p "$OC_DIR"; : > "$T/calls"
bash "$T/core/scripts/rollback-phase1.sh" restore remotion-service rollback-1 >/dev/null 2>&1
check "restore remotion-service starts the render-services project" \
  grep -qx "compose -p render-services --project-directory $OC_DIR -f $OC_DIR/docker-compose.yml up -d --no-build lobster-remotion-service" "$T/calls"

# ---- 4. no manual command in the live docs starts an own-compose app without its env file ----
# History (WORKLOG, handoffs, oracle reports) records what was run, not what to run, and is not rewritten.
for app in $OWN_COMPOSE_APPS; do
  own_compose_spec "$app"; [[ -n "$OC_ENV_FILE" ]] || continue
  bad="$(git -C "$REPO" grep -nE "docker compose.*${OC_FILE//./\\.}" -- . ':!agency-os/WORKLOG*' ':!agency-os/handoffs/' ':!agency-os/reports/' \
        ':!lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/' | grep -v -- "--env-file" || true)"
  check "$app: every 'docker compose ... $OC_FILE' in the docs carries --env-file${bad:+ -- $bad}" test -z "$bad"
done

echo "own-compose-apps: $pass passed, $failed failed"
[[ $failed -eq 0 ]]
