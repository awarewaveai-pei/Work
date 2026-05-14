# Cloudflare Migration Plan — aware-wave.com

**Status**: Planned (Layer 4 of security hardening)
**Owner**: Pei / AwareWave Ops
**Prerequisite**: Layers 1–3 already live (rate limiting + nginx security + fail2ban)

---

## Why Cloudflare

With Cloudflare in place, bots **never see the real IP** `5.223.93.113`.
All traffic flows: `User → Cloudflare edge → SG VPS`.

| Without Cloudflare (now) | With Cloudflare |
|--------------------------|-----------------|
| Bots hit real IP directly | Bots hit Cloudflare edge |
| nginx rate limiting stops burst | Cloudflare stops burst before it arrives |
| fail2ban bans IPs after the fact | Cloudflare blocks known bots proactively |
| IP blocklist needs manual updates | Cloudflare's bot DB updates automatically |
| DDoS can overwhelm the VPS | Cloudflare absorbs DDoS |

---

## Scope

| Domain | Include? | Notes |
|--------|----------|-------|
| `aware-wave.com` | ✅ | WordPress public site + admin app |
| `www.aware-wave.com` | ✅ | Redirect → apex |
| `app.aware-wave.com` | ✅ | Next.js admin console |
| `api.aware-wave.com` | ✅ | node-api |
| `soulfulexpress.org` | ✅ | Separate site, same Cloudflare account |

---

## Step-by-Step Migration

### Phase 1 — Setup (30 min, zero downtime)

1. **Create Cloudflare account** at cloudflare.com → Free plan is sufficient.

2. **Add site** `aware-wave.com`:
   - Cloudflare scans existing DNS → review and confirm all records
   - Ensure these A records proxy through Cloudflare (orange cloud):
     ```
     A  aware-wave.com      5.223.93.113   ✅ Proxied
     A  www.aware-wave.com  5.223.93.113   ✅ Proxied
     A  app.aware-wave.com  5.223.93.113   ✅ Proxied
     A  api.aware-wave.com  5.223.93.113   ✅ Proxied
     ```
   - Keep these DNS-only (grey cloud) — direct access needed:
     ```
     # SSH access — must NOT go through Cloudflare
     # (Cloudflare doesn't proxy port 22)
     # Already safe: SSH uses IP directly, not DNS
     ```

3. **Change nameservers** at your domain registrar (where you bought aware-wave.com):
   - Replace existing nameservers with the two Cloudflare provides
   - Propagation: 5 min to 24 hours

4. **Repeat for `soulfulexpress.org`** — same process, same Cloudflare account.

### Phase 2 — Configure (15 min, after nameservers propagate)

**SSL/TLS mode** → Set to `Full (strict)`:
- Cloudflare → aware-wave.com → SSL/TLS → Overview → Full (strict)
- This encrypts both Cloudflare→User AND Cloudflare→SG VPS connections.
- SG VPS currently listens on port 80 (HTTP) — you can leave this while we add HTTPS later, or switch to `Flexible` temporarily.

**Security Level** → `Medium` (default, fine to start):
- Cloudflare → Security → Security Level → Medium

**Bot Fight Mode** → Enable:
- Cloudflare → Security → Bots → Bot Fight Mode → On

**WordPress-specific WAF rules** (Free plan has 5 custom rules):

Rule 1 — Block xmlrpc.php (belt + suspenders with nginx):
```
Field: URI Path
Operator: equals
Value: /xmlrpc.php
Action: Block
```

Rule 2 — Rate limit wp-login.php at edge:
```
Field: URI Path
Operator: equals
Value: /wp-login.php
Action: Rate limit → 5 requests / 1 minute per IP
```

Rule 3 — Block PHP webshell file patterns:
```
Field: URI Path
Operator: matches regex
Value: /.*\.(env|sql|bak|old|htpasswd)$
Action: Block
```

Rule 4 — Country block (optional — block countries you never serve):
```
Field: Country
Operator: is in
Value: [select high-risk countries not in your audience]
Action: Challenge (not Block — too aggressive)
```

**Page Rules** (Free: 3 rules):

Rule 1 — Force HTTPS:
```
URL: http://aware-wave.com/*
Setting: Always Use HTTPS
```

Rule 2 — Cache static assets:
```
URL: aware-wave.com/wp-content/*
Setting: Cache Level: Cache Everything, Edge Cache TTL: 1 month
```

### Phase 3 — Lock down SG VPS (CRITICAL — do after Cloudflare is confirmed working)

Once Cloudflare is the only entry point, restrict nginx to **only accept connections from Cloudflare IPs**.
This prevents bots from hitting the real IP directly.

```nginx
# Add to nginx http block (nginx/default.conf top level — AFTER Cloudflare is live)
# Cloudflare IPv4 ranges (update from https://www.cloudflare.com/ips-v4/)
geo $cloudflare_trusted {
    default          0;
    103.21.244.0/22  1;
    103.22.200.0/22  1;
    103.31.4.0/22    1;
    104.16.0.0/13    1;
    104.24.0.0/14    1;
    108.162.192.0/18 1;
    131.0.72.0/22    1;
    141.101.64.0/18  1;
    162.158.0.0/15   1;
    172.64.0.0/13    1;
    173.245.48.0/20  1;
    188.114.96.0/20  1;
    190.93.240.0/20  1;
    197.234.240.0/22 1;
    198.41.128.0/17  1;
    # Uptime Kuma (EU VPS) — direct access for monitoring
    204.168.175.41/32 1;
    # Localhost
    127.0.0.1/32     1;
}
```

Then in each server block, add:
```nginx
if ($cloudflare_trusted = 0) {
    return 444;
}
```

**⚠️ Only add Phase 3 AFTER confirming Cloudflare works** — otherwise you lock yourself out.

---

## Rollback Plan

If something breaks after nameserver change:
1. Go to domain registrar → change nameservers back to original
2. DNS propagates within 1 hour
3. Site returns to direct IP access

---

## Post-Migration Checklist

- [ ] `curl -I https://aware-wave.com` shows `server: cloudflare` header
- [ ] `curl -I https://app.aware-wave.com` shows `server: cloudflare` header
- [ ] WordPress wp-admin still accessible
- [ ] Uptime Kuma monitoring still shows green
- [ ] Netdata still receiving data from SG
- [ ] Telegram alerts still working
- [ ] `dig aware-wave.com` returns Cloudflare IPs, not `5.223.93.113`

---

## Cost

| Plan | Price | What you get |
|------|-------|-------------|
| Free | $0 | CDN, basic WAF (5 rules), Bot Fight Mode, DDoS |
| Pro | $20/mo | Advanced WAF, more rules, image optimization |

**Free plan is sufficient** for current traffic levels. Upgrade only if bot traffic overwhelms Cloudflare free WAF capacity.

---

_Last updated: 2026-05-14 by Claude (session: security hardening round 2)_
_Owner doc: this file. Do not duplicate in WORKLOG or TASKS — link here._
