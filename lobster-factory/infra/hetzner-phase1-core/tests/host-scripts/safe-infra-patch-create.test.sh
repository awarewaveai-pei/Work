#!/usr/bin/env bash
# scripts/safe-infra-patch.sh `compose-new` and `host-nginx-new` types, each in a THROWAWAY container (label
# aw-sipc-test=1; compose projects aw-sipc-*): host-nginx-new in nginx:alpine with systemctl stubbed to `nginx -s reload`;
# compose-new in docker:cli on the local Docker socket with a docker shim that logs every argv to /tmp/docker.log.
# From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-create.test.sh
# PATCH=<file> runs a mutated copy.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
PATCH="${PATCH:-$HERE/../../scripts/safe-infra-patch.sh}"
N=aw-sipc-nginx; R=aw-sipc-runner
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
has() { [[ "$1" == *"$2"* ]]; }

teardown() {
  docker ps -aq --filter label=aw-sipc-test=1 | xargs -r docker rm -f >/dev/null 2>&1
  docker volume ls -q --filter label=aw-sipc-test=1 | xargs -r docker volume rm >/dev/null 2>&1
  docker network ls -q --filter name=aw-sipc- | xargs -r docker network rm >/dev/null 2>&1
  true
}
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
P_DIR="$(hostpath "$(cd "$(dirname "$PATCH")" && pwd)")"; P_FILE="$(basename "$PATCH")"

# ── host-nginx-new ────────────────────────────────────────────────────────────
docker run -d --label aw-sipc-test=1 --name "$N" -v "$P_DIR:/p:ro" nginx:alpine >/dev/null
docker exec "$N" sh -c '
  apk add --no-cache -q bash curl openssl coreutils >/dev/null
  mkdir -p /root/lobster-phase1 /etc/nginx/ssl /etc/nginx/sites-available /etc/nginx/sites-enabled
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN=n.test \
    -keyout /etc/nginx/ssl/k.pem -out /etc/nginx/ssl/c.pem 2>/dev/null
  echo "include /etc/nginx/sites-enabled/*;" > /etc/nginx/conf.d/zz-sites.conf
  printf "#!/bin/sh\necho \"\$*\" >> /tmp/systemctl.log\n[ \"\$1 \$2\" = \"reload nginx\" ] && exec nginx -s reload\nexit 1\n" > /usr/local/bin/systemctl
  chmod +x /usr/local/bin/systemctl && nginx -s reload' || { echo "setup failed"; exit 2; }
sleep 1
vhost() {  # <server_name> <location body>
  printf 'server { listen 443 ssl; server_name %s; ssl_certificate /etc/nginx/ssl/c.pem; ssl_certificate_key /etc/nginx/ssl/k.pem;\n  location / { %s }\n}\n' "$1" "$2"
}
in_n() { docker exec "$N" sh -c "$1"; }
body() { docker exec "$N" curl -sk --resolve "$1:443:127.0.0.1" "https://$1/"; }
patch_n() { docker exec -i "$N" bash /p/"$P_FILE" host-nginx-new "$@" 2>&1; }
workers() { in_n 'pgrep -P "$(cat /run/nginx.pid)" | sort | tr "\n" " "'; }
SA=/etc/nginx/sites-available; SE=/etc/nginx/sites-enabled

out="$(vhost n.test 'return 200 "n1";' | patch_n $SA/n.test.conf n.test)"; rc=$?
check "host-nginx-new valid -> exit 0" test "$rc" = 0
check "host-nginx-new valid -> live over https" test "$(body n.test)" = n1
check "host-nginx-new valid -> sites-enabled link points at the file" test "$(in_n "readlink $SE/n.test.conf")" = $SA/n.test.conf

before="$(in_n "sha256sum $SA/n.test.conf" | cut -d' ' -f1)"
out="$(vhost n.test 'return 200 "n2";' | patch_n $SA/n.test.conf n.test)"; rc=$?
check "host-nginx-new on an existing file -> refused" test "$rc" = 1
check "host-nginx-new on an existing file -> reason named" has "$out" "already exists"
check "host-nginx-new on an existing file -> content byte-identical, still serving" \
  test "$(in_n "sha256sum $SA/n.test.conf" | cut -d' ' -f1):$(body n.test)" = "$before:n1"

w_before="$(workers)"; in_n ': > /tmp/systemctl.log'
out="$(vhost b.test 'return 200 "b" ;; nonsense_directive on;' | patch_n $SA/b.test.conf b.test)"; rc=$?
check "host-nginx-new nginx -t failure -> exit 1" test "$rc" = 1
check "host-nginx-new nginx -t failure -> reason logged" has "$out" "nginx -t failed"
check "host-nginx-new nginx -t failure -> file and link gone" \
  test "$(in_n "ls -A $SA $SE | grep -c b.test")" = 0
check "host-nginx-new nginx -t failure -> no reload (same workers, systemctl never called)" \
  test "$(workers)|$(in_n 'cat /tmp/systemctl.log')" = "$w_before|"

# Probe fails after the new config was reloaded: the rollback must reload again so the removed vhost stops serving.
out="$(vhost p.test 'return 500 "pnew";' | patch_n $SA/p.test.conf p.test)"; rc=$?
check "host-nginx-new probe 500 -> exit 1, file and link gone" test "$rc:$(in_n "ls -A $SA $SE | grep -c p.test")" = "1:0"
check "host-nginx-new probe 500 -> reloaded again, new vhost no longer served" test "$(body p.test)" != pnew

# The 443 default server answers any host (the host's placeholder does too): a 2xx alone does not prove the new vhost.
out="$(vhost q.test 'return 200 "q";' | patch_n $SA/q.test.conf n.test)"; rc=$?
check "host-nginx-new file without the probed server_name -> exit 1, removed" \
  test "$rc:$(in_n "ls -A $SA $SE | grep -c q.test")" = "1:0"
check "host-nginx-new file without the probed server_name -> reason named" has "$out" "has no server_name n.test"

out="$(vhost e.test 'return 200 "e";' | patch_n $SA/../conf.d/e.test.conf e.test)"; rc=$?
check "host-nginx-new path with .. out of sites-available -> refused, nothing written" \
  test "$rc:$(in_n 'ls /etc/nginx/conf.d | grep -c e.test')" = "1:0"
out="$(vhost e.test 'return 200 "e";' | patch_n /etc/nginx/conf.d/e2.test.conf e.test)"; rc=$?
check "host-nginx-new path outside sites-available -> refused, nothing written" \
  test "$rc:$(in_n 'ls /etc/nginx/conf.d | grep -c e2.test')" = "1:0"

# ── compose-new ───────────────────────────────────────────────────────────────
docker run -d --label aw-sipc-test=1 --name "$R" -v /var/run/docker.sock:/var/run/docker.sock -v "$P_DIR:/p:ro" docker:cli sleep 3600 >/dev/null
docker exec "$R" sh -c '
  apk add --no-cache -q bash coreutils >/dev/null && mkdir -p /root/lobster-phase1 /w /usr/local/sbin
  printf "#!/bin/sh\necho \"\$*\" >> /tmp/docker.log\nexec /usr/local/bin/docker \"\$@\"\n" > /usr/local/sbin/docker
  chmod +x /usr/local/sbin/docker' || { echo "setup failed"; exit 2; }
svc() {  # <healthcheck path> -> one service with a named volume
  printf 'services:\n  web:\n    image: alpine:3.20\n    labels: {aw-sipc-test: "1"}\n    command: ["sh", "-c", "touch /ok; sleep 3600"]\n    volumes: ["data:/data"]\n    healthcheck: {test: ["CMD", "test", "-f", "%s"], interval: 1s, timeout: 1s, retries: 2, start_period: 2s}\nvolumes:\n  data: {labels: {aw-sipc-test: "1"}}\n' "$1"
}
in_r() { docker exec "$R" sh -c "$1"; }
patch_c() { docker exec -i ${T:+-e SAFE_PATCH_HEALTH_TIMEOUT="$T"} "$R" bash /p/"$P_FILE" compose-new "$@" 2>&1; }
OK=/w/sites/aw-sipc-ok/docker-compose.yml; BAD=/w/sites/aw-sipc-bad/docker-compose.yml

out="$(svc /ok | patch_c $OK web)"; rc=$?
check "compose-new valid -> exit 0" test "$rc" = 0
check "compose-new valid -> service healthy" test "$(docker inspect -f '{{.State.Health.Status}}' aw-sipc-ok-web-1 2>&1)" = healthy
check "compose-new valid -> parent dirs created 0700" test "$(in_r 'stat -c %a /w/sites /w/sites/aw-sipc-ok | tr "\n" " "')" = "700 700 "

before="$(in_r "sha256sum $OK" | cut -d' ' -f1)"; cid="$(docker inspect -f '{{.Id}}' aw-sipc-ok-web-1)"
out="$(svc /missing | patch_c $OK web)"; rc=$?
check "compose-new on an existing file -> refused" test "$rc" = 1
check "compose-new on an existing file -> reason named" has "$out" "already exists"
check "compose-new on an existing file -> content byte-identical, same container running" \
  test "$(in_r "sha256sum $OK" | cut -d' ' -f1):$(docker inspect -f '{{.Id}}:{{.State.Running}}' aw-sipc-ok-web-1)" = "$before:$cid:true"

in_r ': > /tmp/docker.log'
out="$(svc /missing | T=15 patch_c $BAD web)"; rc=$?
check "compose-new unhealthy -> exit 1" test "$rc" = 1
check "compose-new unhealthy -> file and the dir it made gone, /w/sites kept" \
  test "$(in_r "test -e $BAD; echo \$?; test -e /w/sites/aw-sipc-bad; echo \$?; test -d /w/sites; echo \$?" | tr '\n' ' ')" = "1 1 0 "
check "compose-new unhealthy -> containers down" test "$(docker ps -aq --filter label=com.docker.compose.project=aw-sipc-bad | wc -l)" = 0
check "compose-new unhealthy -> named volume kept" test "$(docker volume ls -q --filter name=aw-sipc-bad_data | wc -l)" = 1
downs="$(in_r 'grep -E "(^| )down( |$)" /tmp/docker.log')"
check "compose-new unhealthy -> down called on that file" has "$downs" "-f $BAD down"
check "compose-new unhealthy -> down without -v/--volumes" \
  test -z "$(grep -E '(^| )(-v|--volumes)(=| |$)' <<<"$downs")"

# Rollback kept aw-sipc-bad's volume: a new file for the same project must not mount the old site's data.
out="$(svc /ok | patch_c $BAD web)"; rc=$?
check "compose-new with the project's leftover volume -> refused, file removed" \
  test "$rc:$(in_r "test -e $BAD; echo \$?")" = "1:1"
check "compose-new with leftover volume -> reason named, no container started" \
  test "$(has "$out" "already has volumes" && echo y):$(docker ps -aq --filter label=com.docker.compose.project=aw-sipc-bad | wc -l)" = "y:0"

# Same dir basename elsewhere = same compose project as the running aw-sipc-ok: neither up nor down may touch it.
in_r ': > /tmp/docker.log'
out="$(svc /missing | patch_c /w/other/aw-sipc-ok/docker-compose.yml web)"; rc=$?
check "compose-new into a project that has containers -> refused" test "$rc" = 1
check "compose-new into a project that has containers -> its container untouched, no up/down" \
  test "$(docker inspect -f '{{.Id}}:{{.State.Running}}' aw-sipc-ok-web-1):$(in_r 'grep -cE "(^| )(up|down)( |$)" /tmp/docker.log')" = "$cid:true:0"

echo "---"; echo "safe-infra-patch create: $pass passed, $failed failed"
[[ "$failed" == 0 ]]
