# Production image for app/server.mjs (2026-09-18, prod-deploy prep). At repo root, not under
# app/, because server.mjs imports sibling directories with relative paths (../packages/contracts,
# ../packages/intelligence, ../public-intelligence/*) -- the build context must be THIS directory
# (Projects/internal/hci30/), not app/ alone, or those imports would have nothing to resolve
# against inside the image. Build with:
#   docker build -f Projects/internal/hci30/Dockerfile -t hci30-app Projects/internal/hci30
#
# packages/ and public-intelligence/ have zero npm dependencies of their own (verified via grep,
# 2026-09-18: only node: builtins imported) -- only app/'s package.json needs `npm install`.
FROM node:20-alpine AS deps
WORKDIR /build/app
COPY app/package.json app/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs hciapp

COPY --from=deps /build/app/node_modules ./app/node_modules
COPY app/package.json ./app/package.json
COPY app/server.mjs ./app/server.mjs
COPY app/public ./app/public
COPY packages ./packages
COPY public-intelligence ./public-intelligence

USER hciapp
EXPOSE 4030
WORKDIR /app/app

CMD ["node", "server.mjs"]
