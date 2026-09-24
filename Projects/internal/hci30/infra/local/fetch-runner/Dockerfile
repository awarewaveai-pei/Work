# HCI-30 isolated fetch runner (ADR-0029 gate 1). Starts as root ONLY so entrypoint.sh can install the
# OUTPUT egress policy in this container's netns on every start; it then drops to `node` with an empty
# capability bounding set and no_new_privs before node runs (ADR-0029 "Where the egress policy is
# applied"). Do not add USER here -- the policy would never apply. curl + bind-tools stay: the isolation
# tests probe from inside THIS netns (tests/architecture/fetch-runner-network-isolation.test.ps1).
FROM node:20-alpine
# setpriv = util-linux build; it replaces busybox's /bin/setpriv, which lacks --reuid/--bounding-set.
# The grep fails the BUILD if that ever stops being true, instead of a crash-looping container.
RUN apk add --no-cache curl bind-tools iptables setpriv \
 && /bin/setpriv --help | grep -q -- '--bounding-set'
WORKDIR /app
COPY server.mjs .
COPY object-storage-client.mjs .
COPY job-store.mjs .
# Task 7: server.mjs now imports these at startup (retrieval/http-html-fetch.mjs
# transitively imports net/pinned-http-client.mjs, which imports net/ssrf-guard.mjs).
# Task 4's own critic review already flagged forgetting this COPY step here.
COPY net/ ./net/
COPY retrieval/ ./retrieval/
COPY content-isolation/ ./content-isolation/
EXPOSE 8090
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD curl -fsS http://127.0.0.1:8090/healthz || exit 1
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod 0755 /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
