#!/usr/bin/env bash
# VectorCraft web build — runs inside WSL Ubuntu (Windows Smart App Control blocks
# locally-compiled unsigned exes, so the whole Rust chain lives here; see README.md).
# Usage: bash build.sh <output-base-dir (WSL path, e.g. /mnt/c/Users/x/AppData/Local/awarewave)>
# Reads PIN.json beside this script. Source checkouts live in $HOME/awarewave (WSL ext4:
# building on /mnt/* is ~10x slower through the 9p filesystem).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_BASE="${1:?output base dir required}"
PIN="$SCRIPT_DIR/PIN.json"
SRC="$HOME/awarewave/vectorcraft-src"
FONTS="$HOME/awarewave/craft-fonts"

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
for tool in cargo trunk git python3 sha256sum gzip; do
  command -v "$tool" >/dev/null || { echo "FATAL: $tool not found — see README.md prerequisites" >&2; exit 1; }
done

pin() { python3 -c "import json,sys; d=json.load(open('$PIN')); print(d$1)"; }
REPO=$(pin "['repo']")
REV=$(pin "['rev']")
CF_REPO=$(pin "['craftFontsRepo']")
CF_REV=$(pin "['craftFontsRev']")
TC_URL=$(pin "['notoSansTc']['url']")
TC_SHA=$(pin "['notoSansTc']['sha256']")
TC_FILE=$(pin "['notoSansTc']['file']")
TC_SRC=$(pin "['notoSansTc']['source']")
TC_LIC_FROM=$(pin "['notoSansTc']['licenseFrom']")
TC_LIC_SHA=$(pin "['notoSansTc']['licenseSha256']")
REV7=${REV:0:7}
# Dist dir identity covers EVERY build input, not just the vectorcraft rev: a font or
# patch change with the same rev must get a new directory (C6 keeps the last 2 versions).
INPUTS7=$(cat "$PIN" "$SCRIPT_DIR/web-fonts.patch" "$SCRIPT_DIR/api-addfont.patch" | sha256sum | cut -c1-7)
DIST_NAME="$REV7-$INPUTS7"

checkout() { # checkout <dir> <repo> <rev>
  local dir=$1 repo=$2 rev=$3
  if [ ! -d "$dir/.git" ]; then git clone "$repo" "$dir"; fi
  git -C "$dir" cat-file -e "$rev^{commit}" 2>/dev/null || git -C "$dir" fetch origin
  git -C "$dir" -c advice.detachedHead=false checkout --force --detach "$rev"
  [ "$(git -C "$dir" rev-parse HEAD)" = "$rev" ] || { echo "FATAL: $dir not at $rev" >&2; exit 1; }
}
checkout "$SRC" "$REPO" "$REV"
checkout "$FONTS" "$CF_REPO" "$CF_REV"

# Noto Sans TC (OFL-1.1): download once, verify sha256, licence = craft-fonts' own Noto CJK OFL.
TC_PATH="$FONTS/$TC_FILE"
mkdir -p "$(dirname "$TC_PATH")"
if [ ! -f "$TC_PATH" ] || ! echo "$TC_SHA  $TC_PATH" | sha256sum -c --quiet - 2>/dev/null; then
  curl -sSL -o "$TC_PATH" "$TC_URL"
fi
echo "$TC_SHA  $TC_PATH" | sha256sum -c --quiet - || { echo "FATAL: Noto Sans TC sha256 mismatch" >&2; exit 1; }
echo "$TC_LIC_SHA  $FONTS/$TC_LIC_FROM" | sha256sum -c --quiet - || { echo "FATAL: OFL licence sha256 mismatch" >&2; exit 1; }
cp "$FONTS/$TC_LIC_FROM" "$(dirname "$TC_PATH")/OFL.txt"
ROW="Noto Sans TC | Regular | $TC_FILE | Hant,Latn | OFL-1.1 | $(dirname "$TC_FILE")/OFL.txt | $TC_SHA | $TC_SRC"
grep -qF "Noto Sans TC | Regular" "$FONTS/fonts/manifest.txt" || echo "$ROW" >> "$FONTS/fonts/manifest.txt"

# Patches: web-fonts.txt gets the TC startup face; api.rs gets addFont() (upstream PR pending).
for p in web-fonts.patch api-addfont.patch; do
  git -C "$SRC" apply --check "$SCRIPT_DIR/$p" || { echo "FATAL: $p no longer applies at $REV — rebase the patch" >&2; exit 1; }
  git -C "$SRC" apply "$SCRIPT_DIR/$p"
done

export CRAFT_FONTS_DIR="$FONTS"
( cd "$SRC/apps/vectorcraft-web" && trunk build --release )

TC_SHA16=${TC_SHA:0:16}
DIST="$SRC/dist/web"
[ -f "$DIST/index.html" ] || { echo "FATAL: no index.html in $DIST" >&2; exit 1; }
ls "$DIST"/*.wasm >/dev/null || { echo "FATAL: no .wasm in $DIST" >&2; exit 1; }

# Invariant: the shipped wasm went through wasm-opt (index.html data-wasm-opt="z").
# Proof by idempotence: re-running -Oz on an already-optimized module shrinks it <2%;
# if trunk silently skipped wasm-opt (version change, download failure), the gain is
# large and we FAIL instead of shipping a bloated artifact. (Note: ~87-90MB IS the
# correct optimized size — upstream docs' 17.5MB is stale; official v0.21.0 release
# wasm measures 87.4MB raw.)
WOPT=$(find "$HOME/.cache/trunk" -name wasm-opt -type f 2>/dev/null | head -1)
[ -n "$WOPT" ] || { echo "FATAL: trunk's wasm-opt binary not found under ~/.cache/trunk — cannot prove the wasm was optimized" >&2; exit 1; }
WASM=$(ls "$DIST"/*.wasm | head -1)
"$WOPT" -Oz --enable-reference-types --enable-bulk-memory -o /tmp/wasm-opt-check.wasm "$WASM" || { echo "FATAL: wasm-opt verification run failed on $WASM" >&2; exit 1; }
BEFORE=$(stat -c%s "$WASM"); AFTER=$(stat -c%s /tmp/wasm-opt-check.wasm); rm -f /tmp/wasm-opt-check.wasm
if [ $((BEFORE - AFTER)) -gt $((BEFORE / 50)) ]; then
  echo "FATAL: re-running wasm-opt -Oz shrank the wasm by >2% ($BEFORE -> $AFTER bytes): trunk did NOT run wasm-opt — do not ship" >&2
  exit 1
fi
echo "wasm-opt invariant OK: $BEFORE -> $AFTER bytes on re-opt ($(( (BEFORE - AFTER) * 100 / BEFORE ))% gain, already optimized)"
[ -f "$DIST/fonts/$TC_SHA16/NotoSansTC-Regular.otf" ] || { echo "FATAL: Noto Sans TC missing from dist/fonts/$TC_SHA16" >&2; exit 1; }

# Assemble in a staging dir, verify, then swap in atomically: a failed build never
# touches the existing dist, and a half-copied tree is never left under the real name.
OUT="$OUT_BASE/vectorcraft-dist/$DIST_NAME"
STAGE="$OUT_BASE/vectorcraft-dist/.staging-$DIST_NAME.$$"
trap 'rm -rf "$STAGE"' EXIT
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -r "$DIST"/. "$STAGE"/
cp "$SRC/NOTICE" "$SRC/LICENSE-MIT" "$SRC/LICENSE-APACHE" "$STAGE"/
{ echo ""; echo "--- AwareWave build provenance ---"
  echo "storytold/vectorcraft @ $REV (MIT OR Apache-2.0)"
  echo "storytold/craft-fonts @ $CF_REV (fonts under OFL-1.1, licence beside each font in fonts/)"
  echo "Noto Sans TC Regular added from $TC_SRC (OFL-1.1, sha256 $TC_SHA)"
  echo "local patches: web-fonts.patch, api-addfont.patch (scripts/vectorcraft-pro/)"
} >> "$STAGE/NOTICE"
find "$STAGE" \( -name '*.wasm' -o -name '*.js' -o -name '*.otf' -o -name '*.ttf' \) -exec gzip -k -9 {} \;
( cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS && sha256sum -c --quiet SHA256SUMS )
rm -rf "$OUT" && mv "$STAGE" "$OUT"
trap - EXIT
echo "OK: $OUT ($(find "$OUT" -type f | wc -l) files, wasm $(du -h "$OUT"/*.wasm | cut -f1))"
