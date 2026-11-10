#!/usr/bin/env bash
# EffectCraft web build — runs inside WSL Ubuntu (Windows Smart App Control blocks locally-compiled
# unsigned exes; see README.md). Usage: bash build.sh <output-base-dir (WSL path)>
# Reads PIN.json beside this script; applies every *.patch beside it; builds with upstream's
# `cargo xtask web` (no Trunk). EffectCraft compiles its fonts in with include_bytes! (no
# CRAFT_FONTS_DIR): the font files tc-fonts.patch names are copied into $SRC/assets/fonts from fonts.json.
# Output: <base>/effectcraft-dist/<rev7>-<inputs7>/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_BASE="${1:?output base dir required}"
PIN="$SCRIPT_DIR/PIN.json"
SRC="$HOME/awarewave/effectcraft-src"
# Own checkout: ~/awarewave/craft-fonts is shared by the vector and canvas builds (one at a time).
FONTS="$HOME/awarewave/craft-fonts-effectcraft"

# pin, checkout, craft_web_fonts, craft_brand_scan; the font list is scripts/craft-web-build/fonts.json.
# shellcheck source=../craft-web-build/lib.sh
source "$SCRIPT_DIR/../craft-web-build/lib.sh"

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
for tool in cargo git python3 sha256sum gzip curl awk; do
  command -v "$tool" >/dev/null || { echo "FATAL: $tool not found — see README.md prerequisites" >&2; exit 1; }
done

REPO=$(pin "['repo']")
REV=$(pin "['rev']")
CF_REPO=$(pin "['craftFontsRepo']")
CF_REV=$(pin "['craftFontsRev']")
WB_VERSION=$(pin "['wasmBindgen']")
WOPT_VERSION=$(pin "['wasmOpt']")
REV7=${REV:0:7}
PATCHES=$(cd "$SCRIPT_DIR" && ls -1 ./*.patch 2>/dev/null | sed 's|^\./||' | sort || true)
# Dist dir identity covers every build input: a font, patch or pin change gets a new directory.
INPUTS7=$( (cat "$PIN" "$CRAFT_WEB_FONTS_JSON" "$CRAFT_WEB_BUILD_DIR/debrand.py"; for p in $PATCHES; do cat "$SCRIPT_DIR/$p"; done) | sha256sum | cut -c1-7)
DIST_NAME="$REV7-$INPUTS7"

# wasm-bindgen CLI must equal the wasm-bindgen crate in Cargo.lock; kept apart from any other on PATH.
WB_ROOT="$HOME/awarewave/tools/wasm-bindgen-$WB_VERSION"
if ! "$WB_ROOT/bin/wasm-bindgen" --version 2>/dev/null | grep -qx "wasm-bindgen $WB_VERSION"; then
  cargo install wasm-bindgen-cli --version "$WB_VERSION" --locked --root "$WB_ROOT"
fi
export PATH="$WB_ROOT/bin:$PATH"
[ "$(wasm-bindgen --version)" = "wasm-bindgen $WB_VERSION" ] || { echo "FATAL: wasm-bindgen on PATH is not $WB_VERSION" >&2; exit 1; }

# wasm-opt: xtask optimizes only when `wasm-opt --version` runs, and silently skips it otherwise. So the
# pinned version (Trunk's cache, PIN wasmOpt) must be there and must run; the xtask log is checked below.
WOPT=$(find "$HOME/.cache/trunk/wasm-opt-$WOPT_VERSION" -name wasm-opt -type f 2>/dev/null | head -1 || true)
[ -n "$WOPT" ] || { echo "FATAL: wasm-opt $WOPT_VERSION not found under ~/.cache/trunk/wasm-opt-$WOPT_VERSION — see README.md prerequisites" >&2; exit 1; }
"$WOPT" --version >/dev/null 2>&1 || { echo "FATAL: $WOPT does not run — the wasm would ship unoptimized" >&2; exit 1; }
export PATH="$(dirname "$WOPT"):$PATH"

checkout_patched "$SRC" "$REPO" "$REV" || { echo "FATAL: cannot check out $REPO at $REV" >&2; exit 1; }
checkout "$FONTS" "$CF_REPO" "$CF_REV" || { echo "FATAL: cannot check out $CF_REPO at $CF_REV" >&2; exit 1; }
WF_TSV=/tmp/awarewave-webfonts-effectcraft.$$.tsv
trap 'rm -f "$WF_TSV"' EXIT
craft_web_fonts "$FONTS" "$WF_TSV"

for p in $PATCHES; do
  git -C "$SRC" apply --check "$SCRIPT_DIR/$p" || { echo "FATAL: $p no longer applies at $REV — rebase the patch (or drop it if upstream has it)" >&2; exit 1; }
  git -C "$SRC" apply "$SCRIPT_DIR/$p"
done
# Translation rows that name ArtCraft/Discord go too (the UI showing them is removed by no-artcraft-marks.patch).
python3 "$CRAFT_WEB_BUILD_DIR/debrand.py" "$SRC" crates/ui-egui/src/i18n.rs crates/ui-egui/src/i18n/ui.rs || exit 1

# The fonts the patched crates/text/src/fonts.rs compiles in that upstream doesn't ship: each one's
# file comes from fonts.json (sha256-checked above), so this is not a second list. checkout --force
# leaves untracked files, so earlier copies are cleared first: a renamed font can't compile a stale file.
git -C "$SRC" clean -fdxq -- assets/fonts
ADDED=""
for rel in $(grep -oE 'include_bytes!\("[^"]*assets/fonts/[^"]+"' "$SRC/crates/text/src/fonts.rs" | grep -oE 'assets/fonts/[^"]+' | sort -u); do
  git -C "$SRC" ls-files --error-unmatch "$rel" >/dev/null 2>&1 && continue
  row=$(awk -F'|' -v f="$(basename "$rel")" '$4 == f { print; exit }' "$WF_TSV")
  [ -n "$row" ] || { echo "FATAL: $rel is compiled in but no fonts.json entry has that file" >&2; exit 1; }
  IFS='|' read -r fam _ dir file _ <<< "$row"
  cp "$FONTS/$dir/$file" "$SRC/$rel"
  ADDED="$ADDED$fam"$'\n'
done
for fam in "Noto Sans TC" "Noto Serif TC"; do
  printf '%s' "$ADDED" | grep -qxF "$fam" || { echo "FATAL: '$fam' is not compiled in — tc-fonts.patch did not take effect" >&2; exit 1; }
done

# xtask follows CARGO_TARGET_DIR; unset, its output is $SRC/target/web/dist and nowhere else. The old
# dist there is moved aside first, so a build that wrote elsewhere cannot ship the previous one.
unset CARGO_TARGET_DIR
DIST="$SRC/target/web/dist"
if [ -e "$DIST" ]; then rm -rf "$DIST.prev" && mv "$DIST" "$DIST.prev"; fi
XLOG=/tmp/awarewave-effectcraft-xtask.$$.log
( cd "$SRC" && cargo xtask web ) 2>&1 | tee "$XLOG"
grep -q '^\$ "wasm-opt"' "$XLOG" || { echo "FATAL: xtask did not run wasm-opt — do not ship" >&2; exit 1; }
rm -f "$XLOG"

# The page, its module, the wasm, and what the page loads beside them: the job/frame workers, the
# audio worklet, the service worker, wasm-bindgen's JS snippets.
for f in index.html effectcraft_web.js effectcraft_web_bg.wasm worker.js audio-worklet.js sw.js; do
  [ -f "$DIST/$f" ] || { echo "FATAL: $f missing from $DIST" >&2; exit 1; }
done
[ -n "$(find "$DIST/snippets" -type f 2>/dev/null | head -1)" ] || { echo "FATAL: snippets/ missing from $DIST" >&2; exit 1; }
WASM="$DIST/effectcraft_web_bg.wasm"
for ps in NotoSansTC-Regular NotoSerifTC-Regular; do
  [ "$(grep -c -a "$ps" "$WASM")" -ge 1 ] || { echo "FATAL: $ps not embedded in effectcraft_web_bg.wasm" >&2; exit 1; }
done
# ArtCraft marks must not ship in a modified build, as files or compiled into the wasm
# (no-artcraft-marks.patch removes the include_bytes!; this proves it, and catches a new one).
craft_brand_scan "$SRC" "$DIST"
# ... and the ArtCraft name / its Discord nowhere in what the site serves (docs/brand/LICENSE-brand.txt).
craft_name_scan "$DIST"

# Assemble in a staging dir, verify, then swap in atomically: a failed build never touches the
# existing dist, and a half-copied tree is never left under the real name.
OUT="$OUT_BASE/effectcraft-dist/$DIST_NAME"
STAGE="$OUT_BASE/effectcraft-dist/.staging-$DIST_NAME.$$"
trap 'rm -f "$WF_TSV"; rm -rf "$STAGE"' EXIT
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -r "$DIST"/. "$STAGE"/
# NOTICE refers the reader to ATTRIBUTION.md for the per-asset list, so that file ships with it.
for f in NOTICE ATTRIBUTION.md LICENSE-MIT LICENSE-APACHE; do
  [ -f "$SRC/$f" ] || { echo "FATAL: $f missing from the upstream checkout" >&2; exit 1; }
  cp "$SRC/$f" "$STAGE/$f"
done
# Each font this build adds ships its licence text beside the app (OFL-1.1 §2).
mkdir -p "$STAGE/licenses"
while IFS= read -r fam; do
  [ -n "$fam" ] || continue
  lic=$(awk -F' [|] ' -v f="$fam" '$1 == f && $2 == "Regular" { print $6; exit }' "$FONTS/fonts/manifest.txt")
  [ -n "$lic" ] && [ -f "$FONTS/$lic" ] || { echo "FATAL: no licence file for embedded font '$fam' in the craft-fonts manifest" >&2; exit 1; }
  cp "$FONTS/$lic" "$STAGE/licenses/$(echo "$fam" | tr ' ' '-')-$(basename "$lic")"
done <<< "$ADDED"
{ echo ""; echo "--- AwareWave build provenance ---"
  echo "storytold/effectcraft @ $REV (MIT OR Apache-2.0)"
  echo "fonts added to the wasm: $(printf '%s' "$ADDED" | paste -sd, - | sed 's/,/, /g') (from storytold/craft-fonts @ $CF_REV and scripts/craft-web-build/fonts.json; OFL-1.1, licence texts in licenses/)"
  echo "local patches: $(echo ${PATCHES:-none}) (scripts/effectcraft-pro/); ArtCraft marks removed (docs/brand/LICENSE-brand.txt)"
  echo "toolchain: $(rustc -V); wasm-bindgen $WB_VERSION; wasm-opt $WOPT_VERSION"
} >> "$STAGE/NOTICE"
gzip -9 -n -k "$STAGE/effectcraft_web_bg.wasm" "$STAGE/effectcraft_web.js"
( cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS && sha256sum -c --quiet SHA256SUMS )
# Same name rebuilt: keep the old dist until the new one is in place.
OLD="$OUT.old.$$"
if [ -e "$OUT" ]; then mv "$OUT" "$OLD"; fi
if ! mv "$STAGE" "$OUT"; then
  if [ -e "$OLD" ]; then mv "$OLD" "$OUT"; fi
  echo "FATAL: could not move $STAGE into place; the previous $OUT is kept" >&2; exit 1
fi
rm -rf "$OLD" || echo "WARN: could not remove $OLD (a file is held open?); the new dist is in place" >&2
trap 'rm -f "$WF_TSV"' EXIT
# The name of the dist this run produced, for build.ps1 (written whole, then moved into place).
printf '%s\n' "$DIST_NAME" > "$OUT_BASE/effectcraft-dist/.latest.$$" && mv -f "$OUT_BASE/effectcraft-dist/.latest.$$" "$OUT_BASE/effectcraft-dist/LATEST"
echo "OK: $OUT ($(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1) total; wasm $(stat -c%s "$OUT/effectcraft_web_bg.wasm") bytes raw, $(stat -c%s "$OUT/effectcraft_web_bg.wasm.gz") bytes gz)"
