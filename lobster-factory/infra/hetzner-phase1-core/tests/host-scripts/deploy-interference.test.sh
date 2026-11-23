#!/usr/bin/env bash
# Something else on the host touches the container while sg-deploy.sh / rollback-phase1.sh wait (2026-11-22 09:56Z: a
# next-admin deploy's new container was stopped 2 s after `up`; the deploy called a good build unhealthy, rolled back,
# and logged ROLLBACK_FAILED for a restore that had worked). Real Docker, the STAGING compose path: the host layout
# (/root/Work with an origin, /root/lobster-phase1 with its docker-compose.yml) is rebuilt inside a THROWAWAY docker:cli
# container that drives the local daemon. The app is a stand-in (busybox httpd) deployed as `wordpress` -- the one
# restorable staging app with no pre-build gate -- under the real names lobster-wordpress / lobster-phase1-wordpress,
# so the test refuses to run where one exists that it did not make. From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/deploy-interference.test.sh
# SRC=<scripts dir> runs a mutated copy of the scripts. KEEP=1 leaves everything for inspection. VERBOSE=1 prints the
# deploy output of a failed check.
#   lock  one flock for sg-deploy (snapshot to exit) / rollback restore / safe-infra-patch / the auto-remediation restart;
#         --force skips nothing
#   A     the new container is stopped from outside during the health wait
#   B     the container name does not resolve for a few seconds during the health wait
#   C     the container is removed under the restore's `up`
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:-$HERE/../../scripts}"
R=aw-di-runner
L=aw-di-test
C=lobster-wordpress
pass=0; failed=0
out=""
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); [[ -n "${VERBOSE:-}" ]] && printf '%s\n' "$out" | tail -25; fi; }
no() { ! "$@"; }

if docker inspect "$C" >/dev/null 2>&1 && [[ "$(docker inspect -f "{{index .Config.Labels \"$L\"}}" "$C")" != 1 ]]; then
  echo "refusing: container $C exists and is not a test container"; exit 2; fi
while read -r img; do
  [[ -n "$img" ]] || continue
  [[ "$(docker image inspect -f "{{index .Config.Labels \"$L\"}}" "$img")" == 1 ]] || { echo "refusing: image $img is not a test image"; exit 2; }
done < <(docker images --format '{{.Repository}}:{{.Tag}}' lobster-phase1-wordpress)

teardown() {
  docker rm -f "$C" "$C-away" aw-di-dep "$R" >/dev/null 2>&1
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^lobster-phase1-wordpress:' | xargs -r docker rmi -f >/dev/null 2>&1
  true
}
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

docker run -d --name "$R" -v /var/run/docker.sock:/var/run/docker.sock -v "$(hostpath "$SRC"):/src:ro" docker:cli sleep 3600 >/dev/null
docker exec "$R" sh -c 'apk add --no-cache -q bash coreutils git rsync curl util-linux findutils procps python3 >/dev/null' || { echo "setup failed"; exit 2; }
in_r() { docker exec -i "$R" bash -c "$1"; }

# The stand-in answers on 127.0.0.1:8080 inside its own (network: none) namespace after DELAY seconds; the healthcheck's
# start_period covers that, so "slow" is not "unhealthy". restart: unless-stopped as in the real compose file.
in_r '
set -e
P=lobster-factory/infra/hetzner-phase1-core
git config --global user.email t@example.invalid; git config --global user.name t; git config --global init.defaultBranch main
git init -q --bare /tmp/origin.git; git clone -q /tmp/origin.git /tmp/seed 2>/dev/null
mkdir -p /tmp/seed/$P/scripts; cp -r /src/* /tmp/seed/$P/scripts/
d=/tmp/seed/$P/apps/wordpress; mkdir -p $d/www
printf "FROM busybox:1.36\nLABEL aw-di-test=1\nCOPY . /app\nWORKDIR /app\nCMD [\"sh\", \"/app/run.sh\"]\n" > $d/Dockerfile
printf "sleep \$(cat /app/DELAY)\nexec httpd -f -p 8080 -h /app/www\n" > $d/run.sh
echo ok > $d/www/health; echo 0 > $d/DELAY; echo v1 > $d/VERSION
git -C /tmp/seed add -A; git -C /tmp/seed commit -qm base; git -C /tmp/seed push -q origin HEAD:main
git clone -q /tmp/origin.git /root/Work
S=/root/lobster-phase1
mkdir -p $S/scripts $S/logs $S/apps/wordpress
cp -r /tmp/seed/$P/scripts/. $S/scripts/; chmod +x $S/scripts/*.sh
: > $S/.env
cat > $S/docker-compose.yml <<YML
name: aw-di-test
services:
  # A dependency with another image, as next-admin has node-api and redis: the deploy must compare the new container
  # against the image of wordpress itself, whatever compose lists for the service and its dependencies.
  zz-dep:
    image: busybox:1.36
    container_name: aw-di-dep
    network_mode: "none"
    labels: {aw-di-test: "1"}
    command: ["sleep", "3600"]
  wordpress:
    build: ./apps/wordpress
    depends_on: [zz-dep]
    image: lobster-phase1-wordpress:local
    container_name: lobster-wordpress
    network_mode: "none"
    restart: unless-stopped
    labels: {aw-di-test: "1"}
    healthcheck: {test: ["CMD", "wget", "-q", "-O-", "http://127.0.0.1:8080/health"], interval: 1s, timeout: 1s, retries: 2, start_period: 40s}
YML
# v1 is already running when the tests start, as a previous deploy left it.
rsync -a /root/Work/$P/apps/wordpress/ $S/apps/wordpress/
cd $S && docker compose build -q wordpress >/dev/null 2>&1 && docker compose up -d wordpress >/dev/null 2>&1
for i in $(seq 1 30); do [ "$(docker inspect -f "{{.State.Health.Status}}" lobster-wordpress)" = healthy ] && exit 0; sleep 1; done
echo "v1 never became healthy"; exit 1
' || { echo "world setup failed"; exit 2; }

P=lobster-factory/infra/hetzner-phase1-core
S=/root/lobster-phase1
change() { in_r "echo $2 > /tmp/seed/$P/apps/wordpress/$1 && git -C /tmp/seed commit -qam 'wordpress $1=$2' && git -C /tmp/seed push -q origin HEAD:main && git -C /root/Work pull -q --ff-only origin main"; }
# deploy [-e VAR=value ...] -- <sg-deploy args>
deploy() {
  local -a env=(-e SG_DEPLOY_NOTIFY=0 -e CI_GATE_WAIT_SECONDS=0)
  while [[ "$1" != "--" ]]; do env+=("$1"); shift; done; shift
  docker exec "${env[@]}" "$R" bash $S/scripts/sg-deploy.sh --skip-pull "$@" 2>&1
}
cid() { docker inspect -f '{{.Id}}' "$C" 2>/dev/null; }
version() { docker exec "$C" cat /app/VERSION 2>/dev/null; }
health() { docker inspect -f '{{.State.Health.Status}}' "$C" 2>/dev/null; }
image_id() { docker inspect -f '{{.Image}}' "$C" 2>/dev/null; }
# interfere <commands>: in the background, wait until `up` has started a container other than the current one, give
# the deploy 2 s to begin its health wait, then run the commands in the runner -- plain docker, as a hand-typed
# command or another session's script would (no lock involved).
interfere() {
  docker exec -d "$R" bash -c "
    old='$(cid)'
    for i in \$(seq 1 600); do
      now=\$(docker inspect -f '{{.Id}}|{{.State.Running}}' $C 2>/dev/null)
      [[ -n \"\$now\" && \"\${now%%|*}\" != \"\$old\" && \"\${now##*|}\" == true ]] && break
      sleep 0.2
    done
    sleep 2
    $1" >/dev/null
}
v1_image="$(image_id)"

# ---- lock: every entry point that changes containers meets the same flock ----
docker exec -d "$R" bash $S/scripts/compose-state-lock.sh test-holder 0 sleep 300
sleep 1
out="$(deploy -e SG_DEPLOY_LOCK_WAIT=1 -- --force wordpress)"; rc=$?
check "lock held elsewhere: sg-deploy --force is refused with 75 (rc=$rc)" test "$rc" = 75
check "  ... and names the holder" grep -q 'held by: test-holder' <<<"$out"
in_r "docker tag lobster-phase1-wordpress:local lobster-phase1-wordpress:rollback-locktest"
out="$(docker exec -e ROLLBACK_LOCK_WAIT=1 "$R" bash $S/scripts/rollback-phase1.sh restore wordpress rollback-locktest 2>&1)"; rc=$?
check "lock held elsewhere: rollback restore refuses, nothing changed (rc=$rc)" test "$rc" != 0 -a -n "$(grep 'nothing was changed' <<<"$out")" -a -z "$(grep 'Restoring' <<<"$out")"
in_r "echo old > /tmp/patched; echo new | SAFE_PATCH_LOCK_WAIT=1 bash $S/scripts/safe-infra-patch.sh file /tmp/patched >/dev/null 2>&1"; rc=$?
check "lock held elsewhere: safe-infra-patch refuses, file untouched (rc=$rc)" test "$rc" != 0 -a "$(in_r 'cat /tmp/patched')" = old
in_r "cd $S && ./scripts/compose-state-lock.sh auto-remediate-restart 1 docker compose restart wordpress >/dev/null 2>&1"; rc=$?
check "lock held elsewhere: the auto-remediation restart command exits 75 (rc=$rc)" test "$rc" = 75
in_r "pkill -9 -f 'sleep 30[0]'; docker rmi lobster-phase1-wordpress:rollback-locktest >/dev/null"
in_r "echo new | bash $S/scripts/safe-infra-patch.sh file /tmp/patched >/dev/null 2>&1"; rc=$?
check "holder gone (killed, no cleanup ran): the lock is free again (rc=$rc)" test "$rc" = 0 -a "$(in_r 'cat /tmp/patched')" = new

# ---- A: the new container is stopped from outside during the health wait ----
change VERSION v2; change DELAY 15
interfere "docker stop -t 1 $C"
out="$(deploy -- wordpress)"; rc=$?
check "A: new container stopped from outside -> deploy exits 1 (rc=$rc)" test "$rc" = 1
check "A: ... the reason says so, by container id" grep -Eq "$C \([0-9a-f]{12}\) is not running: status=exited .* -- stopped from outside this deploy" <<<"$out"
check "A: ... never called unhealthy" no grep -q "$C.* unhealthy" <<<"$out"
check "A: ... auto-rollback ran inside the deploy's own lock and restored" test -n "$(grep 'AUTO-ROLLBACK triggered' <<<"$out")" -a -z "$(grep 'ROLLBACK_FAILED' <<<"$out")"
check "A: ... v1 runs again, healthy, from the snapshot image" test "$(version):$(health):$(image_id)" = "v1:healthy:$v1_image"
check "A: ... marker records the reason and zero restore failures" in_r "grep -q 'rollback_failures=0|.*stopped from outside this deploy' $S/.rollback-triggered"

# ---- B: the name does not resolve for a few seconds during the health wait ----
# The subject is the health wait's verdict; the exit code is not checked, because this world has no lobster-next-admin
# and step 7's first line (`docker port lobster-next-admin` under pipefail) ends the script there.
change VERSION v3; change DELAY 10
interfere "docker rename $C $C-away; sleep 4; docker rename $C-away $C"
out="$(deploy -- wordpress)"
check "B: name gone for 4 s mid-wait -> the wait is not cut short as 'no healthcheck'" no grep -q 'assuming OK' <<<"$out"
check "B: ... it waited for the container it started and saw it healthy" grep -q "$C healthy after [0-9]*s (container $(cid | cut -c1-12))" <<<"$out"
check "B: ... v3 runs, healthy" test "$(version):$(health)" = "v3:healthy"

# ---- C: the container is removed under the restore's `up` ----
# A docker wrapper lets the first `compose up` finish, removes the container and reports the daemon's error for it.
tag="$(docker images --format '{{.Tag}}' lobster-phase1-wordpress | grep '^rollback-' | sort | tail -1)"
in_r 'mkdir -p /tmp/shim; real="$(command -v docker)"
cat > /tmp/shim/docker <<SH
#!/bin/bash
if [[ " \$* " == *" up -d "* && ! -e /tmp/shim/fired ]]; then
  touch /tmp/shim/fired
  "$real" "\$@" >/dev/null 2>&1; "$real" rm -f lobster-wordpress >/dev/null 2>&1
  echo "Error response from daemon: No such container: 0123456789ab" >&2; exit 1
fi
exec "$real" "\$@"
SH
chmod +x /tmp/shim/docker'
out="$(in_r "PATH=/tmp/shim:\$PATH bash $S/scripts/rollback-phase1.sh restore wordpress $tag" 2>&1)"; rc=$?
check "C: container removed under the restore's up -> restore still exits 0 (rc=$rc)" test "$rc" = 0
check "C: ... the interference happened and up was retried once" test -n "$(in_r 'ls /tmp/shim/fired')" -a "$(grep -c 'retrying once' <<<"$out")" = 1
check "C: ... judged by the final state: v1 runs, healthy, from the snapshot image" test "$(version):$(health):$(image_id)" = "v1:healthy:$v1_image"

echo "deploy-interference: $pass passed, $failed failed"
[[ $failed -eq 0 ]]
