# Shared runtime image for every client WordPress site rendered from this directory (render.sh).
# Tag = CLIENT_WP_IMAGE in render.sh; bump both together (-rN) on any change here.
#
# Why an image of our own: wp-cron-runner.sh (:2-6) only schedules containers that HAVE wp-cli, and the official
# wordpress image ships without it. Same answer as soulful (infra/soulful/Dockerfile): pinned base + wp-cli verified
# against its published sha512 before it is installed.
# compose-new runs `up --no-build`: the caller builds this image first (render.sh "caller contract").
#
# Base = the digest soulful already runs on this host (PHP 8.2.35, PHP2Shell fix 2026-10-21).
FROM wordpress:php8.2-apache@sha256:4c0263fcef6cf083a927a4fb6ec9f9744710a333b583f9edd0ac1fa2e269cdff

RUN set -eux; \
    curl -fsSL -o /tmp/wp.phar \
      https://github.com/wp-cli/wp-cli/releases/download/v2.12.0/wp-cli-2.12.0.phar; \
    curl -fsSL -o /tmp/wp.phar.sha512 \
      https://github.com/wp-cli/wp-cli/releases/download/v2.12.0/wp-cli-2.12.0.phar.sha512; \
    echo "$(cat /tmp/wp.phar.sha512)  /tmp/wp.phar" | sha512sum -c -; \
    install -m 0755 /tmp/wp.phar /usr/local/bin/wp; \
    rm -f /tmp/wp.phar /tmp/wp.phar.sha512; \
    wp --allow-root --version | grep -q "2.12.0"

COPY php-limits.ini /usr/local/etc/php/conf.d/zz-client-wp-limits.ini
RUN php -r 'exit(PHP_VERSION_ID >= 80235 && PHP_VERSION_ID < 80300 && ini_get("session.upload_progress.enabled") === "0" ? 0 : 1);'
# Worker count sized to the compose memory limit (docker-compose.yml.tmpl, <slug>-wp).
COPY apache-mpm-prefork.conf /etc/apache2/mods-available/mpm_prefork.conf
COPY site-health.php /usr/local/lib/aw-site-health.php
RUN a2enmod rewrite headers expires
