#!/usr/bin/env bash
# PhotoCraft web build — runs inside WSL Ubuntu (Windows Smart App Control blocks locally-compiled
# unsigned exes; see README.md). Usage: bash build.sh <output-base-dir (WSL path)>
# Reads PIN.json beside this script; applies every *.patch beside it; builds with upstream's own
# packaging/web/package.sh (wasm gzipped into parts + the boot page), serving our fonts through
# PHOTOCRAFT_WEB_FONTS_DIR. Output: <base>/photocraft-dist/<rev7>-<inputs7>/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_BASE="${1:?output base dir required}"
PIN="$SCRIPT_DIR/PIN.json"
SRC="$HOME/awarewave/photocraft-src"
# Shared with scripts/vectorcraft-pro (same craft-fonts rev today): run the two builds one at a time.
FONTS="$HOME/awarewave/craft-fonts"

# pin, checkout, craft_web_fonts; the font list is scripts/craft-web-build/fonts.json.
# shellcheck source=../craft-web-build/lib.sh
source "$SCRIPT_DIR/../craft-web-build/lib.sh"

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
for tool in cargo git python3 sha256sum gzip curl zip split awk; do
  command -v "$tool" >/dev/null || { echo "FATAL: $tool not found — see README.md prerequisites" >&2; exit 1; }
done

REPO=$(pin "['repo']")
REV=$(pin "['rev']")
CL_REV=$(pin "['craftLibsRev']")
CF_REPO=$(pin "['craftFontsRepo']")
CF_REV=$(pin "['craftFontsRev']")
TRUNK_VERSION=$(pin "['trunk']")
REV7=${REV:0:7}
PATCHES=$(cd "$SCRIPT_DIR" && ls -1 ./*.patch 2>/dev/null | sed 's|^\./||' | sort || true)
# Dist dir identity covers every build input: a font, patch or pin change gets a new directory.
INPUTS7=$( (cat "$PIN" "$CRAFT_WEB_FONTS_JSON"; for p in $PATCHES; do cat "$SCRIPT_DIR/$p"; done) | sha256sum | cut -c1-7)
DIST_NAME="$REV7-$INPUTS7"

# The Trunk upstream CI and release builds use (TRUNK_VERSION in .github/workflows/ci.yml), kept
# apart from any other trunk on PATH. Built from crates.io source (no prebuilt binary).
TRUNK_ROOT="$HOME/awarewave/tools/trunk-$TRUNK_VERSION"
if ! "$TRUNK_ROOT/bin/trunk" --version 2>/dev/null | grep -qx "trunk $TRUNK_VERSION"; then
  cargo install trunk --version "$TRUNK_VERSION" --locked --root "$TRUNK_ROOT"
fi
export PATH="$TRUNK_ROOT/bin:$PATH"
[ "$(trunk --version)" = "trunk $TRUNK_VERSION" ] || { echo "FATAL: trunk on PATH is not $TRUNK_VERSION" >&2; exit 1; }

checkout_patched "$SRC" "$REPO" "$REV"
checkout "$FONTS" "$CF_REPO" "$CF_REV"
WF_TSV=/tmp/awarewave-webfonts.$$.tsv
craft_web_fonts "$FONTS" "$WF_TSV"

# Patches: every *.patch beside this script, in name order. Any craft-libs rev a patch adds must be PIN craftLibsRev (one
# fact, checked rather than copied by hand).
for p in $PATCHES; do
  bad=$(grep -E '^\+.*storytold/craft-libs".*rev = "' "$SCRIPT_DIR/$p" | grep -v "rev = \"$CL_REV\"" || true)
  [ -z "$bad" ] || { echo "FATAL: $p pins craft-libs at a rev other than PIN craftLibsRev $CL_REV:" >&2; echo "$bad" >&2; exit 1; }
  git -C "$SRC" apply --check "$SCRIPT_DIR/$p" || { echo "FATAL: $p no longer applies at $REV — rebase the patch (or drop it if upstream has it)" >&2; exit 1; }
  git -C "$SRC" apply "$SCRIPT_DIR/$p"
done

# Upstream's web CI builds without CRAFT_FONTS_DIR: set, it would embed every craft-fonts face in
# the wasm. Our fonts are served beside the app instead (fetched when first used).
unset CRAFT_FONTS_DIR
PHOTOCRAFT_WEB_FONTS_DIR="$FONTS" "$SRC/packaging/web/package.sh"

VERSION=${PHOTOCRAFT_VERSION:-$(awk '/^\[/ { p = ($0 == "[workspace.package]"); next } p && $1 == "version" { gsub(/[" ]/, "", $3); print $3; exit }' "$SRC/Cargo.toml")}  # as packaging/env.sh
SITE="${CARGO_TARGET_DIR:-$SRC/target}/web-package/photocraft-web-$VERSION"
[ -f "$SITE/index.html" ] && [ -f "$SITE/app/parts.txt" ] && [ -f "$SITE/app/photocraft-web.js" ] || { echo "FATAL: package.sh left no site at $SITE" >&2; exit 1; }

# Every fonts.json face must be in the site with its own bytes, and listed in its manifest.
while IFS='|' read -r FAM STYLE DIR FILE URL SHA REST; do
  echo "$SHA  $SITE/$DIR/$FILE" | sha256sum -c --quiet - || { echo "FATAL: $FAM missing or altered in the site ($DIR/$FILE)" >&2; exit 1; }
  grep -qF "$FAM | $STYLE | $DIR/$FILE" "$SITE/fonts/manifest.txt" || { echo "FATAL: $FAM not in the site's fonts/manifest.txt" >&2; exit 1; }
done < "$WF_TSV"
rm -f "$WF_TSV"

# Invariant: the shipped wasm went through wasm-opt (index.html data-wasm-opt="z", --converge).
# Proof by idempotence: re-running -Oz on an optimized module shrinks it <2%; if trunk skipped
# wasm-opt the gain is large and we FAIL instead of shipping a bloated artifact.
WOPT=$(find "$HOME/.cache/trunk" -name wasm-opt -type f 2>/dev/null | sort | tail -1 || true)
[ -n "$WOPT" ] || { echo "FATAL: trunk's wasm-opt not found under ~/.cache/trunk — cannot prove the wasm was optimized" >&2; exit 1; }
WASM=$(ls "$SRC"/dist/web/*_bg.wasm | head -1)
CHECK=/tmp/wasm-opt-check.$$.wasm
"$WOPT" -Oz --enable-reference-types --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-multivalue \
  -o "$CHECK" "$WASM" || { echo "FATAL: wasm-opt verification run failed on $WASM" >&2; exit 1; }
BEFORE=$(stat -c%s "$WASM"); AFTER=$(stat -c%s "$CHECK"); rm -f "$CHECK"
if [ $((BEFORE - AFTER)) -gt $((BEFORE / 50)) ]; then
  echo "FATAL: re-running wasm-opt -Oz shrank the wasm by >2% ($BEFORE -> $AFTER bytes): trunk did NOT run wasm-opt — do not ship" >&2
  exit 1
fi
echo "wasm-opt invariant OK: $BEFORE -> $AFTER bytes on re-opt ($(( (BEFORE - AFTER) * 100 / BEFORE ))% gain, already optimized)"

# Assemble in a staging dir, verify, then swap in atomically: a failed build never touches the
# existing dist, and a half-copied tree is never left under the real name.
OUT="$OUT_BASE/photocraft-dist/$DIST_NAME"
STAGE="$OUT_BASE/photocraft-dist/.staging-$DIST_NAME.$$"
trap 'rm -rf "$STAGE"' EXIT
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -r "$SITE"/. "$STAGE"/
# Upstream package.sh (since 0.17.0) ships app/photocraft-web.js without the wasm-bindgen snippets
# it imports relative to itself, so the app never starts (issues #10017/#10590; fix = open PR #10248,
# the same copy). Until upstream ships app/snippets this copies them; the check below stays either way.
if [ ! -d "$STAGE/app/snippets" ] && [ -d "$SRC/dist/web/snippets" ]; then cp -r "$SRC/dist/web/snippets" "$STAGE/app/"; fi
# Invariant: every ./snippets/… module the app glue imports is in the site.
for s in $( { grep -oE "\./snippets/[^'\"]+" "$STAGE/app/photocraft-web.js" || true; } | sed 's#^\./##' | sort -u); do
  [ -f "$STAGE/app/$s" ] || { echo "FATAL: app/photocraft-web.js imports ./$s, missing from app/ — the app would never start" >&2; exit 1; }
done
# Caching invariant (nginx, R0-PLAN C2.3): only names that carry a content hash are cached for a
# year — root .js/.wasm and app/*.part-*; everything else revalidates. Trunk's hash is a u64 in hex
# WITHOUT zero padding, so 15 digits happen (b805b3f1c151ed2, 2026-11-06); 12-16 accepted.
for f in "$STAGE"/*.js "$STAGE"/*.wasm "$STAGE"/app/*.part-*; do
  [ -e "$f" ] || continue
  basename "$f" | grep -qE '(-[0-9a-f]{12,16}(_bg)?\.(js|wasm)|-[0-9a-f]{12,16}\.part-[a-z]+)$' || { echo "FATAL: $(basename "$f") lacks a hex content hash — immutable caching would pin it stale" >&2; exit 1; }
done
for f in NOTICE ATTRIBUTION.md LICENSE-APACHE LICENSE-MIT; do
  [ -f "$STAGE/$f" ] || { echo "FATAL: $f missing from the site (package.sh copy_docs)" >&2; exit 1; }
done
{ echo ""; echo "--- AwareWave build provenance ---"
  echo "storytold/photocraft @ $REV (MIT OR Apache-2.0)"
  echo "storytold/craft-libs @ $CL_REV (craft-web-api, craft-web-host; MIT OR Apache-2.0)"
  echo "storytold/craft-fonts @ $CF_REV (fonts under OFL-1.1, licence beside each font in fonts/)"
  echo "extra fonts from scripts/craft-web-build/fonts.json (OFL-1.1 / Apache-2.0, licence beside each in fonts/)"
  echo "local patches: ${PATCHES:-none} (scripts/photocraft-pro/)"
} >> "$STAGE/NOTICE"
( cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS && sha256sum -c --quiet SHA256SUMS )
# Same name rebuilt: keep the old dist until the new one is in place (a failed mv on /mnt/c, e.g.
# a file held open by a preview server, must not leave neither).
OLD="$OUT.old.$$"
if [ -e "$OUT" ]; then mv "$OUT" "$OLD"; fi
if ! mv "$STAGE" "$OUT"; then
  if [ -e "$OLD" ]; then mv "$OLD" "$OUT"; fi
  echo "FATAL: could not move $STAGE into place; the previous $OUT is kept" >&2; exit 1
fi
rm -rf "$OLD"
trap - EXIT
PARTS=$(cat "$OUT"/app/*.part-* | wc -c)
echo "OK: $OUT ($(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1) total; wasm $BEFORE bytes raw, shipped as $PARTS bytes of gzip parts)"
