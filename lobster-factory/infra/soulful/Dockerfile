# soulfulexpression.org — WordPress runtime for ks-aw-01
#
# The PHP 8.2.35 base is pinned by digest (PHP2Shell, 2026-10-21). Existing WordPress
# core files live in the pre-populated volume; the base supplies PHP/Apache/extensions.
# See
# tenants/company-soulful-expression/core/LIVE_RUNTIME_BASELINE_20260827.md.
FROM wordpress:php8.2-apache@sha256:4c0263fcef6cf083a927a4fb6ec9f9744710a333b583f9edd0ac1fa2e269cdff

# Already compiled into the pinned base; verified against the live extension list:
#   bcmath ctype curl dom exif fileinfo filter gd hash iconv imagick intl mbstring
#   mysqli openssl pdo_sqlite Phar posix sodium sqlite3 zip zlib OPcache
#
# Added below = present on the live Hostinger runtime but absent from this base.
# Each was checked against actual plugin code on the live site rather than copied
# wholesale from `php -m`:
#   gmp      — 16 plugin files call gmp_init(); genuinely required
#   tidy     — 1 plugin file calls tidy_parse()
#   xsl/soap — 0 current callers, but cheap and part of the live runtime, so kept
#              rather than discovering a runtime dependency during cutover
#   redis    — the new host has no LiteSpeed cache; Redis object cache is the
#              planned replacement (igbinary/msgpack are its serializers)
#   calendar, ftp, gettext, pcntl, shmop, sysv* — present live, trivial to build
#
# On the purge at the end: `apt-get purge --auto-remove <lib>-dev` strips the RUNTIME
# library too, not just the headers, and the extension then dies at PHP startup with
# "cannot open shared object file" (libtidy.so.58 / libexslt.so.0). Measured, not
# theoretical — the first build of this image reported tidy=NO and xsl=NO for exactly
# that reason, and only a runtime `php -m` check caught it. The runtime halves are
# reinstalled after the purge, and the build now ASSERTS the extensions load instead
# of assuming a successful compile means a working extension.
#
# Runtime package names are Debian-release specific and were read off this base image
# (Debian 13.5 "trixie") rather than carried over from memory: it is `libtidy58` here,
# not the `libtidy5deb1` of bookworm. The assertion below is what turns a wrong name
# into a failed build instead of a runtime surprise in production.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        libgmp-dev libtidy-dev libxslt1-dev libzip-dev; \
    docker-php-ext-install -j"$(nproc)" \
        gmp tidy xsl soap calendar ftp gettext pcntl shmop \
        sysvmsg sysvsem sysvshm; \
    pecl install redis-6.3.0 igbinary-3.2.17RC1 msgpack-3.0.1; \
    docker-php-ext-enable redis igbinary msgpack; \
    apt-get purge -y --auto-remove libgmp-dev libtidy-dev libxslt1-dev; \
    apt-get update; \
    apt-get install -y --no-install-recommends libtidy58 libxslt1.1 libgmp10; \
    find /var/lib/apt/lists -mindepth 1 -delete; \
    php -m | grep -qx tidy || { echo "FATAL: tidy did not load"; exit 1; }; \
    php -m | grep -qx xsl  || { echo "FATAL: xsl did not load";  exit 1; }; \
    php -m | grep -qx gmp  || { echo "FATAL: gmp did not load";  exit 1; }

# DELIBERATELY NOT REPRODUCED, each for a stated reason rather than by omission:
#
#   imap    — its build dependency `libc-client-dev` no longer exists in Debian
#             (the UW-IMAP library is unmaintained and was dropped). Checked the live
#             site first: no active plugin calls imap_open/imap_search/imap_fetch.
#             FluentSMTP sends mail over SMTP and does not need it.
#   xmlrpc  — no plugin calls xmlrpc_encode, WordPress's xmlrpc.php is a standing
#             brute-force/pingback amplification surface, and the Cloudflare zone
#             already blocks it. Omitting it is a security improvement, not a gap.
#   monarxprotect — Hostinger's proprietary scanner. No equivalent exists off-platform
#             and nothing on the site depends on it.

# wp-cli, pinned to the version the LIVE host runs (2.12.0, verified 2026-08-27) so
# maintenance commands behave identically before and after cutover. The official
# wordpress image does not bundle it; its absence was found by the other session and is
# not cosmetic -- the maintenance and verification scripts in this repo call `wp`, and
# WordPress core updates / plugin operations after cutover assume it exists.
# Verified at build time rather than trusted: a broken download would otherwise surface
# the first time someone needs it, which is exactly when they cannot afford to debug it.
# M5: the phar is verified against the sha512 wp-cli publishes alongside the release,
# BEFORE it is installed or executed. The previous check ran the downloaded phar and
# grepped its own version string -- a substituted binary controls what it prints, so
# that proved "a runnable phar that claims to be 2.12.0", not "the official artifact".
# This binary runs as root in the container serving a store; liveness is not integrity.
RUN set -eux; \
    curl -fsSL -o /tmp/wp.phar \
      https://github.com/wp-cli/wp-cli/releases/download/v2.12.0/wp-cli-2.12.0.phar; \
    curl -fsSL -o /tmp/wp.phar.sha512 \
      https://github.com/wp-cli/wp-cli/releases/download/v2.12.0/wp-cli-2.12.0.phar.sha512; \
    echo "$(cat /tmp/wp.phar.sha512)  /tmp/wp.phar" | sha512sum -c -; \
    install -m 0755 /tmp/wp.phar /usr/local/bin/wp; \
    rm -f /tmp/wp.phar /tmp/wp.phar.sha512; \
    wp --allow-root --version | grep -q "2.12.0" || { echo "FATAL: wp-cli did not install"; exit 1; }

COPY php-limits.ini /usr/local/etc/php/conf.d/zz-soulful-limits.ini
RUN php -r 'exit(PHP_VERSION_ID >= 80235 && PHP_VERSION_ID < 80300 && ini_get("session.upload_progress.enabled") === "0" ? 0 : 1);'
# Apache worker count sized to the compose memory limit (docker-compose.yml soulful-wp).
COPY apache-mpm-prefork.conf /etc/apache2/mods-available/mpm_prefork.conf

# mod_rewrite is required for WordPress permalinks. The site's .htaccess also carries
# LiteSpeed cache directives; Apache ignores them harmlessly because they sit inside
# <IfModule LiteSpeed> blocks that never match here.
RUN a2enmod rewrite headers expires

HEALTHCHECK --interval=20s --timeout=5s --start-period=90s --retries=5 \
  CMD curl -fsS -m 4 http://127.0.0.1/ >/dev/null || exit 1
