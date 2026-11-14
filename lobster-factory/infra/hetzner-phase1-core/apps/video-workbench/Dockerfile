# video-workbench image (P6 L5). Build context = this directory plus .awarewave/: the next-admin runtime files
# listed in awarewave-files.txt (paths relative to next-admin), placed there by the deploy step before
# `docker compose build`. A missing or incomplete .awarewave/ fails the build (check below).
FROM node:24.14.0-bookworm-slim

# Blender runtime libs + EGL/Mesa: headless Eevee needs an EGL context; no GPU here, so Mesa llvmpipe renders on CPU.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip xz-utils ffmpeg \
      libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libxkbcommon0 libsm6 \
      libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1 \
    && rm -rf /var/lib/apt/lists/*

# Blender 4.5.9 LTS: URL and SHA-256 come from vendor/blender/sources.json (linux entry; hash from the official .sha256).
COPY vendor/blender/sources.json /tmp/blender-sources.json
RUN set -eu; \
    url="$(node -p "require('/tmp/blender-sources.json').linux.url")"; \
    sha="$(node -p "require('/tmp/blender-sources.json').linux.tarSha256")"; \
    curl -fsSL -o /tmp/blender.tar.xz "$url"; \
    echo "$sha  /tmp/blender.tar.xz" | sha256sum -c -; \
    mkdir -p /opt/blender; \
    tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1; \
    rm -f /tmp/blender.tar.xz /tmp/blender-sources.json

WORKDIR /app
# The editor's fonts (~133 MB, sha256-pinned) in their own layer, before COPY . .: rebuilt only when sources.json or
# the script changes, so a routine deploy neither re-downloads them nor depends on GitHub being reachable.
# .dockerignore keeps any font files in the build context from overwriting this layer.
COPY vendor/fonts/sources.json vendor/fonts/sources.json
COPY scripts/vendor-fonts.cjs scripts/vendor-fonts.cjs
RUN node scripts/vendor-fonts.cjs
COPY . .

# postinstall = vendor-vision.cjs (copies from node_modules, SHA-256 checked) + vendor-ffprobe.cjs (skips off Windows).
# The Craft engines (engines/filmcraft, engines/effectcraft) are not in the image: their pinned builds are served from the
# host's static folder (card FC.4); without them the "專業剪輯／專業特效" cards simply stay hidden.
RUN npm ci --omit=dev \
    && node scripts/vendor-three.cjs
# The editor's fonts (layer above; postinstall finds them in place): preview and export read these files; the image has
# no CJK font of its own. Re-run = verify every file's sha256, so a missing or changed file fails the build.
RUN node scripts/vendor-fonts.cjs

RUN node -e "const fs=require('fs');const miss=require('./backend/appearance.cjs').runtimeFiles('.').filter((f)=>!fs.existsSync('.awarewave/'+f));if(miss.length){console.error('.awarewave/ is missing: '+miss.join(', '));process.exit(1)}"

RUN mkdir -p /data && chown node:node /data
ENV VW_HOST=0.0.0.0 \
    VW_DATA_DIR=/data \
    PORT=4178 \
    FFPROBE_PATH=/usr/bin/ffprobe \
    BLENDER_PATH=/opt/blender/blender
USER node
EXPOSE 4178
CMD ["node", "server.cjs"]
