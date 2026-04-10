FROM wordpress:php8.2-apache

# Install Sentry PHP SDK via Composer at build time
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /sentry-src
COPY composer.json ./
RUN composer install --no-dev --optimize-autoloader --no-interaction

COPY mu-plugins/sentry.php ./sentry.php

# Register entrypoint hook (WordPress image runs scripts in /docker-entrypoint.d/)
COPY docker-entrypoint-sentry.sh /docker-entrypoint.d/99-sentry-init.sh
RUN chmod +x /docker-entrypoint.d/99-sentry-init.sh

WORKDIR /var/www/html
