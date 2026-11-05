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
