# lobster-renderer: pinned by digest, the same risk class this repo already pins ClickHouse and
# hci-object-storage against — the image runs attacker-controlled pages. playwright-core in
# package.json MUST equal this tag's version: the browser build is baked into the image.
FROM mcr.microsoft.com/playwright:v1.60.0-noble@sha256:9bd26ad900bb5e0f4dee75839e957a89ae89c2b7ab1e76050e559790e946b948

# iptables for entrypoint.sh's egress policy; setpriv ships in util-linux (already in the base).
RUN apt-get update \
 && apt-get install -y --no-install-recommends iptables \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY lib.mjs server.mjs entrypoint.sh ./
RUN chmod 0755 entrypoint.sh

ENV HOME=/home/pwuser \
    RENDERER_PORT=3000 \
    NODE_ENV=production
EXPOSE 3000

# Starts as root ONLY to install the egress policy; entrypoint.sh drops to pwuser with an empty
# capability bounding set before node runs. Do not add USER here — the policy would never apply.
ENTRYPOINT ["/app/entrypoint.sh"]
