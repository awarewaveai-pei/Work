#!/bin/sh
# lobster-renderer entrypoint: install the egress policy, then give up the power to change it, then
# run the server. Same rule set as HCI-30's fetch runner (ADR-0029, Projects/internal/hci30/infra/
# local/fetch-runner/entrypoint.sh) minus its MinIO exception — this container has no internal peer.
#
# The policy is applied by THIS container at every start (HCI-30 moved to the same design on
# 2026-09-21, ADR-0029 Amendment). iptables state lives in the network namespace, and a restarted
# container gets a new one; a one-shot sidecar with restart:"no" never runs again, so after a host
# reboot the policy would be silently gone (observed 2026-09-21: hci-network-guard "Exited 2 days
# ago"). Privilege separation is
# kept by construction instead of by container boundary: `setpriv` below drops to an unprivileged user
# with an EMPTY capability bounding set and no_new_privs before node starts, so neither node nor the
# Chromium it spawns can ever regain NET_ADMIN to undo these rules.
set -eu

PORT="${RENDERER_PORT:-3000}"
RUN_AS="${RENDERER_RUN_AS:-pwuser}"

# IPv6: no legitimate path exists (network has enable_ipv6:false). Blanket deny as the backstop in
# case that assumption ever breaks — the same bug class cloudInit.ts:16-17 records from a real host.
if command -v ip6tables >/dev/null 2>&1; then
  ip6tables -P OUTPUT DROP
  ip6tables -F OUTPUT
fi

# Default-deny FIRST, so any ordering mistake below fails closed.
iptables -P OUTPUT DROP
iptables -F OUTPUT

# Replies to connections we accepted (next-admin -> us) and to egress we allowed.
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Our own API on loopback (the healthcheck runs inside this netns).
iptables -A OUTPUT -d 127.0.0.1/32 -p tcp --dport "$PORT" -j ACCEPT
# Docker's embedded DNS resolver. Without it no hostname resolves at all.
iptables -A OUTPUT -d 127.0.0.11/32 -j ACCEPT

# Everything a hostile page must never reach: cloud metadata, link-local, loopback, every private
# range (every other container on this host lives in one of them), CGNAT. This — not any URL check —
# is what defeats DNS rebinding: the packet is dropped whatever name resolved to it.
iptables -A OUTPUT -d 169.254.169.254/32 -j DROP
iptables -A OUTPUT -d 169.254.0.0/16 -j DROP
iptables -A OUTPUT -d 127.0.0.0/8 -j DROP
iptables -A OUTPUT -d 10.0.0.0/8 -j DROP
iptables -A OUTPUT -d 172.16.0.0/12 -j DROP
iptables -A OUTPUT -d 192.168.0.0/16 -j DROP
iptables -A OUTPUT -d 100.64.0.0/10 -j DROP

# The public internet, and nothing else.
iptables -A OUTPUT -j ACCEPT

echo "renderer: egress policy applied"
iptables -L OUTPUT -n | sed 's/^/  /'

# Irreversible from here on: unprivileged uid/gid, no inheritable/ambient caps, empty bounding set,
# no_new_privs. `set -e` above guarantees this line is never reached with a partial policy.
exec setpriv --reuid="$RUN_AS" --regid="$RUN_AS" --init-groups \
  --inh-caps=-all --bounding-set=-all --no-new-privs \
  -- node /app/server.mjs
