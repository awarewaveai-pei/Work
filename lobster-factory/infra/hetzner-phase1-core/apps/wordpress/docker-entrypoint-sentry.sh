#!/bin/bash
# Copies observability mu-plugins into the wordpress_data volume on every container start.
set -e

MU_DIR=/var/www/html/wp-content/mu-plugins

mkdir -p "$MU_DIR"

# Copy mu-plugin files (overwrite to keep up-to-date on image rebuilds)
cp /sentry-src/sentry.php "$MU_DIR/sentry.php"
cp /sentry-src/posthog.php "$MU_DIR/posthog.php"

# Copy vendor only if missing (avoid re-copy on every restart for performance)
if [ ! -d "$MU_DIR/vendor" ]; then
    cp -r /sentry-src/vendor "$MU_DIR/vendor"
fi
