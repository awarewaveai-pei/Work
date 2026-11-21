#!/usr/bin/env bash
# T25: sg-deploy.sh's HTTP smoke-check probes must resolve each container's ACTUAL published port
# at runtime (`docker port <container> <internal>/tcp`), not a hardcoded copy of docker-compose.yml's
# default -- an operator override (e.g. NEXT_ADMIN_HOST_PORT; SAME_VPS_STAGING_RUNBOOK.md documents
# NODE_API_HOST_PORT as a live override on staging) would otherwise make the probe test the wrong
# port and either false-negative or, worse, silently pass against nothing. next-admin's probe
# (:461-462 as of 2026-09-26) was still hardcoded to 127.0.0.1:3002; node-api/hci-app/renderer's
# probes were already fixed the same way this test now covers for all four.
#
# Extracts the REAL two-line port-resolution snippet straight out of sg-deploy.sh (never re-typed)
# and runs it in a subshell with a stubbed `docker` on PATH -- no real container, no network call,
# no full sg-deploy.sh run (that needs a git repo + build + deploy pipeline far beyond this concern;
# see sync.test.sh for that heavier, container-only harness, which never reaches this section of the
# script -- every test there stops at an early DEPLOY_HOLD/lock refusal).
set -euo pipefail

SG_DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/sg-deploy.sh"
[[ -f "$SG_DEPLOY" ]] || { echo "sg-deploy.sh not found at $SG_DEPLOY"; exit 2; }

pass=0; failed=0
check() { local d="$1"; shift; if "$@"; then echo "PASS $d"; pass=$((pass + 1)); else echo "FAIL $d"; failed=$((failed + 1)); fi; }

DOCKER_SHIM_DIR="$(mktemp -d)"
trap 'rm -rf "$DOCKER_SHIM_DIR"' EXIT

# Stubs `docker port <container> <port>/tcp` to print $1 (empty = simulate "not found", matching
# the real `docker port` on a stopped/missing container, whose output the script explicitly
# tolerates via `2>/dev/null` + a `${var:-default}` fallback).
stub_docker_port() {
  printf '#!/usr/bin/env bash\nif [[ "$1" == "port" ]]; then echo "%s"; fi\n' "$1" > "$DOCKER_SHIM_DIR/docker"
  chmod +x "$DOCKER_SHIM_DIR/docker"
}

# Pulls the two-line "<var>=$(docker port <container> <port>/tcp ...)" + "<var>=\"\${<var>:-<default>}\""
# pair out of the real script by anchoring on the variable's own assignment line, then evaluates
# just those two lines (docker stubbed) and echoes the resolved value.
resolve_port() {
  local var="$1"
  local snippet
  # hci_app_port/renderer_port live indented inside an `if [[ ... ]]; then` block (node_api_port/
  # next_admin_port do not) -- the leading-whitespace-tolerant anchor covers both shapes.
  snippet="$(grep -A1 "^[[:space:]]*${var}=\\\$(docker port " "$SG_DEPLOY")"
  if [[ -z "$snippet" ]]; then echo "SNIPPET_NOT_FOUND"; return 1; fi
  PATH="$DOCKER_SHIM_DIR:$PATH" bash -c "$snippet"$'\n'"echo \"\$${var}\""
}

t_next_admin_port_follows_docker_port() {
  stub_docker_port "0.0.0.0:19999"
  check "next-admin: resolves the port docker port reports" test "$(resolve_port next_admin_port)" = "19999"
}

t_next_admin_port_falls_back_when_container_not_found() {
  stub_docker_port ""
  check "next-admin: falls back to docker-compose.yml's own default (3002) when docker port finds nothing" \
    test "$(resolve_port next_admin_port)" = "3002"
}

t_node_api_port_follows_docker_port() {
  stub_docker_port "0.0.0.0:19001"
  check "node-api: resolves the port docker port reports (regression: already-fixed probe)" \
    test "$(resolve_port node_api_port)" = "19001"
}

t_node_api_port_falls_back() {
  stub_docker_port ""
  check "node-api: falls back to 3001 when docker port finds nothing" test "$(resolve_port node_api_port)" = "3001"
}

t_hci_app_port_follows_docker_port() {
  stub_docker_port "0.0.0.0:14030"
  check "hci-app: resolves the port docker port reports (regression: already-fixed probe)" \
    test "$(resolve_port hci_app_port)" = "14030"
}

t_renderer_port_follows_docker_port() {
  stub_docker_port "0.0.0.0:13190"
  check "renderer: resolves the port docker port reports (regression: already-fixed probe)" \
    test "$(resolve_port renderer_port)" = "13190"
}

t_oracle_port_follows_docker_port() {
  stub_docker_port "0.0.0.0:13010"
  check "oracle-web: resolves the port docker port reports" test "$(resolve_port oracle_port)" = "13010"
}

t_oracle_port_falls_back() {
  stub_docker_port ""
  check "oracle-web: falls back to 3010 when docker port finds nothing" test "$(resolve_port oracle_port)" = "3010"
}

t_next_admin_probe_url_uses_the_resolved_port() {
  stub_docker_port "0.0.0.0:19999"
  local out
  out="$(PATH="$DOCKER_SHIM_DIR:$PATH" bash -c "$(grep -A3 '^next_admin_port=\$(docker port ' "$SG_DEPLOY" | grep -v '^_smoke_check')"$'\n'"echo \"http://127.0.0.1:\${next_admin_port}/login\"")"
  check "next-admin: the constructed probe URL contains the resolved port, not 3002" grep -q ":19999/login" <<< "$out"
}

t_every_other_hardcoded_127_port_is_only_in_comments() {
  # Regression guard for the class of bug, not just this one instance: every remaining
  # "127.0.0.1:<port>" literal in the file must be inside a comment (a `#`-prefixed line),
  # never live code. Catches a future probe added the same wrong way.
  local offenders
  offenders="$(grep -n '127\.0\.0\.1:[0-9]' "$SG_DEPLOY" | grep -v '^\s*[0-9]*:\s*#' | grep -vE ':[0-9]+:\s*#' | grep -vE ':[0-9]+:[[:space:]]*#' || true)"
  # The two lines this test itself expects (both are comments describing history) must not count
  # as offenders; recompute precisely: a line is an offender only if its CODE portion (before any
  # '#') contains a literal 127.0.0.1:<port>.
  offenders="$(grep -n '127\.0\.0\.1:[0-9]' "$SG_DEPLOY" | while IFS=: read -r lineno rest; do
    code="${rest%%#*}"
    [[ "$code" == *"127.0.0.1:"* ]] && echo "$lineno: $rest"
  done || true)"
  check "no other hardcoded 127.0.0.1:<port> in live code (comments are fine)" test -z "$offenders"
}

t_oracle_smoke_probes_the_public_api() {
  # X1 (2026-11-21): the oracle block probes /api/v1/systems on the resolved port, so a deploy that
  # breaks the public data API (system registry, input specs) fails the smoke instead of shipping.
  local block
  block="$(awk '/^if \[\[ " \$\{APPS\[\*\]\} " =~ " oracle-web " \]\]; then$/,/^fi$/' "$SG_DEPLOY")"
  check "oracle-web: smoke block probes /api/v1/systems on the resolved port"     grep -qF '_smoke_check "oracle-web api v1" "http://127.0.0.1:${oracle_port}/api/v1/systems"' <<< "$block"
  # X2 (2026-11-21): MCP initialize is POSTed, so a deploy that breaks /api/mcp fails the smoke.
  check "oracle-web: smoke block POSTs an MCP initialize on the resolved port"     grep -qF '_smoke_check "oracle-web mcp" "http://127.0.0.1:${oracle_port}/api/mcp" "" "" '"'"'{"jsonrpc":"2.0","id":1,"method":"initialize"' <<< "$block"
  check "_smoke_check: optional 5th arg turns the probe into a JSON POST"     grep -qF 'curl_args+=(-X POST -H "Content-Type: application/json"' "$SG_DEPLOY"
  # A broken initialize still answers HTTP 200 with a JSON-RPC error, so the probe names a body string.
  check "oracle-web: the MCP probe requires protocolVersion in the body"     grep -qF "\"version\":\"1\"}}}' '\"protocolVersion\"'" <<< "$block"
}

t_smoke_check_body_match_fails_a_2xx_with_the_wrong_body() {
  # Run the real _smoke_check against a stub curl: 200 + JSON-RPC error must count as a smoke error,
  # 200 + the expected string must not. `log`, `_smoke_settling` and curl are stubbed.
  local fn out
  fn="$(awk '/^_smoke_check\(\) \{$/,/^\}$/' "$SG_DEPLOY")"
  out="$(bash -c '
    set -euo pipefail
    log() { :; }
    _smoke_settling() { return 1; }
    _smoke_errors=0
    curl() { local o=""; while [[ $# -gt 0 ]]; do if [[ "$1" == "-o" ]]; then o="$2"; fi; shift; done; printf "%s" "$STUB_BODY" > "$o"; printf 200; }
    '"$fn"'
    STUB_BODY="{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32601}}"
    _smoke_check bad http://x "" "" "{}" "\"protocolVersion\""
    bad=$_smoke_errors
    STUB_BODY="{\"result\":{\"protocolVersion\":\"2025-06-18\"}}"
    _smoke_check good http://x "" "" "{}" "\"protocolVersion\""
    _smoke_check plain http://x
    mktemp() { return 1; }
    _smoke_check nomktemp http://x "" "" "{}" "\"protocolVersion\""
    echo "$bad $_smoke_errors"
  ')"
  check "_smoke_check (set -euo pipefail): 200 + JSON-RPC error body and a failing mktemp are smoke errors; matching body and plain GET are not" test "$out" = "1 2"
}

main() {
  local t
  for t in $(declare -F | awk '{print $3}' | grep '^t_'); do "$t"; done
  echo "=== $pass passed, $failed failed ==="
  [[ "$failed" -eq 0 ]]
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
