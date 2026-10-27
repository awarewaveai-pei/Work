#!/bin/bash
# Invoked as CMD after WordPress ENTRYPOINT (docker-entrypoint.sh) completes init.
# At this point wp-content/ is guaranteed to exist in the mounted volume.
set -e

MU_DIR=/var/www/html/wp-content/mu-plugins

mkdir -p "$MU_DIR"

# Always overwrite — keeps mu-plugins current after image rebuilds.
cp /sentry-src/sentry.php "$MU_DIR/sentry.php"
cp /sentry-src/posthog.php "$MU_DIR/posthog.php"
cp /sentry-src/aw-login-audit.php "$MU_DIR/aw-login-audit.php"

# vendor: copy only if missing (large directory; no value in overwriting every restart).
if [ ! -d "$MU_DIR/vendor" ]; then
    cp -r /sentry-src/vendor "$MU_DIR/vendor"
fi

exec apache2-foreground
