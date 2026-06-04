---
name: feedback_global_traveler
description: "User travels internationally — any geography-based access control (Cloudflare WAF country rules, IP allowlists) will block them when abroad. Always prefer device/credential-based protection (LLAR, WP login lockout) over geo-based rules."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cb5a4902-7e2c-47d9-bd6b-fd7100a9a06c
---

User travels internationally (世界各地跑). She is also on a company computer and leaving the company at end of month, meaning the IP will change.

**Why:** Any country-based WAF rule (e.g. `ip.geoip.country in {"TW" "SG"}`) will lock her out when traveling. IP CIDR allowlists tied to a specific company computer are also fragile.

**How to apply:** For WordPress login protection, prefer LLAR (Limit Login Attempts Reloaded) plugin which works regardless of geography. Never suggest rebuilding CF WAF country rules for wp-login access. If she needs remote access protection, recommend server-side credential controls, not IP/geo filters.
