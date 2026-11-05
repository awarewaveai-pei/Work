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
PATCHES="web-fonts.patch api-addfont.patch api-settheme.patch"

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
for tool in cargo trunk git python3 sha256sum gzip; do
  command -v "$tool" >/dev/null || { echo "FATAL: $tool not found — see README.md prerequisites" >&2; exit 1; }
done

pin() { python3 -c "import json,sys; d=json.load(open('$PIN')); print(d$1)"; }
REPO=$(pin "['repo']")
REV=$(pin "['rev']")
CF_REPO=$(pin "['craftFontsRepo']")
CF_REV=$(pin "['craftFontsRev']")
REV7=${REV:0:7}
# Dist dir identity covers EVERY build input, not just the vectorcraft rev: a font, patch or
# receiver change with the same rev must get a new directory (C6 keeps the last 2 versions).
INPUTS7=$(cat "$PIN" $(for p in $PATCHES; do echo "$SCRIPT_DIR/$p"; done) "$SCRIPT_DIR/awarewave-theme-receiver.js" | sha256sum | cut -c1-7)
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

# Web fonts (PIN.json webFonts[]): download each into the craft-fonts checkout, verify its
# sha256 and its licence's, and append its manifest row. The craft-fonts checkout was just
# reset by checkout --force, so rows are re-appended each build; downloads are cached.
WF_TSV=/tmp/awarewave-webfonts.$$.tsv
# '|'-separated: a non-whitespace IFS keeps EMPTY fields (tab-IFS merges them and shifts columns).
python3 - "$PIN" > "$WF_TSV" <<'EOF'
import json, sys
for f in json.load(open(sys.argv[1]))["webFonts"]:
    row = [f["family"], f["style"], f["dir"], f["file"], f["url"], f["sha256"],
           f["licence"], f.get("licenseFrom", ""), f.get("licenseUrl", ""),
           f.get("licenseSha256", ""), f["scripts"]]
    assert not any("|" in v for v in row), row
    print("|".join(row))
EOF
while IFS='|' read -r FAM STYLE DIR FILE URL SHA LIC LFROM LURL LSHA SCRIPTS; do
  dest="$FONTS/$DIR/$FILE"
  mkdir -p "$FONTS/$DIR"
  if [ ! -f "$dest" ] || ! echo "$SHA  $dest" | sha256sum -c --quiet - 2>/dev/null; then
    curl -sSL -o "$dest" "$URL"
  fi
  echo "$SHA  $dest" | sha256sum -c --quiet - || { echo "FATAL: $FAM: sha256 mismatch for $FILE" >&2; exit 1; }
  licname="OFL.txt"; [ "$LIC" = "Apache-2.0" ] && licname="LICENSE.txt"
  licdest="$FONTS/$DIR/$licname"
  if [ -n "$LFROM" ]; then
    echo "$LSHA  $FONTS/$LFROM" | sha256sum -c --quiet - || { echo "FATAL: $FAM: licence source $LFROM sha mismatch" >&2; exit 1; }
    cp "$FONTS/$LFROM" "$licdest"
  else
    if [ ! -f "$licdest" ] || ! echo "$LSHA  $licdest" | sha256sum -c --quiet - 2>/dev/null; then
      curl -sSL -o "$licdest" "$LURL"
    fi
    echo "$LSHA  $licdest" | sha256sum -c --quiet - || { echo "FATAL: $FAM: licence sha256 mismatch" >&2; exit 1; }
  fi
  grep -qF "$FAM | $STYLE" "$FONTS/fonts/manifest.txt" || \
    echo "$FAM | $STYLE | $DIR/$FILE | $SCRIPTS | $LIC | $DIR/$licname | $SHA | $URL" >> "$FONTS/fonts/manifest.txt"
done < "$WF_TSV"

# Patches: web-fonts.txt gets the fetched faces; api.rs gets addFont()+setTheme() (upstream
# PRs pending — UPSTREAM-PR.md). Order matters: api-settheme stacks on api-addfont.
for p in $PATCHES; do
  git -C "$SRC" apply --check "$SCRIPT_DIR/$p" || { echo "FATAL: $p no longer applies at $REV — rebase the patch" >&2; exit 1; }
  git -C "$SRC" apply "$SCRIPT_DIR/$p"
done

export CRAFT_FONTS_DIR="$FONTS"
( cd "$SRC/apps/vectorcraft-web" && trunk build --release )

DIST="$SRC/dist/web"
[ -f "$DIST/index.html" ] || { echo "FATAL: no index.html in $DIST" >&2; exit 1; }
ls "$DIST"/*.wasm >/dev/null || { echo "FATAL: no .wasm in $DIST" >&2; exit 1; }

# Every PIN webFont must have landed beside the wasm (xtask only WARNS on a face the
# manifest lacks, which would silently drop a font from the app).
while IFS='|' read -r FAM STYLE DIR FILE URL SHA REST; do
  [ -f "$DIST/fonts/${SHA:0:16}/$FILE" ] || { echo "FATAL: $FAM missing from dist/fonts/${SHA:0:16} — web-fonts.txt vs manifest mismatch?" >&2; exit 1; }
done < "$WF_TSV"
rm -f "$WF_TSV"

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

# Assemble in a staging dir, verify, then swap in atomically: a failed build never
# touches the existing dist, and a half-copied tree is never left under the real name.
OUT="$OUT_BASE/vectorcraft-dist/$DIST_NAME"
STAGE="$OUT_BASE/vectorcraft-dist/.staging-$DIST_NAME.$$"
trap 'rm -rf "$STAGE"' EXIT
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -r "$DIST"/. "$STAGE"/
cp "$SRC/NOTICE" "$SRC/LICENSE-MIT" "$SRC/LICENSE-APACHE" "$STAGE"/
# AwareWave theme receiver: ours, not upstream's — injected before </body>. The filename
# carries the content hash: prod nginx serves /vector-pro/ *.js with expires 1y immutable,
# so an unhashed name would pin a stale receiver in browsers for a year.
RSHA16=$(sha256sum "$SCRIPT_DIR/awarewave-theme-receiver.js" | cut -c1-16)
RNAME="awarewave-theme-receiver-$RSHA16.js"
cp "$SCRIPT_DIR/awarewave-theme-receiver.js" "$STAGE/$RNAME"
python3 - "$STAGE/index.html" "$RNAME" <<'EOF'
import sys
p, rname = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf8").read()
tag = f'<script src="./{rname}"></script>'
if tag not in s:
    assert "</body>" in s, "index.html has no </body>"
    s = s.replace("</body>", tag + "</body>", 1)
    open(p, "w", encoding="utf8", newline="").write(s)
EOF
grep -q "$RNAME" "$STAGE/index.html" || { echo "FATAL: receiver not injected into index.html" >&2; exit 1; }
# Invariant: every root-level .js/.wasm filename carries a 16-hex content hash (the nginx
# immutable rule applies to all of them; index.html alone is no-cache).
for f in "$STAGE"/*.js "$STAGE"/*.wasm; do
  [ -e "$f" ] || continue
  basename "$f" | grep -qE '[0-9a-f]{16}' || { echo "FATAL: $(basename "$f") in dist root lacks a 16-hex content hash — immutable caching would pin it stale" >&2; exit 1; }
done
{ echo ""; echo "--- AwareWave build provenance ---"
  echo "storytold/vectorcraft @ $REV (MIT OR Apache-2.0)"
  echo "storytold/craft-fonts @ $CF_REV (fonts under OFL-1.1, licence beside each font in fonts/)"
  echo "extra fonts from PIN.json webFonts[] (OFL-1.1 / Apache-2.0, licence beside each in fonts/)"
  echo "local patches: $PATCHES + awarewave-theme-receiver.js (scripts/vectorcraft-pro/)"
} >> "$STAGE/NOTICE"
find "$STAGE" \( -name '*.wasm' -o -name '*.js' -o -name '*.otf' -o -name '*.ttf' \) -exec gzip -k -9 {} \;
( cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS && sha256sum -c --quiet SHA256SUMS )
rm -rf "$OUT" && mv "$STAGE" "$OUT"
trap - EXIT
echo "OK: $OUT ($(find "$OUT" -type f | wc -l) files, wasm $(du -h "$OUT"/*.wasm | cut -f1))"
