# shellcheck shell=bash
# Shared steps of the Craft web builds (scripts/vectorcraft-pro, scripts/photocraft-pro). Source it
# from a build.sh that runs under `set -euo pipefail` inside WSL. Each editor keeps its own PIN.json
# (repo, rev, the craft-fonts rev its upstream CI uses); the extra fonts we add are one list for
# every editor: fonts.json beside this file.

CRAFT_WEB_BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRAFT_WEB_FONTS_JSON="$CRAFT_WEB_BUILD_DIR/fonts.json"

# pin "['key']" — a field of the caller's $PIN.
pin() { python3 -c "import json,sys; d=json.load(open('$PIN')); print(d$1)"; }

checkout() { # checkout <dir> <repo> <rev>
  local dir=$1 repo=$2 rev=$3
  if [ ! -d "$dir/.git" ]; then git clone "$repo" "$dir"; fi
  git -C "$dir" cat-file -e "$rev^{commit}" 2>/dev/null || git -C "$dir" fetch origin
  git -C "$dir" -c advice.detachedHead=false checkout --force --detach "$rev"
  [ "$(git -C "$dir" rev-parse HEAD)" = "$rev" ] || { echo "FATAL: $dir not at $rev" >&2; exit 1; }
}

# checkout_patched <dir> <repo> <rev> — for a checkout the build patches. checkout --force keeps untracked
# files, so a file an earlier (or interrupted) run's patch created would make `git apply` refuse or be compiled
# in. Remove them; ignored ones (target/) stay. Not for craft-fonts: its untracked downloads are the font cache.
checkout_patched() {
  checkout "$@"
  git -C "$1" clean -fdq
}

# craft_web_fonts <craft-fonts checkout> <tsv out>
# Web fonts (fonts.json webFonts[]): download each into the craft-fonts checkout, verify its sha256
# and its licence's, and append its manifest row. The checkout was just reset by checkout --force,
# so rows are re-appended each build; downloads are cached. Writes one '|'-separated row per font
# to <tsv out> (family|style|dir|file|url|sha256|...) for the caller's post-build checks.
craft_web_fonts() {
  local FONTS=$1 WF_TSV=$2
  # '|'-separated: a non-whitespace IFS keeps EMPTY fields (tab-IFS merges them and shifts columns).
  python3 - "$CRAFT_WEB_FONTS_JSON" > "$WF_TSV" <<'EOF'
import json, sys
for f in json.load(open(sys.argv[1]))["webFonts"]:
    row = [f["family"], f["style"], f["dir"], f["file"], f["url"], f["sha256"],
           f["licence"], f.get("licenseFrom", ""), f.get("licenseUrl", ""),
           f.get("licenseSha256", ""), f["scripts"]]
    assert not any("|" in v for v in row), row
    print("|".join(row))
EOF
  local FAM STYLE DIR FILE URL SHA LIC LFROM LURL LSHA SCRIPTS dest licname licdest
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
}
# craft_brand_scan <upstream checkout> <file-or-dir>...
# Upstream's docs/brand/LICENSE-brand.txt: a modified version must remove the ArtCraft Marks. A mark can
# reach the build as a file OR compiled into the wasm (include_bytes!), where a whole-file hash never
# matches (wasm-opt splits data segments). So: seven 64-byte windows of every brand file are searched
# in every given file; any hit is FATAL. Pass the raw wasm too when the site ships it compressed or split.
craft_brand_scan() {
  local SRC=$1; shift
  [ -d "$SRC/docs/brand" ] || { echo "FATAL: $SRC/docs/brand missing — cannot check the build for brand assets" >&2; exit 1; }
  python3 - "$SRC/docs/brand" "$@" <<'EOF' || { echo "FATAL: the build contains ArtCraft brand assets (see HIT lines) — remove them with a patch" >&2; exit 1; }
import os, sys
wins = []
for root, _, files in os.walk(sys.argv[1]):
    for f in sorted(files):
        if f.endswith((".txt", ".attribution")):  # licence text and sidecars are not marks
            continue
        b = open(os.path.join(root, f), "rb").read()
        for k in range(1, 8):
            w = b[len(b) * k // 8 : len(b) * k // 8 + 64]
            if len(w) == 64 and len(set(w)) > 8:
                wins.append((f, w))
if not wins:
    sys.exit("no brand windows: docs/brand holds no mark files?")
def targets(args):
    for a in args:
        if os.path.isdir(a):
            for root, _, files in os.walk(a):
                for f in files:
                    yield os.path.join(root, f)
        elif os.path.isfile(a):
            yield a
        else:
            sys.exit("brand scan: no such file or directory: " + a)
bad = 0
for p in targets(sys.argv[2:]):
    data = open(p, "rb").read()
    names = sorted({n for n, w in wins if w in data})
    if names:
        bad += 1
        print("HIT", p, names, file=sys.stderr)
sys.exit(1 if bad else 0)
EOF
}
