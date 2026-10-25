#!/usr/bin/env bash
# release-wp-bridge.sh — Ship a new version of one of our WordPress plugins end-to-end.
#
#   --plugin bridge (default)  aware-wave-wp-bridge: the AI-to-WordPress channel, on EVERY managed site
#                              Work copy lobster-factory/packages/wp-bridge-plugin -> awarewaveai-pei/aware-wave-wp-bridge
#   --plugin store             aware-wave-store: AwareWave's own shop logic, aware-wave.com ONLY
#                              Work copy lobster-factory/packages/aware-wave-store-plugin -> awarewaveai-pei/aware-wave-store (private)
#
# WHY THIS EXISTS: each plugin lives in TWO GitHub repos and that bit a session once. Pushing a tag v* to the
# release repo fires its .github/workflows/release.yml, which builds the installable zip (<slug>.php + includes/ +
# README.md) and publishes a GitHub Release; the host installs THAT zip. Editing only the Work copy ships nothing.
# This script mirrors Work -> release repo (the zip payload plus tests/, phpunit.xml, composer.json, so the release
# repo's CI runs the real suite -- until 2026-10-25 it ran stale copies), tags, pushes, and verifies the zip appeared.
#
# USAGE:
#   bash scripts/release-wp-bridge.sh [--plugin bridge|store]            # release the version in the plugin header
#   bash scripts/release-wp-bridge.sh [--plugin bridge|store] --dry-run  # show what WOULD happen; no push, no tag
#
# The version is the single source of truth in <slug>.php (AWBRIDGE_VERSION / AWSTORE_VERSION). Bump it there
# BEFORE running this (the header 'Version:' line and the define must match — checked below).
#
# PRECONDITIONS: gh authenticated (gh auth status); php on PATH (lint gate); clean intent (the Work
# copy holds the changes you want to ship — commit them to Work separately, this script only mirrors).
set -euo pipefail

DRY_RUN=0
PLUGIN=bridge
while [ $# -gt 0 ]; do
	case "$1" in
		--dry-run) DRY_RUN=1 ;;
		--plugin) [ $# -ge 2 ] || { echo "[release-wp-bridge] ERROR: --plugin needs bridge or store" >&2; exit 1; }
		          PLUGIN="$2"; shift ;;
		*) echo "[release-wp-bridge] ERROR: unknown argument $1" >&2; exit 1 ;;
	esac
	shift
done
case "$PLUGIN" in
	bridge) SLUG=aware-wave-wp-bridge; PKG=wp-bridge-plugin;        VERSION_CONST=AWBRIDGE_VERSION
	        NEXT="wp-bridge runs on every managed site -- roll it out: powershell -File scripts/rollout-wp-bridge.ps1 -DryRun, then without -DryRun (High)" ;;
	store)  SLUG=aware-wave-store;     PKG=aware-wave-store-plugin; VERSION_CONST=AWSTORE_VERSION
	        NEXT="aware-wave.com only -- first time: powershell -File scripts/rollout-wp-bridge.ps1 -Plugin store -Install -Site lobster-wordpress -DryRun; later: -Plugin store -DryRun; then without -DryRun (High)" ;;
	*) echo "[release-wp-bridge] ERROR: --plugin must be bridge or store" >&2; exit 1 ;;
esac

REPO="awarewaveai-pei/$SLUG"
# Derive repo root from script location — works on any machine, no hardcoded user path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "${SCRIPT_DIR}/../lobster-factory/packages/$PKG" && pwd)"
PLUGIN_FILE="$SRC/$SLUG.php"
# Use OS temp dir outside the Work repo so auto-checkpoint won't grab it.
TMP="${TMPDIR:-${TEMP:-/tmp}}/awb-release-$PLUGIN"

say() { echo "[release-wp-bridge] $*"; }
die() { echo "[release-wp-bridge] ERROR: $*" >&2; exit 1; }

# 1. Resolve + sanity-check the version (header 'Version:' MUST equal the version define).
[ -f "$PLUGIN_FILE" ] || die "plugin file not found: $PLUGIN_FILE"
VER_DEFINE=$(grep -oE "${VERSION_CONST}', '[0-9]+\.[0-9]+\.[0-9]+'" "$PLUGIN_FILE" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || true)
VER_HEADER=$(grep -oE "Version:[[:space:]]+[0-9]+\.[0-9]+\.[0-9]+" "$PLUGIN_FILE" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || true)
[ -n "$VER_DEFINE" ] || die "could not parse $VERSION_CONST from $PLUGIN_FILE"
[ "$VER_DEFINE" = "$VER_HEADER" ] || die "version mismatch: header='$VER_HEADER' define='$VER_DEFINE' — fix both before release"
TAG="v$VER_DEFINE"
say "$SLUG version = $VER_DEFINE  ->  tag $TAG"

# 2. Lint the PHP we're about to ship (fast build gate; full tests run in the repo's ci.yml).
say "php -l gate..."
find "$SRC/includes" -name '*.php' -print0 | xargs -0 -n1 php -l >/dev/null || die "php lint failed"
php -l "$PLUGIN_FILE" >/dev/null || die "php lint failed on plugin file"
say "lint OK"

# 3. Refuse to re-release an existing tag (immutable releases; bump the version instead).
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
	die "release $TAG already exists on $REPO — bump $VERSION_CONST and try again"
fi

# 4. Clone the release repo fresh and mirror the plugin payload (exactly what release.yml zips).
say "cloning $REPO -> $TMP"
rm -rf "$TMP"
gh repo clone "$REPO" "$TMP" -- -q
cp "$PLUGIN_FILE" "$TMP/$SLUG.php"
for f in README.md phpunit.xml composer.json; do
	[ -f "$SRC/$f" ] && cp "$SRC/$f" "$TMP/$f" || true
done
# Mirror includes/ and tests/ faithfully (new files added, removed ones dropped): the release repo's CI must run
# the suite that matches the code it ships. rsync if available, else cp -r over a cleared dir.
for d in includes tests; do
	if command -v rsync >/dev/null 2>&1; then
		rsync -a --delete "$SRC/$d/" "$TMP/$d/"
	else
		rm -rf "${TMP:?}/$d" && cp -r "$SRC/$d" "$TMP/$d"
	fi
done

# 5. Anything to ship?
cd "$TMP"
SYNCED=1
if [ -z "$(git status --porcelain)" ]; then
	# Already mirrored but not tagged (e.g. a previous run stopped at the CI check): resume at the CI check.
	SYNCED=0
	say "release repo already matches Work at $VER_DEFINE and $TAG is not tagged yet -- resuming at the CI check"
else
	say "files changing in release repo:"
	git status --short
fi

if [ "$DRY_RUN" = "1" ]; then
	say "DRY RUN — would: commit, push main, wait for CI to pass, tag $TAG, push tag, verify release. Stopping."
	exit 0
fi

# 6. Commit, push main, WAIT FOR CI ON THAT COMMIT, then tag -> fires release.yml. release.yml builds from the tag
#    on its own, so without this wait a release could ship code whose tests fail (Codex 2026-10-25 F1).
if [ "$SYNCED" = "1" ]; then
	git add -A
	git commit -q -m "release($TAG): sync from Work monorepo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
	git push -q origin HEAD
fi
SHA=$(git rev-parse HEAD)
say "waiting for CI on $SHA ..."
CI=""
for i in $(seq 1 60); do
	CI=$(gh run list -R "$REPO" --workflow=ci.yml --commit "$SHA" --json status,conclusion -q '.[0] | (.status + " " + (.conclusion // ""))' 2>/dev/null || true)
	case "$CI" in
		"completed success") break ;;
		completed*) die "CI on $SHA ended '$CI' -- nothing tagged. Fix, then rerun (gh run list -R $REPO --workflow=ci.yml)" ;;
	esac
	sleep 10
done
[ "$CI" = "completed success" ] || die "CI on $SHA did not finish within 10 minutes ('$CI') -- nothing tagged; rerun later to resume"
say "CI passed"
git tag "$TAG"
git push origin "$TAG"
say "tag pushed — release.yml building zip..."

# 7. Verify the Release + zip asset actually published (poll up to ~90s).
for i in $(seq 1 9); do
	sleep 10
	if gh release view "$TAG" -R "$REPO" 2>/dev/null | grep -q "$SLUG-$TAG.zip"; then
		say "RELEASE OK: $TAG with asset $SLUG-$TAG.zip"
		gh release view "$TAG" -R "$REPO" | grep -E "tag:|asset:|url:"
		say "NEXT: $NEXT"
		exit 0
	fi
	say "  waiting for release asset... ($i/9)"
done
die "release $TAG did not publish a zip within timeout — check: gh run list -R $REPO --workflow=release.yml"
