# HCI-30 isolated fetch runner (ADR-0029 gate 1). This image never holds
# NET_ADMIN/NET_RAW -- egress policy is applied from outside by the
# network-guard sidecar sharing this container's network namespace
# (compose.fetch-runner.yml). curl + bind-tools are installed deliberately:
# this container's own network namespace is what network-guard's iptables
# rules apply to, so tests/architecture/fetch-runner-network-isolation.test.ps1
# must probe from inside THIS container, not a separate debug container on
# the same bridge (which would not carry the applied OUTPUT rules). Do not
# strip these tools before Task 13's independent re-verification is done
# depending on them.
FROM node:20-alpine
RUN apk add --no-cache curl bind-tools
WORKDIR /app
COPY server.mjs .
COPY object-storage-client.mjs .
EXPOSE 8090
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD curl -fsS http://127.0.0.1:8090/healthz || exit 1
# Docker's embedded DNS proxy (127.0.0.11, compose's `dns:` key only changes
# its upstream) was found by real testing on this machine to not forward at
# all on a custom bridge network under this Docker Desktop version -- true
# regardless of which upstream it is pointed at. Writing /etc/resolv.conf
# directly (Docker's own generated file says "This file can be edited";
# Engine will not overwrite a manually-edited one) bypasses that broken
# proxy layer entirely and queries the public resolver directly instead.
CMD ["sh", "-c", "printf 'nameserver 1.1.1.1\\nnameserver 8.8.8.8\\n' > /etc/resolv.conf && exec node server.mjs"]
