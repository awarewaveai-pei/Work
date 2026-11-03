#!/usr/bin/env bash
# scripts/safe-infra-patch.sh `host-nginx` type in a THROWAWAY nginx:alpine container (label
# aw-patch-test=1): a TLS vhost t.test on 443, systemctl stubbed to `nginx -s reload`. From the repo root:
#   MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-host-nginx.test.sh
# PATCH=<file> runs a mutated copy.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
PATCH="${PATCH:-$HERE/../../scripts/safe-infra-patch.sh}"
C=aw-patch-test
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
has() { [[ "$1" == *"$2"* ]]; }

teardown() { docker rm -f "$C" >/dev/null 2>&1 || true; }
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
P_DIR="$(hostpath "$(cd "$(dirname "$PATCH")" && pwd)")"; P_FILE="$(basename "$PATCH")"

docker run -d --label aw-patch-test=1 --name "$C" -v "$P_DIR:/p:ro" nginx:alpine >/dev/null
docker exec "$C" sh -c '
  apk add --no-cache -q bash curl openssl coreutils >/dev/null
  mkdir -p /root/lobster-phase1 /etc/nginx/ssl /srv
  head -c 20000 /dev/zero > /srv/big
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN=t.test \
    -keyout /etc/nginx/ssl/k.pem -out /etc/nginx/ssl/c.pem 2>/dev/null
  printf "#!/bin/sh\n[ \"\$1 \$2\" = \"reload nginx\" ] && exec nginx -s reload\nexit 1\n" > /usr/local/bin/systemctl
  chmod +x /usr/local/bin/systemctl' || { echo "setup failed"; exit 2; }
vhost() {  # <location body> -> a complete vhost
  printf 'server { listen 443 ssl; server_name t.test; ssl_certificate /etc/nginx/ssl/c.pem; ssl_certificate_key /etc/nginx/ssl/k.pem;\n  location / { %s }\n}\n' "$1"
}
vhost 'return 200 "v1";' | docker exec -i "$C" sh -c 'cat > /etc/nginx/conf.d/t.conf && nginx -s reload'
sleep 1
body() { docker exec "$C" curl -sk --resolve t.test:443:127.0.0.1 https://t.test/; }
patch() { docker exec -i "$C" bash /p/"$P_FILE" host-nginx "$@" 2>&1; }
sum() { docker exec "$C" sha256sum /etc/nginx/conf.d/t.conf | cut -d' ' -f1; }

check "baseline serves v1" test "$(body)" = v1

out="$(vhost 'return 200 "v2";' | patch /etc/nginx/conf.d/t.conf t.test)"; rc=$?
check "valid change -> exit 0" test "$rc" = 0
check "valid change is live after reload" test "$(body)" = v2
check "backup kept outside /etc/nginx (whole-dir includes would load it)" \
  test "$(docker exec "$C" sh -c 'ls /etc/nginx/conf.d | grep -c safe-patch; ls /root/lobster-phase1/safe-patch-backups | grep -c "_etc_nginx_conf.d_t.conf.safe-patch-"')" = "$(printf '0\n1')"

before="$(sum)"
out="$(vhost 'return 200 "v3" ;; nonsense_directive on;' | patch /etc/nginx/conf.d/t.conf t.test)"; rc=$?
check "syntax error -> exit 1" test "$rc" = 1
check "syntax error -> reason logged" has "$out" "nginx -t failed"
check "syntax error -> file restored byte-identical" test "$(sum)" = "$before"
check "syntax error -> old config still serving" test "$(body)" = v2

out="$(vhost 'return 500;' | patch /etc/nginx/conf.d/t.conf t.test)"; rc=$?
check "vhost answering 500 -> exit 1" test "$rc" = 1
check "vhost answering 500 -> probe named" has "$out" "returned 500"
check "vhost answering 500 -> rolled back and reloaded" test "$(body)" = v2

docker exec "$C" sh -c 'echo keep > /tmp/outside.conf'
out="$(echo 'x' | patch /tmp/outside.conf t.test)"; rc=$?
check "file outside /etc/nginx -> refused" test "$rc" = 1
check "file outside /etc/nginx -> restored" test "$(docker exec "$C" cat /tmp/outside.conf)" = keep

out="$(vhost 'return 200 "v4";' | patch /etc/nginx/conf.d/t.conf)"; rc=$?
check "no vhost to probe -> refused, nothing applied" test "$rc:$(body)" = "1:v2"

# An API gateway answers 401 at / (supabase.aware-wave.com, 2026-11-03): probe an open path given as vhost/path.
gw='server { listen 443 ssl; server_name t.test; ssl_certificate /etc/nginx/ssl/c.pem; ssl_certificate_key /etc/nginx/ssl/k.pem;\n  location = /open { return 200 "gw"; }\n  location / { return 401; }\n}\n'
out="$(printf "$gw" | patch /etc/nginx/conf.d/t.conf t.test)"; rc=$?
check "gateway probed at / (401) -> exit 1, rolled back" test "$rc:$(body)" = "1:v2"
out="$(printf "$gw" | patch /etc/nginx/conf.d/t.conf t.test/open)"; rc=$?
check "gateway probed at vhost/open (200) -> exit 0" test "$rc" = 0

# A change nginx -t accepts but the running master refuses (a limit_req zone whose key changed, 2026-11-01): HUP is
# delivered, exit 0, the old workers stay. The patch must see the kept workers, fail, and restore.
zone() {
  printf 'limit_req_zone %s zone=aw_t:1m rate=10r/s;\n' "$1"
  printf 'server { listen 443 ssl; server_name t.test; ssl_certificate /etc/nginx/ssl/c.pem; ssl_certificate_key /etc/nginx/ssl/k.pem;\n  location /big { root /srv; limit_rate 2k; limit_rate_after 0; }\n  location / { limit_req zone=aw_t burst=5 nodelay; return 200 "vz"; }\n}\n'
}
out="$(zone '$binary_remote_addr' | patch /etc/nginx/conf.d/t.conf t.test)"; rc=$?
check "zone introduced -> exit 0 and live" test "$rc:$(body)" = "0:vz"
before="$(sum)"
# A worker of an earlier reload still draining a slow download, exiting inside the 10 s window: its PID leaving must
# not read as "the workers changed" (critic 2026-11-01 round 2 M1).
docker exec -d "$C" sh -c 'curl -sk --resolve t.test:443:127.0.0.1 https://t.test/big -o /dev/null'
sleep 1; docker exec "$C" nginx -s reload; sleep 1
out="$(zone '$server_name' | patch /etc/nginx/conf.d/t.conf t.test)"; rc=$?
check "zone key change (nginx -t passes, master refuses the reload) -> exit 1" test "$rc" = 1
check "zone key change -> reason names the kept workers" has "$out" "kept its old workers"
check "zone key change -> file restored byte-identical" test "$(sum)" = "$before"
check "zone key change -> old config still serving" test "$(body)" = vz

echo "---"; echo "safe-infra-patch host-nginx: $pass passed, $failed failed"
[[ "$failed" == 0 ]]
