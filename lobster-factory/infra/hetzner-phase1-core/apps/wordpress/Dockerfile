FROM wordpress:php8.2-apache

# Install Sentry PHP SDK via Composer at build time
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /sentry-src
COPY composer.json ./
RUN composer install --no-dev --optimize-autoloader --no-interaction

COPY mu-plugins/sentry.php ./sentry.php
COPY mu-plugins/posthog.php ./posthog.php

COPY php-upload-limits.ini /usr/local/etc/php/conf.d/awarewave-upload-limits.ini
# Apache worker count sized to the compose memory limit (docker-compose.yml wordpress: deploy.resources.limits).
COPY apache-mpm-prefork.conf /etc/apache2/mods-available/mpm_prefork.conf

# Seed /usr/src/wordpress so mu-plugins are included when WordPress populates the volume on first run.
RUN mkdir -p /usr/src/wordpress/wp-content/mu-plugins
COPY mu-plugins/sentry.php /usr/src/wordpress/wp-content/mu-plugins/sentry.php
COPY mu-plugins/posthog.php /usr/src/wordpress/wp-content/mu-plugins/posthog.php

# CMD wrapper: runs after WordPress ENTRYPOINT init, overwrites mu-plugins in volume, then starts Apache.
# WordPress image ENTRYPOINT = docker-entrypoint.sh; CMD replaces the default apache2-foreground.
COPY docker-entrypoint-sentry.sh /usr/local/bin/lobster-init.sh
RUN chmod +x /usr/local/bin/lobster-init.sh

WORKDIR /var/www/html

# Install WP-CLI (pinned — update when WP-CLI releases a tested stable)
# Allows: docker exec lobster-wordpress wp plugin install <slug> --activate --allow-root
RUN curl -sSL https://github.com/wp-cli/wp-cli/releases/download/v2.11.0/wp-cli-2.11.0.phar \
      -o /usr/local/bin/wp \
    && chmod +x /usr/local/bin/wp

CMD ["/usr/local/bin/lobster-init.sh"]
