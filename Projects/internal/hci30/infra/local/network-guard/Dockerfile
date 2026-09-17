# HCI-30 fetch-runner network-guard (ADR-0029 gates 2-3). Applies the OUTPUT
# egress policy inside the `runner` service's own network namespace via
# `network_mode: service:runner` (compose.fetch-runner.yml), then exits. The
# `runner` service itself never holds NET_ADMIN/NET_RAW -- a compromised
# fetch (Task 7, not built yet) cannot flip its own egress rules back off,
# because the container capable of doing that is not the one an attacker
# would be running code inside of.
FROM alpine:3.20
RUN apk add --no-cache iptables
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
