# scanner-block.inc — Nginx snippet: sink known scanner/attack probe paths
# SSOT: lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/scanner-block.inc
# Deploy: sudo cp scanner-block.inc /etc/nginx/snippets/scanner-block.inc (SG + EU VPS)
# Include: include /etc/nginx/snippets/scanner-block.inc;  (in each server {} block)
#
# Design: access_log redirected to scanner.log (not access.log).
# Netdata web_log plugin only reads access.log — scanner probes become invisible,
# eliminating false-positive bad-request alarms even for slow scanners below the rate-limit threshold.
# scanner.log is auto-rotated by the global logrotate /var/log/nginx/*.log wildcard pattern.
#
# limit_req off: suppress inherited server-level rate-limit so scanner paths never log
# a 503/429 burst rejection to access.log (which would still be visible to Netdata).
#
# Patterns sourced from confirmed attack logs (SG 2026-05-22, EU 2026-05-23):
#   phpunit eval-stdin.php (PHP RCE), .env credential harvesting, .git/.aws exposure,
#   Spring Boot /actuator, Outlook /owa, IoT /onvif, Flask .flaskenv,
#   WP plugin probe gravitysmtp, PHP RFI hello.world, .ssh key harvesting,
#   wp-config.php, xmlrpc.php.

location ~* "(/\.env|/phpunit|eval-stdin\.php|/\.git(/|$)|/\.aws(/|$)|/actuator/|/owa/|/onvif/|/\.flaskenv|/wp-content/plugins/gravitysmtp|/hello\.world|/\.ssh(/|$)|/wp-config\.php|/xmlrpc\.php)" {
    access_log /var/log/nginx/scanner.log combined;
    return 444;
}
