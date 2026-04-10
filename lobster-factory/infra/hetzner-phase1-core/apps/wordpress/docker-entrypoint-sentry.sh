#!/bin/bash
# Copies Sentry mu-plugin + vendor into the wordpress_data volume on every container start.
set -e

MU_DIR=/var/www/html/wp-content/mu-plugins

mkdir -p "$MU_DIR"

# Copy mu-plugin file (overwrite to keep up-to-date on image rebuilds)
cp /sentry-src/sentry.php "$MU_DIR/sentry.php"

# Copy vendor only if missing (avoid re-copy on every restart for performance)
if [ ! -d "$MU_DIR/vendor" ]; then
    cp -r /sentry-src/vendor "$MU_DIR/vendor"
fi
