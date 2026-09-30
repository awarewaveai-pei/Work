#!/usr/bin/env bash
# Real nginx syntax/behavior test for the consolidated host vhost. Uses a throwaway container.
# From repo root: MSYS_NO_PATHCONV=1 bash lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/sg-stack-hsts.test.sh
# CONF=<file> tests a mutated copy.
set -uo pipefail
export MSYS_NO_PATHCONV=1

HERE="$(cd "$(dirname "$0")" && pwd)"
CONF="${CONF:-$HERE/../../nginx/system-sites/sg-stack.aware-wave.com.conf}"
C=aw-sg-stack-hsts-test
pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }
teardown() { docker rm -f "$C" >/dev/null 2>&1 || true; }
teardown; [[ "${KEEP:-}" == 1 ]] || trap teardown EXIT
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

CONF_DIR="$(hostpath "$(cd "$(dirname "$CONF")" && pwd)")"
CONF_FILE="$(basename "$CONF")"
docker run -d --label aw-hsts-test=1 --name "$C" -v "$CONF_DIR:/src:ro" nginx:alpine >/dev/null
docker exec -e "CONF_FILE=$CONF_FILE" "$C" sh -c '
  apk add --no-cache -q curl openssl >/dev/null
  mkdir -p /etc/nginx/snippets /etc/letsencrypt/live/aware-wave.com
  printf "allow 127.0.0.1;\ndeny all;\n" > /etc/nginx/snippets/cf-only.conf
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN=app.aware-wave.com \
    -keyout /etc/letsencrypt/live/aware-wave.com/privkey.pem \
    -out /etc/letsencrypt/live/aware-wave.com/fullchain.pem 2>/dev/null
  printf "ssl_protocols TLSv1.2 TLSv1.3;\n" > /etc/letsencrypt/options-ssl-nginx.conf
  rm -f /etc/nginx/conf.d/default.conf
  cp "/src/$CONF_FILE" /etc/nginx/conf.d/sg-stack.conf
  nginx -t >/tmp/nginx-test.out 2>&1 && nginx -s reload
' || { docker exec "$C" cat /tmp/nginx-test.out 2>/dev/null || true; echo "setup failed"; exit 2; }

app_headers="$(docker exec "$C" curl -skI --resolve app.aware-wave.com:443:127.0.0.1 https://app.aware-wave.com/)"
api_headers="$(docker exec "$C" curl -skI --resolve api.aware-wave.com:443:127.0.0.1 https://api.aware-wave.com/)"
http_headers="$(docker exec "$C" curl -sI --resolve app.aware-wave.com:80:127.0.0.1 http://app.aware-wave.com/probe)"

has_exact_line() { printf '%s' "$1" | tr -d '\r' | grep -Fxq "$2"; }
has_header() { printf '%s' "$1" | tr -d '\r' | grep -qi "^$2:"; }
lacks_header() { ! has_header "$1" "$2"; }

check "app HTTPS emits bounded HSTS" has_exact_line "$app_headers" "Strict-Transport-Security: max-age=31536000"
check "shared api host does not inherit app HSTS" lacks_header "$api_headers" Strict-Transport-Security
check "HTTP redirects to the same HTTPS host/path" has_exact_line "$http_headers" "Location: https://app.aware-wave.com/probe"

echo "---"
echo "sg-stack HSTS: $pass passed, $failed failed"
[[ "$failed" == 0 ]]
