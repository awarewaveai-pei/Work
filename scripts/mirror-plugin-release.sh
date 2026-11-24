#!/usr/bin/env bash
# mirror-plugin-release.sh <slug> <tag> -- put one release zip of our own plugins on the host, where the site flow
# installs it from.
#
# WHY: the release repos are private (operator decision 2026-11-24: plugins that are for sale are not published) and
# the host holds no GitHub token, so it cannot download a release itself. aw-hosting-gate.sh `site-wp plugins`
# installs a release URL from /var/lib/awarewave/plugin-releases/<slug>/<tag>/<slug>-<tag>.zip when that file exists.
# This script is the only writer of that directory: it downloads the asset with this machine's gh login and copies
# it over ssh. scripts/release-wp-bridge.sh runs it after every release; run it by hand to put an older release back.
#
#   bash scripts/mirror-plugin-release.sh aware-wave-wp-bridge v0.22.0
#
# Idempotent (same file again = same result). Exit 0 only when the host's copy has the same sha256 as the asset.
# Host: AWAREWAVE_SSH_HOST / AWAREWAVE_SSH_PORT override the defaults (ks-aw-01).
set -euo pipefail

die() { echo "[mirror-plugin-release] ERROR: $*" >&2; exit 1; }
SLUG="${1:-}"; TAG="${2:-}"
# Same shapes the gate accepts (RELEASE_RE / RELEASE_TAG_RE): the path below is built from these two values only.
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || die "usage: mirror-plugin-release.sh <slug> <tag>   (slug: $SLUG)"
[[ "$TAG" =~ ^v[0-9]+(\.[0-9]+){0,3}$ ]] || die "tag must be v<version> (got: $TAG)"

HOST="${AWAREWAVE_SSH_HOST:-145.239.195.47}"; PORT="${AWAREWAVE_SSH_PORT:-58122}"
ASSET="$SLUG-$TAG.zip"; ROOT=/var/lib/awarewave/plugin-releases; DEST="$ROOT/$SLUG/$TAG"
TMP="$(mktemp -d)"; trap 'rm -rf -- "$TMP"' EXIT

gh release download "$TAG" -R "awarewaveai-pei/$SLUG" -p "$ASSET" -D "$TMP" || die "cannot download $ASSET from awarewaveai-pei/$SLUG $TAG"
unzip -tq "$TMP/$ASSET" >/dev/null || die "$ASSET is not a valid zip"
SUM="$(sha256sum "$TMP/$ASSET" | cut -d' ' -f1)"

scp -q -P "$PORT" -o BatchMode=yes "$TMP/$ASSET" "ubuntu@$HOST:/tmp/$ASSET.upload" || die "copy to $HOST failed"
REMOTE="$(ssh -p "$PORT" -o BatchMode=yes "ubuntu@$HOST" \
  "sudo install -d -o root -g root -m 700 '$ROOT' '$ROOT/$SLUG' '$DEST' \
   && sudo install -o root -g root -m 600 '/tmp/$ASSET.upload' '$DEST/$ASSET' \
   && rm -f '/tmp/$ASSET.upload' && sudo sha256sum '$DEST/$ASSET' | cut -d' ' -f1")" || die "install on $HOST failed"
[ "$REMOTE" = "$SUM" ] || die "host copy differs (host $REMOTE, asset $SUM)"
echo "[mirror-plugin-release] $DEST/$ASSET on $HOST = $SUM"
