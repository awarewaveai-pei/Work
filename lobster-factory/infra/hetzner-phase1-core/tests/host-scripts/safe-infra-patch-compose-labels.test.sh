#!/usr/bin/env bash
# scripts/safe-infra-patch.sh `compose` type, run in a THROWAWAY docker:cli container on the local Docker socket; every
# container it makes carries label aw-sip-test=1 (its own: the host-nginx test cleans up aw-patch-test=1) and project
# names aw-sip-*. From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh
# PATCH=<file> runs a mutated copy.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
PATCH="${PATCH:-$HERE/../../scripts/safe-infra-patch.sh}"
C=aw-sip-runner
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
has() { [[ "$1" == *"$2"* ]]; }

teardown() {
  docker ps -aq --filter label=aw-sip-test=1 | xargs -r docker rm -f >/dev/null 2>&1
  docker rm -f "$C" >/dev/null 2>&1 || true
}
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
P_DIR="$(hostpath "$(cd "$(dirname "$PATCH")" && pwd)")"; P_FILE="$(basename "$PATCH")"

docker run -d --name "$C" -v /var/run/docker.sock:/var/run/docker.sock -v "$P_DIR:/p:ro" docker:cli sleep 3600 >/dev/null
docker exec "$C" sh -c 'apk add --no-cache -q bash coreutils >/dev/null && mkdir -p /root/lobster-phase1 /w/proj' || { echo "setup failed"; exit 2; }

# <value of V> <healthcheck path> -> a one-service compose file; FROM_ENV comes from ${V_SRC}; IMG= overrides the image.
svc() {
  printf 'services:\n  obs:\n    image: %s\n    container_name: aw-sip-obs\n    labels: {aw-sip-test: "1"}\n    command: ["sh", "-c", "touch /ok; sleep 3600"]\n    environment: {V: "%s", FROM_ENV: "${V_SRC}"}\n    healthcheck: {test: ["CMD", "test", "-f", "%s"], interval: 1s, timeout: 1s, retries: 2, start_period: 2s}\n' "${IMG:-alpine:3.20}" "$1" "$2"
}
in_c() { docker exec -i "$C" bash -c "$1"; }
patch() { docker exec -i ${V_SRC:+-e V_SRC="$V_SRC"} "$C" bash /p/"$P_FILE" compose "$@" 2>&1; }   # V_SRC= reaches compose
envof() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' aw-sip-obs | grep "^$1=" | cut -d= -f2-; }

# lobster-phase1 shape: a default docker-compose.yml beside the patched non-default file, and a non-.env env file.
in_c 'printf "services:\n  other:\n    image: alpine:3.20\n    labels: {aw-sip-test: \"1\"}\n    command: [sleep, \"3600\"]\n" > /w/proj/docker-compose.yml
      echo V_SRC=from-custom-env > /w/proj/.env.custom'
svc v1 /ok | in_c 'cat > /w/proj/docker-compose.obs.yml'
in_c 'cd /w/proj && docker compose -p aw-sip-obs -f docker-compose.obs.yml --env-file .env.custom up -d --wait obs >/dev/null 2>&1'
check "baseline V=v1" test "$(envof V)" = v1

out="$(svc v2 /ok | patch /w/proj/docker-compose.obs.yml obs)"; rc=$?
check "non-default file of a running service -> exit 0" test "$rc" = 0
check "change is live" test "$(envof V)" = v2
check "env file reused from the container's labels" test "$(envof FROM_ENV)" = from-custom-env
check "same project, no second one created" \
  test "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' aw-sip-obs):$(docker ps -a --filter label=aw-sip-test=1 --format '{{.Names}}' | grep -c obs)" = "aw-sip-obs:1"
check "the default-file project was never started" test "$(docker ps -a --filter name=proj-other --format x | wc -l)" = 0

before="$(in_c 'sha256sum /w/proj/docker-compose.obs.yml' | cut -d' ' -f1)"
out="$(svc v3 /missing | SAFE_PATCH_HEALTH_TIMEOUT=20 patch /w/proj/docker-compose.obs.yml obs)"; rc=$?
check "unhealthy change -> exit 1" test "$rc" = 1
check "unhealthy change -> file restored byte-identical" test "$(in_c 'sha256sum /w/proj/docker-compose.obs.yml' | cut -d' ' -f1)" = "$before"
check "unhealthy change -> old config running again" test "$(envof V)" = v2

# `compose up` itself fails (the image cannot be pulled): set -e must not skip the rollback.
out="$(IMG=alpine:aw-sip-no-such-tag svc v3b /ok | patch /w/proj/docker-compose.obs.yml obs)"; rc=$?
check "failing compose up -> exit 1" test "$rc" = 1
check "failing compose up -> file restored byte-identical" test "$(in_c 'sha256sum /w/proj/docker-compose.obs.yml' | cut -d' ' -f1)" = "$before"
check "failing compose up -> old config still running" test "$(envof V)" = v2

# TERM while waiting for health (SSH dropped): rollback, not the unverified file left in place.
svc v3c /missing | in_c 'cat > /tmp/v3c.yml'
in_c "SAFE_PATCH_HEALTH_TIMEOUT=60 bash /p/$P_FILE compose /w/proj/docker-compose.obs.yml obs < /tmp/v3c.yml >/tmp/term.out 2>&1 & p=\$!
      sleep 4; kill -TERM \$p; wait \$p; echo \$? > /tmp/term.rc"
check "TERM mid-health -> exit 1" test "$(in_c 'cat /tmp/term.rc')" = 1
check "TERM mid-health -> file restored byte-identical" test "$(in_c 'sha256sum /w/proj/docker-compose.obs.yml' | cut -d' ' -f1)" = "$before"
check "TERM mid-health -> old config running again" test "$(envof V)" = v2

# Created without --env-file (cognitive deploy.sh `docker compose -f ... up -d`): the env-file label is empty.
docker rm -f aw-sip-obs >/dev/null
in_c 'cd /w/proj && V_SRC=from-shell docker compose -p aw-sip-obs -f docker-compose.obs.yml up -d --wait obs >/dev/null 2>&1'
check "baseline without --env-file has an empty env-file label" \
  test -z "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.environment_file"}}' aw-sip-obs)"
out="$(svc v5 /ok | V_SRC=from-shell patch /w/proj/docker-compose.obs.yml obs)"; rc=$?
check "no --env-file at creation -> exit 0, no --env-file passed" test "$rc:$(envof V):$(envof FROM_ENV)" = "0:v5:from-shell"

docker rm -f aw-sip-obs >/dev/null
out="$(svc v4 /ok | patch /w/proj/docker-compose.obs.yml obs)"; rc=$?
check "no container + non-default name -> refused" test "$rc" = 1
check "no container + non-default name -> reason names the loaded file" has "$out" "loads 'docker-compose.yml'"

echo "---"; echo "safe-infra-patch compose labels: $pass passed, $failed failed"
[[ "$failed" == 0 ]]
