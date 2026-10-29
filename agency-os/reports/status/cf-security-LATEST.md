# Cloudflare security check

- Generated: 2026-10-30 01:27:11
- Zone: f21b1919632fee2221647908a94fdcac (aware-wave.com)
- **Overall: PASS**

## Checks
| Check | Result |
|-------|--------|
| Bot Fight Mode | ON |
| WAF firewall rules count | 2 (informational; wp-login is server-side) |
| wp-login managed-challenge rule | present |
| xmlrpc.php block rule | present |
| Scanner flood rate-limit rule | enabled/block |
| WP admin rate-limit carve-outs | present |
| Released-address access rules | clean |
| Origin lockdown (ks-aw-01 nginx guard) | active |
| Direct-origin probe aware-wave (expect 403) | 403 |
| Direct-origin probe soulful (expect 403) | 403 |

## wp-login / xmlrpc protection
- Edge: CF managed-challenge rule on /wp-login.php (required since 2026-10-29; distributed brute force from 900+ IPs defeats per-IP limits).
- Server-side: LLAR lockouts + host nginx wp_login rate limit. fail2ban has only an sshd jail.
- CF WAF wp-login geo rules are intentionally absent: operator travels globally; CF geo rules would self-lock.
- This check verifies CF posture plus Origin Lockdown; WordPress plugin protection is verified separately (client-status / WP plugin checks).

## Origin Lockdown (ks-aw-01 145.239.195.47, since 2026-08-31 KS-6 host switch)
- Status: **active**
- Probe aware-wave direct-origin: 403 / soulful: 403 (403 = guarded)
- Architecture: nginx geo guard (conf.d/cf-edge-geo.conf + snippets/cf-only.conf) returns 403 unless the raw TCP peer is a CF edge or localhost; DNS-only vhosts (remotion-svc/video-svc) deliberately unguarded.
- Runbook: runbooks/CLOUDFLARE-WAF-SETUP.md #Origin-Lockdown-SOP
