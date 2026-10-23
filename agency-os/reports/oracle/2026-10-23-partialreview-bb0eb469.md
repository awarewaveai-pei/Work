# codex-oracle review -- 2026-10-23 13:15:21 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh, lobster-factory/infra/soulful/nginx/soulful-security.conf, mcp/registry.template.json, scripts/refresh-cf-origin-ips.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: CF ranges: one fetch now generates both the nginx origin geo guard and a new conf.d/cf-realip.conf set_real_ip_from list (static copy removed from soulful-security.conf, real_ip_header kept there; host nginx on ks-aw-01, already applied, nginx -t ok, real IP verified). Cloudflare MCP switched from expired static bearer header to OAuth.
- exit: 0 | elapsed: 167211ms | answer: 1712B
- files-reviewed: lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh, lobster-factory/infra/soulful/nginx/soulful-security.conf, mcp/registry.template.json, scripts/refresh-cf-origin-ips.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Concurrent refreshes can publish mismatched geo and real-IP files.
  lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh:25,41-42 -> lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh:43-50
  confidence  -> CONFIRMED
  scenario    -> Two refreshes overlap; one writes GEO from fetch A while the other writes REALIP from fetch B, producing a mixed pair that both pass nginx -t.
  why missed  -> Temporary files isolate each process, but no lock or cross-file atomic commit exists.

FINDING 2: Failure writing cf-realip.conf leaves cf-edge-geo.conf updated without rollback.
  lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh:41-42 -> lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh:43-48
  confidence  -> CONFIRMED
  scenario    -> GEO is writable but REALIP is unwritable (for example, immutable); GEO is replaced, REALIP installation fails, and set -e exits before nginx -t or restoration.
  why missed  -> Rollback only runs after nginx -t failure, not after either install operation fails.

FINDING 3: A clean deployment can silently lose real-IP restoration because cf-realip.conf is generated out-of-band.
  lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh:15,42 -> lobster-factory/infra/soulful/nginx/soulful-security.conf:22-23
  confidence  -> PLAUSIBLE
  scenario    -> A new host receives soulful-security.conf but not the generated cf-realip.conf and does not run the refresh script; nginx starts successfully, but CF-Connecting-IP is ignored and logs/fail2ban see Cloudflare edge addresses.
  why missed  -> The host was verified after manual application, while the diff adds no tracked file or deployment step that guarantees cf-realip.conf exists.

TOTAL: 3 findings
