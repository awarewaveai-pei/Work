#!/usr/bin/env bash
# Validate clickhouse/override.xml by actually starting ClickHouse with it, on a
# disposable container, and asserting the invariants the file is supposed to establish.
#
# WHY THIS EXISTS
# The docker-compose service this replaces ran:
#     clickhouse-server --config-file=... --check-config
# and was dead on both counts: `clickhouse-server` is not on PATH in the bitnami image
# (it lives in /opt/bitnami/clickhouse/bin/), and `--check-config` does not exist in
# ClickHouse 25.7 at all - `--help` lists only `--config-file`. Every invocation printed
# "clickhouse-server: not found" and the documented `| tail` pipeline swallowed the exit
# code, so the gate reported success forever. It was fail-open from the day it was added.
#
# That is not a cosmetic problem. On 2026-08-19 an override.xml edit put the live EU
# container into a crash loop, which this gate was supposed to prevent and did not. There
# is no static validator for ClickHouse config: the only thing that tells you a config is
# good is a server that starts with it. So that is what this does.
#
# WHAT IT ASSERTS (each maps to a real incident - see override.xml for the full accounts)
#   1. the server starts and stays up            2026-08-19 crash loop (BAD_ARGUMENTS)
#   2. every system MergeTree table has a TTL    2026-08-19 unbounded part_log growth
#   3. no retired generator table exists         2026-08-15 / 2026-08-25 config reverts
#   4. no system log table is over-wide          2026-08-25 unmergeable 1,344-col table
#   5. the merge memory budget is in force       2026-08-25 unbounded merge memory
#
# USAGE
#   ./validate-override.sh [override.xml] [env-file] [image-override]
#
# Pass the SAME --env-file the deploy will use; the image is then resolved by docker
# compose itself from that file. The third argument is an escape hatch for deliberately
# testing a different build and should not be used by automation.
# Requires docker and the ClickHouse image. Runs entirely in a throwaway container with
# its own storage: it never touches the trigger stack, its volumes, or its network.
# Exit 0 = safe to deploy. Non-zero = do not deploy; the reason is printed.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERRIDE="${1:-$HERE/override.xml}"

# Defined before anything else: the image-resolution block below is the first thing that can
# fail, and it must fail with a readable message rather than "fail: command not found".
fail() { echo "FAIL: $*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || fail "docker is not available"

# THE IMAGE IS RESOLVED BY DOCKER COMPOSE ITSELF, never re-parsed here.
#
# Validating a config against a different ClickHouse build than the one that will run it is
# worse than not validating at all: the answer looks authoritative and is about the wrong
# software. Three separate versions of this script got that wrong in a row, each time by
# re-implementing a slice of Compose's own resolution rules and each time missing a slice:
# a hard-coded tag ignored the compose default; reading the compose default ignored .env;
# hand-parsing .env ignored Compose's quoting rules and the caller's --env-file. Each fix
# was narrower than the real rule, and every miss degraded to "validate something else and
# report PASS" (codex oracle 2026-08-25 rounds 2 and 3).
#
# The invariant behind all of them: a gate must resolve its inputs with the SAME rule the
# real system uses, or fail loudly when it cannot - never quietly proceed with a guess.
# `docker compose config --images` IS that rule. It applies --env-file, .env, shell
# environment, defaults and interpolation exactly as `docker compose up` would.
COMPOSE_DIR="$HERE/.."
COMPOSE_SERVICE="clickhouse"
ENV_FILE="${2:-}"           # optional; must be the same file the deploy will use
IMAGE_OVERRIDE="${3:-}"     # escape hatch for deliberately testing another build

# Ask compose for THIS SERVICE's image by name. An earlier version listed every image and
# grepped for 'clickhouse', which happened to work only because exactly one image matched -
# a property of today's compose file, not a guarantee. Naming the service removes the
# ambiguity instead of relying on it.
resolve_image() {
    local args=(compose)
    [ -n "$ENV_FILE" ] && args+=(--env-file "$ENV_FILE")
    args+=(config --images "$COMPOSE_SERVICE")
    ( cd "$COMPOSE_DIR" && docker "${args[@]}" 2>/dev/null ) | head -1
}

if [ -n "$IMAGE_OVERRIDE" ]; then
    IMAGE="$IMAGE_OVERRIDE"
else
    IMAGE="$(resolve_image)"
    # No silent fallback. If Compose cannot tell us what it would run, we do not know what to
    # validate, and a guess here is exactly the failure mode this block exists to remove.
    [ -n "$IMAGE" ] || fail "could not resolve the ClickHouse image via 'docker compose config --images' in $COMPOSE_DIR${ENV_FILE:+ (--env-file $ENV_FILE)} - refusing to guess a tag"
fi
case "$IMAGE" in
    *clickhouse*) : ;;
    *) fail "resolved image '$IMAGE' does not look like a ClickHouse image" ;;
esac
NAME="ch-override-validate-$$"
# Width above which a system log table cannot be merged inside the container's memory
# budget. The same number appears as $WIDTH_WARN in scripts/check-clickhouse-health.ps1, but
# they are NOT required to track each other: this one is a gate (blocks a config) and that
# one is an alert (reports a running system). If they ever diverge, the gate being the
# stricter of the two is the safe direction, so treat this as a floor, not a mirror.
WIDTH_LIMIT=200

# Must equal <merges_mutations_memory_usage_soft_limit> in override.xml and the value pinned
# by ../validate-config.ps1 Guardrail 4. See Assertion 5.
EXPECTED_MERGE_BUDGET=1073741824
RETIRED="'trace_log','asynchronous_metric_log','metric_log','query_metric_log','query_thread_log','s3queue_log'"

[ -f "$OVERRIDE" ] || fail "override file not found: $OVERRIDE"

# Fail fast on malformed XML before spending 30s on a container that cannot possibly start.
if command -v python3 >/dev/null 2>&1; then
    python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" "$OVERRIDE" \
        || fail "override.xml is not well-formed XML"
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "validating $OVERRIDE against $IMAGE"
# --memory/--cpus keep the probe from disturbing whatever else runs on this host. No
# volume mount and no network attachment: the container is thrown away with its data.
docker run -d --name "$NAME" --memory 1200m --cpus 0.5 \
    -e CLICKHOUSE_ADMIN_USER=validator \
    -e CLICKHOUSE_ADMIN_PASSWORD=validator-throwaway \
    -v "$(cd "$(dirname "$OVERRIDE")" && pwd)/$(basename "$OVERRIDE")":/bitnami/clickhouse/etc/config.d/override.xml:ro \
    "$IMAGE" >/dev/null

CH="/opt/bitnami/clickhouse/bin/clickhouse client --user validator --password validator-throwaway"

# Assertion 1: the server comes up and stays up. A config the server rejects makes it exit
# during startup, which is the 2026-08-19 failure mode.
ready=""
for _ in $(seq 1 40); do
    if ! docker ps --filter "name=^${NAME}$" --filter status=running -q | grep -q .; then
        echo "--- container log (tail) ---" >&2
        docker logs "$NAME" 2>&1 | tail -25 >&2
        fail "ClickHouse exited during startup - the config was rejected"
    fi
    if docker exec "$NAME" $CH --query "SELECT 1" >/dev/null 2>&1; then ready=yes; break; fi
    sleep 2
done
[ -n "$ready" ] || fail "ClickHouse did not become ready within 80s"

# System log tables are created lazily on first flush, so force one before inspecting them.
docker exec "$NAME" $CH --query "SYSTEM FLUSH LOGS" >/dev/null 2>&1 || true
sleep 4

q() { docker exec "$NAME" $CH --query "$1" 2>/dev/null | head -1; }

# Assertion 2: no system MergeTree table may grow without bound.
no_ttl=$(q "SELECT arrayStringConcat(arraySort(groupArray(name)),',') FROM system.tables WHERE database='system' AND engine='MergeTree' AND position(engine_full,'TTL')=0")
[ -z "$no_ttl" ] || fail "system tables with no TTL: $no_ttl"

# Assertion 3: a retired generator must not be re-enabled by an edit that removes its
# remove="1" line. ClickHouse only creates these tables when the logger is on, so their
# existence in a fresh container is proof the generator is running.
retired=$(q "SELECT arrayStringConcat(arraySort(groupArray(name)),',') FROM system.tables WHERE database='system' AND name IN ($RETIRED)")
[ -z "$retired" ] || fail "retired generator table(s) present: $retired"

# Assertion 4: width. A merge allocates roughly one write buffer per column, so an
# ultra-wide table cannot be merged inside the container's memory cap no matter how few
# rows it holds. metric_log was 1,344 columns.
widest=$(q "SELECT concat(table,':',toString(count())) FROM system.columns WHERE database='system' AND table IN (SELECT name FROM system.tables WHERE database='system' AND engine='MergeTree') GROUP BY table ORDER BY count() DESC LIMIT 1")
widest_cols="${widest##*:}"
if [ -n "$widest_cols" ] && [ "$widest_cols" -ge "$WIDTH_LIMIT" ] 2>/dev/null; then
    fail "system log table too wide: $widest (limit $WIDTH_LIMIT columns)"
fi

# Assertion 5: background merges must have a memory bound, AT THE DERIVED VALUE - not merely
# "some non-zero value". 1 GiB is solved from base RSS (~0.9 GiB) staying under
# max_server_memory_usage (2.5 GiB); 64 MiB or 2 GiB would each break that arithmetic in a
# different direction while passing an "is it non-zero" test. Keep in step with the identical
# assertion in ../validate-config.ps1 (Guardrail 4), which is what catches a change at the
# text level before this ever boots.
budget=$(q "SELECT value FROM system.server_settings WHERE name='merges_mutations_memory_usage_soft_limit'")
[ "${budget:-0}" = "$EXPECTED_MERGE_BUDGET" ] || fail "merges_mutations_memory_usage_soft_limit is '${budget:-unset}', expected $EXPECTED_MERGE_BUDGET (0 means unlimited, which caused the 2026-08-25 incident)"

echo "PASS: server started; every system table has a TTL; no retired generators; widest=$widest; merge budget=$budget"
