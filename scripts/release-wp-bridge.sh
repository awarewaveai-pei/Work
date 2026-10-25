#!/usr/bin/env bash
# release-wp-bridge.sh — Ship a new aware-wave-wp-bridge plugin version end-to-end.
#
# WHY THIS EXISTS: the plugin lives in TWO GitHub repos and that bit a session once.
#   - awarewaveai-pei/Work          : monorepo DEV copy (lobster-factory/packages/wp-bridge-plugin)
#   - awarewaveai-pei/aware-wave-wp-bridge : the RELEASE source. Pushing a tag v* fires .github/
#                                            workflows/release.yml which builds the installable zip
#                                            (aware-wave-wp-bridge.php + includes/ + README.md) and
#                                            publishes a GitHub Release. The operator installs THAT zip.
# Editing only the Work copy does nothing for the operator — the release never updates. This script
# syncs Work -> release repo, tags, pushes, and verifies the Release + zip asset actually appeared.
#
# USAGE:
#   bash scripts/release-wp-bridge.sh            # release the version currently in the plugin header
#   bash scripts/release-wp-bridge.sh --dry-run  # show what WOULD happen; no push, no tag
#
# The version is the single source of truth in aware-wave-wp-bridge.php (AWBRIDGE_VERSION). Bump it
# there BEFORE running this (the header 'Version:' line and the define must match — checked below).
#
# PRECONDITIONS: gh authenticated (gh auth status); php on PATH (lint gate); clean intent (the Work
# copy holds the changes you want to ship — commit them to Work separately, this script only mirrors).
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

REPO="awarewaveai-pei/aware-wave-wp-bridge"
# Derive repo root from script location — works on any machine, no hardcoded user path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "${SCRIPT_DIR}/../lobster-factory/packages/wp-bridge-plugin" && pwd)"
PLUGIN_FILE="$SRC/aware-wave-wp-bridge.php"
# Use OS temp dir outside the Work repo so auto-checkpoint won't grab it.
TMP="${TMPDIR:-${TEMP:-/tmp}}/awb-release"

say() { echo "[release-wp-bridge] $*"; }
die() { echo "[release-wp-bridge] ERROR: $*" >&2; exit 1; }

# 1. Resolve + sanity-check the version (header 'Version:' MUST equal the AWBRIDGE_VERSION define).
[ -f "$PLUGIN_FILE" ] || die "plugin file not found: $PLUGIN_FILE"
VER_DEFINE=$(grep -oE "AWBRIDGE_VERSION', '[0-9]+\.[0-9]+\.[0-9]+'" "$PLUGIN_FILE" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || true)
VER_HEADER=$(grep -oE "Version:[[:space:]]+[0-9]+\.[0-9]+\.[0-9]+" "$PLUGIN_FILE" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || true)
[ -n "$VER_DEFINE" ] || die "could not parse AWBRIDGE_VERSION from $PLUGIN_FILE"
[ "$VER_DEFINE" = "$VER_HEADER" ] || die "version mismatch: header='$VER_HEADER' define='$VER_DEFINE' — fix both before release"
TAG="v$VER_DEFINE"
say "version = $VER_DEFINE  ->  tag $TAG"

# 2. Lint the PHP we're about to ship (fast build gate; full tests run in the repo's ci.yml).
say "php -l gate..."
find "$SRC/includes" -name '*.php' -print0 | xargs -0 -n1 php -l >/dev/null || die "php lint failed"
php -l "$PLUGIN_FILE" >/dev/null || die "php lint failed on plugin file"
say "lint OK"

# 3. Refuse to re-release an existing tag (immutable releases; bump the version instead).
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
	die "release $TAG already exists on $REPO — bump AWBRIDGE_VERSION and try again"
fi

# 4. Clone the release repo fresh and mirror the plugin payload (exactly what release.yml zips).
say "cloning $REPO -> $TMP"
rm -rf "$TMP"
gh repo clone "$REPO" "$TMP" -- -q
cp "$PLUGIN_FILE" "$TMP/aware-wave-wp-bridge.php"
[ -f "$SRC/README.md" ] && cp "$SRC/README.md" "$TMP/README.md" || true
# Mirror includes/ faithfully (adds new files like Product/ProductCreator.php, updates changed ones).
# rsync if available, else cp -r over a cleared dir to drop files removed upstream.
if command -v rsync >/dev/null 2>&1; then
	rsync -a --delete "$SRC/includes/" "$TMP/includes/"
else
	rm -rf "$TMP/includes" && cp -r "$SRC/includes" "$TMP/includes"
fi

# 5. Anything to ship?
cd "$TMP"
if [ -z "$(git status --porcelain)" ]; then
	die "release repo already matches Work at $VER_DEFINE — nothing to sync (did you bump the version?)"
fi
say "files changing in release repo:"
git status --short

if [ "$DRY_RUN" = "1" ]; then
	say "DRY RUN — would: commit, push main, tag $TAG, push tag, verify release. Stopping."
	exit 0
fi

# 6. Commit, push main, tag, push tag -> fires release.yml.
git add -A
git commit -q -m "release($TAG): sync from Work monorepo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -q origin HEAD
git tag "$TAG"
git push origin "$TAG"
say "tag pushed — release.yml building zip..."

# 7. Verify the Release + zip asset actually published (poll up to ~90s).
for i in $(seq 1 9); do
	sleep 10
	if gh release view "$TAG" -R "$REPO" 2>/dev/null | grep -q "aware-wave-wp-bridge-$TAG.zip"; then
		say "RELEASE OK: $TAG with asset aware-wave-wp-bridge-$TAG.zip"
		gh release view "$TAG" -R "$REPO" | grep -E "tag:|asset:|url:"
		say "NEXT: wp-bridge runs on every managed site -- roll it out: powershell -File scripts/rollout-wp-bridge.ps1 -DryRun, then without -DryRun (High)"
		exit 0
	fi
	say "  waiting for release asset... ($i/9)"
done
die "release $TAG did not publish a zip within timeout — check: gh run list -R $REPO --workflow=release.yml"
