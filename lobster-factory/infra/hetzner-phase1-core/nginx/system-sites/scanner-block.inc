# scanner-block.inc — Nginx snippet: sink known scanner/attack probe paths
# SSOT: lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/scanner-block.inc
# Deploy: sudo cp scanner-block.inc /etc/nginx/snippets/scanner-block.inc (SG + EU VPS)
# Include: include /etc/nginx/snippets/scanner-block.inc;  (in each server {} block)
#
# Design (do not change):
#   access_log redirected to scanner.log (not access.log). Netdata web_log plugin
#   only reads access.log, so scanner probes become invisible to alarming —
#   even bursty 503s from limit_req inheritance log to scanner.log because nginx
#   resolves the location's access_log directive before the preaccess phase fires.
#   scanner.log is auto-rotated by the global logrotate /var/log/nginx/*.log pattern.
#
# Two-layer defense (added 2026-05-30):
#   Layer 1 — Explicit path/filename patterns from confirmed attack logs. Edit when
#             new probe trends appear.
#   Layer 2 — Always-suspicious file extensions no legitimate UA requests on the
#             public web. Conservative list — only extensions where ANY exposure
#             is a misconfiguration or scanner. .zip/.tar deliberately EXCLUDED
#             because WordPress legitimately serves them from /wp-content/uploads/
#             via the fallback `location /` (proxied to Docker lobster-nginx).
#
# Coverage sources:
#   2026-05-22 (SG): phpunit eval-stdin.php (PHP RCE), .env credential harvesting,
#                    .git/.aws/.ssh exposure, Spring Boot /actuator, Outlook /owa,
#                    IoT /onvif, Flask .flaskenv, WP plugin probe gravitysmtp,
#                    PHP RFI hello.world, wp-config.php, xmlrpc.php.
#   2026-05-23 (EU): same baseline applied to EU VPS.
#   2026-05-30 (SG): attacker 34.186.19.38 (GCP) probed 204 paths in 7s targeting
#                    Dockerfile, docker-compose.yml, .docker/config.json, .vscode/*,
#                    terraform.tfstate/.tfvars, /WEB-INF/*, /storage/logs/*,
#                    /src/config.*, /src/settings.*, /v1/config.json, /tmp/*.sql,
#                    /sql/dump.sql, /web.zip, /www.zip. limit_req correctly returned
#                    503 for all but they leaked to access.log -> Netdata false alarm.
#                    Added explicit patterns for the path-shaped probes (Layer 1)
#                    plus extension catch-all (Layer 2) for future variants.

# Layer 1 - Confirmed path/filename probes (explicit allowlist of denies).
location ~* "(/\.env|/phpunit|eval-stdin\.php|/\.git(/|$)|/\.aws(/|$)|/actuator/|/owa/|/onvif/|/\.flaskenv|/wp-content/plugins/gravitysmtp|/hello\.world|/\.ssh(/|$)|/wp-config|/xmlrpc\.php|/Dockerfile|/docker-compose|/\.docker(/|$)|/\.vscode(/|$)|/terraform\.(tfstate|tfvars)|/WEB-INF/|/META-INF/|/storage/logs/|/src/(config|settings)\.(json|ya?ml)|/v1/config\.json|/(web|www|backup)\.zip)" {
    access_log /var/log/nginx/scanner.log combined;
    return 444;
}

# Layer 2 - Heuristic: file extensions with no legitimate public exposure.
# Conservative - every extension here is a misconfig or scanner if served at any path.
# .zip / .tar / .tar.gz NOT included: WP serves legitimate downloads from /wp-content/uploads/.
location ~* "\.(sql|bak|old|swp|swo|pem|key|p12|pfx)$" {
    access_log /var/log/nginx/scanner.log combined;
    return 444;
}
