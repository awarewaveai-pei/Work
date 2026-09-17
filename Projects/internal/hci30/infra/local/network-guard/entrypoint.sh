#!/bin/sh
# HCI-30 fetch-runner network-guard entrypoint (ADR-0029 gates 2-3).
# Runs once inside the `runner` service's network namespace
# (`network_mode: service:runner` in compose.fetch-runner.yml), installs an
# OUTPUT egress policy, prints it for the verification test to capture, then
# exits. Rules persist in that shared netns for the lifetime of the `runner`
# container even after this container exits -- iptables state lives in the
# kernel network namespace, not in this container's own filesystem/process.
set -eu

MINIO_IP="${HCI_FETCH_RUNNER_MINIO_IP:?network-guard requires the object-storage container's static IP to allowlist}"
API_PORT="${HCI_FETCH_RUNNER_PORT:?network-guard requires the runner's own API port to allowlist on loopback}"

# critic review, 2026-09-17: IPv4-only was the original gap here. This repo
# has already been burned by exactly this bug class on a real host --
# lobster-factory/packages/workflows/src/hosting/providers/hetzner/cloudInit.ts:16-17
# ("ip6tables defaults to ACCEPT, so an IPv4-only INPUT DROP leaves the host
# wide [open]"). compose.fetch-runner.yml sets `enable_ipv6: false` on this
# runner's network so no v6 address should ever be assigned in the first
# place; this is the defense-in-depth backstop in case that assumption ever
# breaks (a future Docker/Compose default change, a misconfigured network
# edit). There is no legitimate v6 egress need here -- DNS is pinned to
# 1.1.1.1/8.8.8.8 over v4 (Dockerfile) and the object-storage peer is
# addressed by a v4 static IP -- so a blanket deny is the whole policy, not
# a mirror of the v4 rule set below.
if command -v ip6tables >/dev/null 2>&1; then
  ip6tables -P OUTPUT DROP
  ip6tables -F OUTPUT
  ip6tables -A OUTPUT -j DROP
  echo "network-guard: ip6tables OUTPUT set to default-deny (no legitimate v6 egress path exists)"
fi

# Default-deny policy as a backstop (critic review, 2026-09-17): the
# unconditional ACCEPT appended at the end of this file is what actually
# implements "egress-only to the public internet" today, but a future edit
# that reorders or drops that line without noticing it was also the default
# policy's only ACCEPT path would silently fail open under the previous
# implicit ACCEPT default. Setting the chain policy to DROP first makes
# "no rule matched" fail closed regardless of ordering mistakes below.
iptables -P OUTPUT DROP

# Reply traffic for any already-permitted flow, checked before every
# per-destination rule below. Required specifically because of loopback:
# real testing found that a request from this netns to its own
# 127.0.0.1:$API_PORT and the matching SERVER REPLY are BOTH "OUTPUT"
# packets on the loopback interface (the reply's own destination port is
# the client's random ephemeral port, not $API_PORT, so a --dport-only
# ACCEPT rule for the API port let requests out but silently dropped every
# reply, hanging the connection with no explicit refusal). A leading
# ESTABLISHED,RELATED accept is the standard fix and also covers reply
# traffic for the DNS/MinIO exceptions below without needing a mirrored
# rule for each one.
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# The one loopback destination allowed to receive a NEW connection: this
# runner's own internal API. Everything else on loopback (ADR-0029 gate 3's
# actual target -- an attacker-supplied fetch reaching some other local
# service) still falls through to the blanket loopback DROP below.
iptables -A OUTPUT -d 127.0.0.1/32 -p tcp --dport "${API_PORT}" -j ACCEPT

# Loopback exception for Docker's embedded DNS resolver (127.0.0.11) --
# kept as a harmless defense-in-depth no-op even though the `runner` service
# is configured (compose.fetch-runner.yml's `dns:` key) to query public
# resolvers (1.1.1.1/8.8.8.8) directly instead of through this proxy. Real
# testing on this machine found Docker Desktop's embedded resolver relays
# upstream through a second hop to an RFC1918-range internal host address
# that a custom bridge network could not reach (timed out even after
# allowlisting that specific address) -- querying a public resolver
# directly sidesteps that Desktop-specific relay entirely and needs no
# RFC1918 exception, since 1.1.1.1/8.8.8.8 are public addresses already
# covered by the default ACCEPT below.
iptables -A OUTPUT -d 127.0.0.11/32 -j ACCEPT

# The one internal peer this runner is allowed to reach today: its own
# dedicated object-storage container (Task 3 provisioning; Task 5 wires the
# client). It is a Docker-bridge (RFC1918) address like everything else this
# script blocks below, so this ACCEPT must be ordered ahead of the general
# RFC1918 DROP rules for the allowlist to have any effect.
iptables -A OUTPUT -d "${MINIO_IP}/32" -j ACCEPT

# ADR-0029 gate 3: cloud metadata endpoint, explicit /32 ahead of the
# broader link-local DROP below (belt and suspenders, same address either
# way).
iptables -A OUTPUT -d 169.254.169.254/32 -j DROP

# ADR-0029 gate 3: link-local (also covers the cloud metadata range
# generically).
iptables -A OUTPUT -d 169.254.0.0/16 -j DROP

# ADR-0029 gate 3: loopback, excluding the embedded-DNS exception above.
iptables -A OUTPUT -d 127.0.0.0/8 -j DROP

# ADR-0029 gates 2 and 3: all three RFC1918 private ranges. This is also
# what makes gate 2 (no route to the docker-internal bridge network) true --
# every other AwareWave service's docker-bridge IP (Supabase, Trigger.dev
# internal, n8n) lives in one of these ranges, same as this runner's own
# compose network.
iptables -A OUTPUT -d 10.0.0.0/8 -j DROP
iptables -A OUTPUT -d 172.16.0.0/12 -j DROP
iptables -A OUTPUT -d 192.168.0.0/16 -j DROP

# Egress-only to the public internet: everything not matched above.
iptables -A OUTPUT -j ACCEPT

echo "network-guard: OUTPUT egress policy applied"
iptables -L OUTPUT -n -v
