---
name: Cloudflare Credentials
description: Cloudflare API token and zone info for aware-wave.com WAF management
type: reference
originSessionId: c637c61b-919d-43e2-b9e4-562d3405452b
---
## Account
- Account ID: aea1a836e6f8b8d7f18206dc8e848bd6
- Email: awarewaveai@gmail.com

## aware-wave.com Zone
- Zone ID: f21b1919632fee2221647908a94fdcac
- Nameservers: anirban.ns.cloudflare.com, irma.ns.cloudflare.com

## API Tokens
- WAF/DNS/SSL Token: cfat_K1A25qBnqLoV9E1si2ACyOztiKnspz8UpCr1bqgDd6815e99
- MCP Token: cfat_km56Ftz2VeDqRx8caYx01eiOVNuqJoOisRZ94IJh06d14884

## Applied Settings (updated 2026-04-27)
- SSL: Full (Strict)
- Always HTTPS: on
- Security Level: medium
- Browser Integrity Check: on
- Managed Free Ruleset: enabled
- Custom WAF Ruleset ID: f290fd58b69c4cedb7a0688ca959034f
  - Block /xmlrpc.php (enabled)
  - Block /.env, /.git, /config.php (enabled)
  - wp-login.php non-TW IPs: managed_challenge (enabled)
