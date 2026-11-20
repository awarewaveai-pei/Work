#!/usr/bin/env bash
# sg-deploy.sh's own-compose path (video-service, remotion-service) for real: the host layout (/root/Work with an origin,
# /root/lobster-phase1, /root/render-services) is rebuilt inside a THROWAWAY docker:cli container that drives the local
# Docker daemon. The two apps are stand-ins (busybox httpd; fake `node`/`python` whose exit code is a file in the
# source), but every container and image carries the real names, so the test refuses to run where one exists that it
# did not make (on ks-aw-01 that would be production). From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/own-compose-deploy.test.sh
# SRC=<scripts dir> runs a mutated copy of the scripts. KEEP=1 leaves everything for inspection.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:-$HERE/../../scripts}"
R=aw-oc-runner
L=aw-oc-test
pass=0; failed=0
out=""
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); [[ -n "${VERBOSE:-}" ]] && printf '%s\n' "$out" | tail -15; fi; }

# Refuse unless every lobster-{video,remotion}-service container/image on this daemon is one this test made.
for n in lobster-video-service lobster-remotion-service; do
  if docker inspect "$n" >/dev/null 2>&1 && [[ "$(docker inspect -f "{{index .Config.Labels \"$L\"}}" "$n")" != 1 ]]; then
    echo "refusing: container $n exists and is not a test container"; exit 2; fi
  while read -r img; do
    [[ -n "$img" ]] || continue
    [[ "$(docker image inspect -f "{{index .Config.Labels \"$L\"}}" "$img")" == 1 ]] || { echo "refusing: image $img is not a test image"; exit 2; }
  done < <(docker images --format '{{.Repository}}:{{.Tag}}' "$n")
done

teardown() {
  docker rm -f lobster-video-service lobster-remotion-service "$R" >/dev/null 2>&1
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^lobster-(video|remotion)-service:' | xargs -r docker rmi -f >/dev/null 2>&1
  true
}
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

# The stand-in services share the runner's network namespace (network_mode: container:aw-oc-runner), so sg-deploy's
# smoke probe on 127.0.0.1:<port> inside the runner reaches them exactly as on the host.
docker run -d --name "$R" -v /var/run/docker.sock:/var/run/docker.sock -v "$(hostpath "$SRC"):/src:ro" docker:cli sleep 3600 >/dev/null
docker exec "$R" sh -c 'apk add --no-cache -q bash coreutils git rsync curl util-linux findutils >/dev/null' || { echo "setup failed"; exit 2; }
in_r() { docker exec -i "$R" bash -c "$1"; }

in_r '
set -e
P=lobster-factory/infra/hetzner-phase1-core
git config --global user.email t@example.invalid; git config --global user.name t; git config --global init.defaultBranch main
git init -q --bare /tmp/origin.git; git clone -q /tmp/origin.git /tmp/seed 2>/dev/null
mkdir -p /tmp/seed/$P/scripts; cp -r /src/* /tmp/seed/$P/scripts/
# Stand-in app: <dir> <port>. TESTS = what the fake test runner exits with; MODE=broken = the server never answers.
mkapp() {
  d=/tmp/seed/$P/apps/$1; mkdir -p $d/bin $d/www $d/test $d/tests
  printf "FROM busybox:1.36\nLABEL aw-oc-test=1\nCOPY bin/ /usr/local/bin/\nCOPY . /app\nWORKDIR /app\nCMD [\"sh\", \"/app/run.sh\"]\n" > $d/Dockerfile
  printf "#!/bin/sh\nexit \$(cat /app/TESTS)\n" > $d/bin/node; cp $d/bin/node $d/bin/python; chmod +x $d/bin/*
  printf "[ \"\$(cat /app/MODE)\" = broken ] && exec sleep 3600\n[ -n \"\${TOKEN-unset}\" ] || exec sleep 3600\nexec httpd -f -p %s -h /app/www\n" $2 > $d/run.sh
  echo ok > $d/www/health; echo 0 > $d/TESTS; echo good > $d/MODE; echo v1 > $d/VERSION
  printf "output/\n" > $d/.gitignore
}
mkapp remotion-service 8733; mkapp video-service 8732
# the repo copy of video-service compose (the host copy below is what runs; rsync never touches it)
cp /dev/null /tmp/seed/$P/apps/video-service/docker-compose.video.yml
git -C /tmp/seed add -A; git -C /tmp/seed commit -qm base; git -C /tmp/seed push -q origin HEAD:main
git clone -q /tmp/origin.git /root/Work
mkdir -p /root/lobster-phase1/scripts /root/lobster-phase1/logs /root/lobster-phase1/apps/video-service /root/render-services
cp -r /tmp/seed/$P/scripts/. /root/lobster-phase1/scripts/; chmod +x /root/lobster-phase1/scripts/*.sh
hc="healthcheck: {test: [\"CMD\", \"wget\", \"-q\", \"-O-\", \"http://127.0.0.1:PORT/health\"], interval: 1s, timeout: 1s, retries: 2, start_period: 2s}"
printf "services:\n  lobster-remotion-service:\n    image: lobster-remotion-service:local\n    container_name: lobster-remotion-service\n    network_mode: \"container:aw-oc-runner\"\n    labels: {aw-oc-test: \"1\"}\n    env_file: remotion.env\n    %s\n" "${hc/PORT/8733}" > /root/render-services/docker-compose.yml
echo RENDER_AUTH_TOKEN=r-secret > /root/render-services/remotion.env
# TOKEN interpolated from .env.video: without that env file it is empty and the stand-in never answers (the outage).
printf "services:\n  video-service:\n    image: lobster-video-service:local\n    container_name: lobster-video-service\n    network_mode: \"container:aw-oc-runner\"\n    labels: {aw-oc-test: \"1\"}\n    environment: {TOKEN: \"\${RENDER_AUTH_TOKEN}\", RENDER_AUTH_TOKEN: \"\${RENDER_AUTH_TOKEN}\", R2_API_TOKEN: \"\${R2_API_TOKEN}\", R2_ACCOUNT_ID: \"\${R2_ACCOUNT_ID}\", R2_VIDEO_PUBLIC_BASE: \"\${R2_VIDEO_PUBLIC_BASE}\"}\n    %s\n" "${hc/PORT/8732}" > /root/lobster-phase1/apps/video-service/docker-compose.video.yml
printf "RENDER_AUTH_TOKEN=secret\nR2_API_TOKEN=t\nR2_ACCOUNT_ID=a\nR2_VIDEO_PUBLIC_BASE=https://x\n" >/root/lobster-phase1/apps/video-service/.env.video
mkdir -p /root/lobster-phase1/apps/video-service/output; echo keep > /root/lobster-phase1/apps/video-service/output/render.mp4
' || { echo "world setup failed"; exit 2; }

P=lobster-factory/infra/hetzner-phase1-core
# change <app> <file> <value>: commit to origin/main and pull into /root/Work (sg-deploy runs with --skip-pull).
change() { in_r "echo $3 > /tmp/seed/$P/apps/$1/$2 && git -C /tmp/seed commit -qam '$1 $2=$3' && git -C /tmp/seed push -q origin HEAD:main && git -C /root/Work pull -q --ff-only origin main"; }
deploy() { docker exec -e SG_DEPLOY_NOTIFY=0 -e CI_GATE_WAIT_SECONDS=0 "$R" bash /root/lobster-phase1/scripts/sg-deploy.sh --skip-pull "$@" 2>&1; }
running_version() { docker exec "$1" cat /app/VERSION 2>/dev/null; }
image_id() { docker inspect -f '{{.Image}}' "$1" 2>/dev/null; }
health() { docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null; }

# ---- remotion-service ----
out="$(deploy remotion-service)"; rc=$?
check "remotion first deploy -> exit 0 (rc=$rc)" test "$rc" = 0
check "  ... runs v1, healthy" test "$(running_version lobster-remotion-service):$(health lobster-remotion-service)" = "v1:healthy"
check "  ... started under project render-services" test "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' lobster-remotion-service)" = render-services
check "  ... recorded in .deployed-commit.remotion-service, not .deployed-commit" \
  in_r 'test -s /root/lobster-phase1/.deployed-commit.remotion-service && test ! -e /root/lobster-phase1/.deployed-commit'
v1_id="$(image_id lobster-remotion-service)"

out="$(deploy --dry-run remotion-service)"; rc=$?
check "dry-run -> exit 0, nothing built" test "$rc:$(grep -c 'docker build' <<<"$out")" = "0:0"

change remotion-service VERSION v2; change remotion-service TESTS 1
out="$(deploy remotion-service)"; rc=$?
check "remotion v2 with failing tests -> exit 1 (rc=$rc)" test "$rc" = 1
check "  ... said why" grep -q 'tests FAILED inside the new image' <<<"$out"
check "  ... v1 still running, same image" test "$(running_version lobster-remotion-service):$(image_id lobster-remotion-service)" = "v1:$v1_id"
check "  ... :local points at v1 again" test "$(docker image inspect -f '{{.Id}}' lobster-remotion-service:local)" = "$v1_id"

change remotion-service TESTS 0; change remotion-service MODE broken
out="$(deploy remotion-service)"; rc=$?
check "remotion v2 that never gets healthy -> exit 1 (rc=$rc)" test "$rc" = 1
check "  ... auto-rollback fired" grep -q 'AUTO-ROLLBACK triggered' <<<"$out"
check "  ... v1 running again and healthy" test "$(running_version lobster-remotion-service):$(image_id lobster-remotion-service):$(health lobster-remotion-service)" = "v1:$v1_id:healthy"
check "  ... rollback marker written" in_r 'grep -q "^ROLLBACK|" /root/lobster-phase1/.rollback-triggered'

change remotion-service MODE good
out="$(deploy remotion-service)"; rc=$?
check "remotion v2 fixed -> exit 0 (rc=$rc), runs v2" test "$rc:$(running_version lobster-remotion-service):$(health lobster-remotion-service)" = "0:v2:healthy"

# Host compose naming another image: `up` would keep the old container and smoke would pass on old code.
in_r 'sed -i "s#image: lobster-remotion-service:local#image: lobster-remotion-service:pinned#" /root/render-services/docker-compose.yml'
v2_id="$(image_id lobster-remotion-service)"
out="$(deploy remotion-service)"; rc=$?
check "host compose names another image -> refused (rc=$rc)" test "$rc" = 1 -a -n "$(grep "uses image 'lobster-remotion-service:pinned'" <<<"$out")"
check "  ... nothing changed" test "$(image_id lobster-remotion-service)" = "$v2_id"
in_r 'sed -i "s#image: lobster-remotion-service:pinned#image: lobster-remotion-service:local#" /root/render-services/docker-compose.yml'

# ---- video-service (rsync + env file) ----
out="$(deploy video-service)"; rc=$?
check "video-service first deploy -> exit 0 (rc=$rc)" test "$rc" = 0
check "  ... started with .env.video (TOKEN set)" test "$(docker exec lobster-video-service printenv TOKEN)" = secret
check "  ... host compose, .env.video and gitignored output/ survived rsync --delete" \
  in_r 'cd /root/lobster-phase1/apps/video-service && grep -q network_mode docker-compose.video.yml && test -f .env.video && test -f output/render.mp4'
check "  ... source synced" in_r 'test "$(cat /root/lobster-phase1/apps/video-service/VERSION)" = v1'

out="$(deploy video-service next-admin)"; rc=$?
check "video-service mixed with a staging app -> refused (rc=$rc)" test "$rc" = 1 -a -n "$(grep 'deploy it alone' <<<"$out")"

in_r 'mv /root/lobster-phase1/apps/video-service/.env.video /tmp/env.video'
change video-service VERSION v2
out="$(deploy video-service)"; rc=$?
check "video-service without .env.video -> refused (rc=$rc)" test "$rc" = 1 -a -n "$(grep '.env.video not found' <<<"$out")"
check "  ... nothing changed (v1 running, source not synced)" \
  test "$(running_version lobster-video-service):$(in_r 'cat /root/lobster-phase1/apps/video-service/VERSION')" = "v1:v1"
in_r 'sed "s/^RENDER_AUTH_TOKEN=.*/RENDER_AUTH_TOKEN=/" /tmp/env.video > /root/lobster-phase1/apps/video-service/.env.video'
out="$(deploy video-service)"; rc=$?
check "video-service with RENDER_AUTH_TOKEN empty in .env.video -> refused (rc=$rc)" \
  test "$rc" = 1 -a -n "$(grep 'RENDER_AUTH_TOKEN resolves empty' <<<"$out")"
check "  ... nothing changed (v1 running)" test "$(running_version lobster-video-service)" = v1
in_r 'mv /tmp/env.video /root/lobster-phase1/apps/video-service/.env.video'

out="$(deploy video-service)"; rc=$?
check "video-service v2 -> exit 0 (rc=$rc), runs v2 with TOKEN" \
  test "$rc:$(running_version lobster-video-service):$(docker exec lobster-video-service printenv TOKEN)" = "0:v2:secret"

# The outage itself: someone restarts it by hand without --env-file. The deploy must refuse, not inherit that.
in_r 'cd /root/lobster-phase1/apps/video-service && docker compose -f docker-compose.video.yml up -d --force-recreate video-service >/dev/null 2>&1'
change video-service VERSION v3
out="$(deploy video-service)"; rc=$?
check "container started without --env-file -> deploy refused (rc=$rc)" test "$rc" = 1 -a -n "$(grep 'own_compose_check_labels refused' <<<"$out")"
# rollback-phase1.sh is the manual way back, and it uses the spec: v2's deploy snapshotted v1.
tag="$(docker images --format '{{.Tag}}' lobster-video-service | grep '^rollback-' | sort | tail -1)"
docker exec "$R" bash /root/lobster-phase1/scripts/rollback-phase1.sh restore video-service "$tag" >/dev/null 2>&1; rc=$?
check "rollback-phase1.sh restore video-service $tag -> exit 0 (rc=$rc), v1 healthy with TOKEN from .env.video" \
  test "$rc:$(running_version lobster-video-service):$(docker exec lobster-video-service printenv TOKEN):$(health lobster-video-service)" = "0:v1:secret:healthy"
out="$(deploy video-service)"; rc=$?
check "after that restore, video-service v3 deploys (rc=$rc)" test "$rc:$(running_version lobster-video-service)" = "0:v3"

echo "own-compose-deploy: $pass passed, $failed failed"
[[ $failed -eq 0 ]]
