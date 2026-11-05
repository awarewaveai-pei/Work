#!/usr/bin/env bash
# Usage: build-one.sh effectcraft|filmcraft   (inside WSL; after prep.sh)
set -euo pipefail
APP="$1"; A="$HOME/awarewave"
source "$HOME/.cargo/env"
WB=$(find "$HOME/.cache/trunk/wasm-bindgen-0.2.129" -name wasm-bindgen -type f | head -1)
WO=$(find "$HOME/.cache/trunk" -name wasm-opt -type f | head -1)
export PATH="$(dirname "$WB"):$(dirname "$WO"):$PATH"
wasm-bindgen --version; wasm-opt --version
if [ "$APP" = filmcraft ]; then export CRAFT_FONTS_DIR="$A/craft-fonts-video" CRAFT_FONTS_REQUIRED=1; fi
cd "$A/$APP-src"
START=$(date +%s)
cargo xtask web
DIST="${CARGO_TARGET_DIR:-target}/web/dist"
ls -la "$DIST"
( cd "$DIST" && find . -type f -print0 | sort -z | xargs -0 sha256sum > "$A/$APP-dist.SHA256SUMS" )
echo "BUILD-OK $APP $(( $(date +%s) - START ))s wasm=$(stat -c%s "$DIST"/*_bg.wasm)"
