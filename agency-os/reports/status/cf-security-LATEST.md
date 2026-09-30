# Cloudflare security check

- Generated: 2026-09-30 10:21:08
- Zone: f21b1919632fee2221647908a94fdcac (aware-wave.com)
- **Overall: PASS**

## Checks
| Check | Result |
|-------|--------|
| Bot Fight Mode | ON |
| WAF firewall rules count | 1 (informational; wp-login is server-side) |
| xmlrpc.php block rule | present |
| Scanner flood rate-limit rule | enabled/block |
| WP admin rate-limit carve-outs | present |
| Released-address access rules | clean |
| Origin lockdown (ks-aw-01 nginx guard) | active |
| Direct-origin probe aware-wave (expect 403) | 403 |
| Direct-origin probe soulful (expect 403) | 403 |

## wp-login / xmlrpc protection
- Mode: **server-side** (LLAR + nginx rate-limit + fail2ban) -- architecture decision 2026-06-04.
- CF WAF wp-login geo rules are intentionally absent: operator travels globally; CF geo rules would self-lock.
- CF WAF scanner/path rules may exist, but wp-login health is judged by the server-side layer.
- This check verifies CF posture plus Origin Lockdown; WordPress plugin protection is verified separately (client-status / WP plugin checks).

## Origin Lockdown (ks-aw-01 145.239.195.47, since 2026-08-31 KS-6 host switch)
- Status: **active**
- Probe aware-wave direct-origin: 403 / soulful: 403 (403 = guarded)
- Architecture: nginx geo guard (conf.d/cf-edge-geo.conf + snippets/cf-only.conf) returns 403 unless the raw TCP peer is a CF edge or localhost; DNS-only vhosts (remotion-svc/video-svc) deliberately unguarded.
- Runbook: runbooks/CLOUDFLARE-WAF-SETUP.md #Origin-Lockdown-SOP
