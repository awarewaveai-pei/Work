#!/usr/bin/env bash
# build-zip.sh -- the installable aware-wave-oracle zip, built the same way everywhere: the release repo's
# release.yml runs it on a tag, scripts/release-wp-bridge.sh --plugin oracle --dry-run runs it on the Work copy.
#
#   bash bin/build-zip.sh <out-dir>      ->  <out-dir>/aware-wave-oracle-v<AWORACLE_VERSION>.zip
#
# Payload = this folder minus what .distignore lists (tests, composer, CI, this script). .distignore holds
# anchored paths only ("/tests"); anything else stops the build, so a pattern can never silently ship or drop files.
# The zip holds one top folder aware-wave-oracle/ with forward-slash paths (WordPress "upload plugin" and
# `wp plugin install <zip>` both need that).
set -euo pipefail

SLUG=aware-wave-oracle
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:?usage: build-zip.sh <out-dir>}"
die() { echo "[build-zip] ERROR: $*" >&2; exit 1; }

VER=$(grep -oE "AWORACLE_VERSION', '[0-9]+\.[0-9]+\.[0-9]+'" "$ROOT/$SLUG.php" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || true)
[ -n "$VER" ] || die "could not read AWORACLE_VERSION from $SLUG.php"

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
STAGE="$OUT/.stage-$SLUG"
rm -rf "$STAGE"
mkdir -p "$STAGE/$SLUG"

# Copy every top-level entry except .git, the output folder (CI builds into ./build) and what .distignore excludes.
EXCLUDE=" .git "
case "$OUT/" in
	"$ROOT"/*) rel="${OUT#"$ROOT"/}"; EXCLUDE="$EXCLUDE${rel%%/*} " ;;
esac
while IFS= read -r line || [ -n "$line" ]; do
	line="${line%$'\r'}"
	case "$line" in
		'' | '#'*) continue ;;
		/*/* | *'*'* | *'?'* | *'['*) die ".distignore line '$line': only anchored top-level names (/tests) are supported" ;;
		/*) EXCLUDE="$EXCLUDE${line#/} " ;;
		*) die ".distignore line '$line': only anchored top-level names (/tests) are supported" ;;
	esac
done < "$ROOT/.distignore"
for entry in "$ROOT"/* "$ROOT"/.[!.]*; do
	[ -e "$entry" ] || continue
	name="$(basename "$entry")"
	case "$EXCLUDE" in *" $name "*) continue ;; esac
	cp -R "$entry" "$STAGE/$SLUG/"
done
[ -f "$STAGE/$SLUG/$SLUG.php" ] || die "$SLUG.php missing from the payload"

ZIP="$OUT/$SLUG-v$VER.zip"
rm -f "$ZIP"
if command -v zip >/dev/null 2>&1; then
	(cd "$STAGE" && zip -rqX "../$SLUG-v$VER.zip" "$SLUG")
else
	PY=""
	for p in python3 python; do
		if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import zipfile' >/dev/null 2>&1; then PY="$p"; break; fi
	done
	[ -n "$PY" ] || die "neither zip nor python found"
	# zipfile stores '/' separators on every OS; relative paths, so a Windows python reads them too.
	(cd "$STAGE" && "$PY" -m zipfile -c "../$SLUG-v$VER.zip" "$SLUG")
fi
rm -rf "$STAGE"
echo "$ZIP"
