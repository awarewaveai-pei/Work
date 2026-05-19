# Cloudflare security check

- Generated: 2026-05-19 03:50:00
- Zone: f21b1919632fee2221647908a94fdcac (aware-wave.com)
- **Overall: PASS**

## Checks
| Check | Result |
|-------|--------|
| Bot Fight Mode | ON |
| WAF firewall rules count | 4 |
| xmlrpc.php block rule | present |

## Notes
- Super Bot Fight Mode (`fight_mode: true`) confirmed ON.
- WAF rule added: `e6b68a50` — `ip.src eq 204.168.175.41` skip (EU VPS legacy allow rule; SBFM bypass handled via direct-IP monitoring instead).
- Uptime Kuma monitors SG VPS directly at `http://5.223.93.113` with `Host` header — bypasses Cloudflare, not affected by fight_mode.
