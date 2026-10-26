# Remotion render service — EU VPS
# Node 20 + Chromium + ffmpeg + CJK fonts
# Memory budget: ~800MB (Chrome headless rendering)

# ── Stage 1: build (includes devDeps for tsc) ─────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc -p tsconfig.server.json

# ── Stage 2: prod deps only ────────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 3: runtime image ─────────────────────────────────────────────────────
FROM node:20-slim

# System packages: Chromium + ffmpeg + CJK fonts + shared libs Chrome needs
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    ca-certificates \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libxext6 \
    libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Chrome wrapper: Docker/root requires --no-sandbox
RUN echo '#!/bin/sh\nexec /usr/bin/chromium --no-sandbox --disable-dev-shm-usage "$@"' \
    > /usr/local/bin/chromium-docker \
    && chmod +x /usr/local/bin/chromium-docker

# Remotion/Puppeteer: use system Chromium wrapper, skip auto-download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV REMOTION_CHROME_EXECUTABLE_PATH=/usr/local/bin/chromium-docker

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY . .

EXPOSE 8733

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8733/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
