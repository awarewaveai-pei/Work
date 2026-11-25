#!/usr/bin/env bash
# A product door moved to its own domain by env alone (ADR 018 §2, K14): the PRODUCTION middleware (edge runtime, built by
# the real Dockerfile) must read PRODUCT_HOST_<KEY> at run time through hosts.ts' dynamic key. vitest runs that code in
# Node and cannot see what the edge build does; `next dev` gets it wrong locally (K15, 2026-11-25), so only a real build
# answers. Same image as production (alpine: ssh2's optional native file is never built, see next.config.ts).
# Usage (from apps/next-admin): bash scripts/check-door-host-env.sh   -- needs docker; exits non-zero on any mismatch.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="door-host-env-check:$$"
BRAND="brand-x.test"
DEFAULT="content.aware-wave.com"           # the content door's default host (products.ts subdomain + default base domain)
PROBE="/api/ops/org-search"                # doors.ts STAFF_DOOR_APIS: served by every door, 401 without a session
STAFF_ONLY="/api/ops/clients"              # a staff API: 404 on any door
PLAIN="door-host-plain-$$"; MOVED="door-host-moved-$$"

cleanup() { docker rm -f "$PLAIN" "$MOVED" >/dev/null 2>&1 || true; docker rmi "$TAG" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker build -q -t "$TAG" --build-arg NEXT_PUBLIC_SUPABASE_URL=http://supabase.invalid --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy . >/dev/null
docker run -d --name "$PLAIN" -p 127.0.0.1::3000 "$TAG" >/dev/null
docker run -d --name "$MOVED" -p 127.0.0.1::3000 -e PRODUCT_HOST_CONTENT="$BRAND" "$TAG" >/dev/null
port() { docker port "$1" 3000/tcp | head -1 | sed 's/.*://'; }
P1=$(port "$PLAIN"); P2=$(port "$MOVED")

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Host: $2" "http://127.0.0.1:$1$3"; }
for p in "$P1" "$P2"; do
  for _ in $(seq 1 60); do [ "$(code "$p" "$DEFAULT" /login)" = 200 ] && break; sleep 1; done
done

fail=0
expect() {   # label port host path want
  local got; got=$(code "$2" "$3" "$4")
  if [ "$got" = "$5" ]; then echo "ok   $1: $3$4 -> $got"; else echo "FAIL $1: $3$4 -> $got (want $5)"; fail=1; fi
}
expect "no env"   "$P1" "$BRAND"   "$PROBE"      404   # not a door
expect "no env"   "$P1" "$DEFAULT" "$PROBE"      401   # the default door answers
expect "env set"  "$P2" "$BRAND"   "$PROBE"      401   # the brand host is the content door
expect "env set"  "$P2" "$BRAND"   "$STAFF_ONLY" 404   # with the door's rules
expect "env set"  "$P2" "$DEFAULT" "$PROBE"      404   # the replaced host stops answering
exit "$fail"
