#!/usr/bin/env bash
# Re-evaluation trial build prep (2026-11-06): pin both engines, add Traditional Chinese faces.
# Runs inside WSL Ubuntu. Does NOT build; see build-one.sh.
set -euo pipefail
A="$HOME/awarewave"
EC="$A/effectcraft-src"; FC="$A/filmcraft-src"; CF="$A/craft-fonts"; CFV="$A/craft-fonts-video"
EC_REV=df4cc0932803f6183151083a5dfdd175f9d0a4ca   # tag v0.21.1
FC_REV=46763a85d9777d3a60c2a557f359d988296d6a44   # main 2026-11-05 (host bridge #3341; 97 commits after v0.17.1)
SANS="$CF/fonts/noto-sans-tc/NotoSansTC-Regular.otf"
SERIF="$CF/fonts/awarewave/notoseriftc/NotoSerifTC-Regular.otf"
echo "5bab0cb3c1cf89dde07c4a95a4054b195afbcfe784d69d75c340780712237537  $SANS" | sha256sum -c --quiet -
sha256sum "$SERIF" | grep -q '^63515eb0622d589a'

git -C "$EC" -c advice.detachedHead=false checkout --force --detach "$EC_REV"
git -C "$FC" -c advice.detachedHead=false checkout --force --detach "$FC_REV"

# --- EffectCraft: compile the two TC faces in as "bundled" (every worker instance gets them).
cp "$SANS" "$SERIF" "$EC/assets/fonts/"
python3 - "$EC/crates/text/src/fonts.rs" <<'EOF'
import sys, io
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
a = 'pub static NOTO_SERIF_REGULAR: &[u8] = include_bytes!("../../../assets/fonts/NotoSerif-Regular.ttf");\n'
assert s.count(a) == 1
s = s.replace(a, a +
  '/// AwareWave build: Traditional Chinese faces, compiled in so the page and every worker have them.\n'
  'pub static NOTO_SANS_TC_REGULAR: &[u8] = include_bytes!("../../../assets/fonts/NotoSansTC-Regular.otf");\n'
  'pub static NOTO_SERIF_TC_REGULAR: &[u8] = include_bytes!("../../../assets/fonts/NotoSerifTC-Regular.otf");\n')
b = 'for b in [INTER_MEDIUM, INTER_SEMIBOLD, INTER_BOLD, INTER_ITALIC, JETBRAINS_MONO_REGULAR, NOTO_SERIF_REGULAR] {'
assert s.count(b) == 1
s = s.replace(b, b.replace('NOTO_SERIF_REGULAR]', 'NOTO_SERIF_REGULAR, NOTO_SANS_TC_REGULAR, NOTO_SERIF_TC_REGULAR]'))
open(p, "w", encoding="utf-8", newline="\n").write(s)
EOF

# --- FilmCraft: craft-fonts copy (keeps the VectorCraft checkout untouched) + keep the TC faces on wasm.
rm -rf "$CFV"; cp -r "$CF" "$CFV"
grep -q '^Noto Sans TC | Regular' "$CFV/fonts/manifest.txt"
grep -q '^Noto Serif TC | Regular' "$CFV/fonts/manifest.txt"
python3 - "$FC/crates/text/build.rs" "$FC/crates/text/src/fonts.rs" <<'EOF'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
a = 'matches!(family, "BIZ UDPGothic" | "Noto Sans Thai")'
assert s.count(a) == 1
s = s.replace(a, 'matches!(family, "BIZ UDPGothic" | "Noto Sans Thai" | "Noto Sans TC" | "Noto Serif TC")')
open(p, "w", encoding="utf-8", newline="\n").write(s)
p = sys.argv[2]; s = open(p, encoding="utf-8").read()
a = 'craft.sort_by_key(|f| (is_serif(&f.info.family) != serif, f.info.italic != p.info.italic, f.info.weight.abs_diff(p.info.weight)));'
assert s.count(a) == 1
# AwareWave build: Han text takes Traditional Chinese glyph forms before the Japanese faces.
s = s.replace(a, 'craft.sort_by_key(|f| (is_serif(&f.info.family) != serif, !f.info.family.ends_with(" TC"), f.info.italic != p.info.italic, f.info.weight.abs_diff(p.info.weight)));')
open(p, "w", encoding="utf-8", newline="\n").write(s)
EOF
git -C "$EC" diff --stat; git -C "$FC" diff --stat
git -C "$EC" diff > "$A/effectcraft-tc-fonts.patch"; git -C "$FC" diff > "$A/filmcraft-tc-fonts.patch"
echo PREP-OK
