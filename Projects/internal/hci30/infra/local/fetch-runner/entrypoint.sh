#!/bin/sh
# HCI-30 fetch-runner entrypoint (ADR-0029 gates 2-3; "Where the egress policy is applied", 2026-09-21).
# Order is the security property: install the OUTPUT egress policy in this container's netns, THEN
# irreversibly drop every privilege able to change it, THEN exec node. Runs on EVERY container start,
# so a restart/recreate/host reboot (new netns, no rules) can never reach node without the policy.
#
# Replaces the one-shot hci-network-guard sidecar: its rules lived in this container's netns but it
# (restart:"no") never re-ran after a runner restart, so fetches silently stopped
# (hci-network-guard "Exited 2 days ago", 2026-09-21). Same rule set, moved here unchanged except
# ip6tables is now mandatory. Same pattern as lobster-factory/infra/hetzner-phase1-core/apps/renderer/entrypoint.sh.
set -eu

MINIO_IP="${HCI_FETCH_RUNNER_MINIO_IP:?fetch runner requires the object-storage container's static IP to allowlist}"
API_PORT="${HCI_FETCH_RUNNER_PORT:-8090}"
READY_FILE=/var/run/network-guard/ready

# `docker restart` keeps the writable layer: remove the previous incarnation's marker before anything
# else, so it can only ever mean "applied in THIS netns".
rm -f "$READY_FILE"

# IPv6: no legitimate path (enable_ipv6:false on the network). Mandatory, not `command -v`-guarded: an
# image without ip6tables must fail to start, not run with v6 at ACCEPT (cloudInit.ts:16-17 bug class).
ip6tables -P OUTPUT DROP
ip6tables -F OUTPUT
ip6tables -A OUTPUT -j DROP
echo "fetch-runner: ip6tables OUTPUT set to default-deny (no legitimate v6 egress path exists)"

# Default-deny first so any ordering mistake below fails closed; flush so a re-run is idempotent.
iptables -P OUTPUT DROP
iptables -F OUTPUT

# Replies. Loopback server replies to our own API are OUTPUT packets to the client's ephemeral port.
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Our own API on loopback (healthcheck, tests).
iptables -A OUTPUT -d 127.0.0.1/32 -p tcp --dport "${API_PORT}" -j ACCEPT
# Docker embedded DNS (unused: resolv.conf below points at public resolvers; kept as harmless no-op).
iptables -A OUTPUT -d 127.0.0.11/32 -j ACCEPT
# The one internal peer: this runner's own object storage. Must precede the RFC1918 DROPs.
iptables -A OUTPUT -d "${MINIO_IP}/32" -j ACCEPT
# Gate 3: metadata, link-local, loopback, RFC1918 (gate 2: every other service's bridge IP is in these).
iptables -A OUTPUT -d 169.254.169.254/32 -j DROP
iptables -A OUTPUT -d 169.254.0.0/16 -j DROP
iptables -A OUTPUT -d 127.0.0.0/8 -j DROP
iptables -A OUTPUT -d 10.0.0.0/8 -j DROP
iptables -A OUTPUT -d 172.16.0.0/12 -j DROP
iptables -A OUTPUT -d 192.168.0.0/16 -j DROP
# Egress-only to the public internet.
iptables -A OUTPUT -j ACCEPT

echo "fetch-runner: OUTPUT egress policy applied"
iptables -L OUTPUT -n -v

# Docker's embedded DNS proxy does not forward on a custom bridge under Docker Desktop (real testing);
# query public resolvers directly. Must happen while still root.
printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /etc/resolv.conf

# Fresh value per start (server.mjs waitForNetworkGuardReady() gates every fetch on this file). Kept as
# defense-in-depth: anything that bypasses this entrypoint (e.g. --entrypoint node) fails closed.
mkdir -p "$(dirname "$READY_FILE")"
cat /proc/sys/kernel/random/uuid > "$READY_FILE"
echo "fetch-runner: ready file written"

# Irreversible: uid/gid node, no supplementary groups, no inheritable caps, EMPTY bounding set,
# no_new_privs. /bin/setpriv must be util-linux (Dockerfile asserts it; busybox's lacks these flags).
# `set -e` above guarantees this is never reached with a partial policy.
exec /bin/setpriv --reuid=node --regid=node --clear-groups \
  --inh-caps=-all --bounding-set=-all --no-new-privs \
  -- node /app/server.mjs
