# codex-oracle review -- 2026-10-10 12:53:09 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/workflows/package.json, lobster-factory/packages/workflows/security-acknowledgements.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Weekly workflows security audit red 33 days (verdict shipped: engine.io 6.6.9 prod dep high; proxy-addr critical dev). Fix: raise stale override floors within same major, add overrides for @modelcontextprotocol/sdk, proxy-addr, source-map-js, qs; vitest ^4.1.11; declare @types/node ^22 (tsconfig.typecheck.json types:[node] relied on engine.io 6.6.9 hoisting it). braces has no patched release (<=3.0.3 = all) and is reachable only via trigger.dev CLI devDependency -> dated acceptance until 2027-01-08 with measured evidence (npm ls --omit=dev empty; deployed worker image 20260930 has 0 braces). Trigger trio deliberately kept at 4.5.10: self-hosted server is v4.4.4 and 4.5.10 is proven against it; 4.7.3 would widen skew with no security need. Verified: audit verdict pass, npm test 143/143, typecheck 0 errors, deploy-time sed patch on buildImage.js still matches 1 line.
- exit: 0 | elapsed: 258258ms | answer: 593B
- files-reviewed: lobster-factory/packages/workflows/package.json, lobster-factory/packages/workflows/security-acknowledgements.json
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The self-hosted deploy runbook uses Trigger CLI 4.4.6 despite the repository’s 4.5.10 toolchain.

  lobster-factory/packages/workflows/package.json:8,19,22 -> lobster-factory/infra/trigger/README.md:135  
  confidence  -> CONFIRMED  
  scenario    -> A maintainer follows the documented manual deploy and runs `npx trigger.dev@4.4.6`; the deployment uses CLI 4.4.6 rather than the 4.5.10 SDK/build/CLI combination validated by this change.  
  why missed  -> The review checked the package and scripted deploy path but not the self-hosted manual-deploy runbook.

TOTAL: 1 findings
