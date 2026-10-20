# codex-oracle review -- 2026-10-19 19:36:52 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/issuer.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/entitlements/permit/[product]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/entitlements/features/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/use-paid-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 step 3, second round after fixing 5 findings (grantFor org without AuthorizedOrg, mutable grants, actor contract, report double debit). New: (1) next-admin permit issuer POST /api/internal/entitlements/permit/<product> with a per-product bearer (ENTITLEMENT_ISSUER_TOKEN_COGNITIVE): mints only that product's features, actors '<product>:<id>', root orgs only; (2) cognitive check.py asks that issuer when a request has no X-AwareWave-Permit, verifies the answer locally against the binding, caches it only after verification until 30s before expiry; (3) usable-features list GET /api/entitlements/features: verdictOf (no audit) per route feature, shadow => allowed true with real verdict, Ed25519-signed, cached 5 min per subject+mode; client hook greys buttons, fail-open while loading. Adversarial: can the issuer token mint for another product/org/actor; can a cached permit outlive a revoked entitlement or be served to the wrong actor; does the features cache leak one account's list to another; can the list be used to bypass the API gate; shadow never throws.

- exit: 0 | elapsed: 238624ms | answer: 2142B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/entitlements/features/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/issuer.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/use-paid-features.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: OpenAI article generation bypasses the entitlement gate
  file: `app/api/content/generate/route.ts:21-28` -> `lib/content/article/generate-core.ts:694-699,788-799`
  confidence  -> CONFIRMED
  scenario    -> `ENTITLEMENT_MODE=enforce`, no entitlement, valid operator role, and OpenAI selected -> the OpenAI request is sent without `grantFor("content.article")`, so the paid call succeeds.
  why missed  -> The Anthropic branch performs the check, making the shared generator appear gated while the provider-specific branch returns first.

FINDING 2: A minted grant’s subject can be mutated before debit
  file: `lib/entitlements/can.ts:90-96` -> `lib/entitlements/can.ts:102-115`
  confidence  -> CONFIRMED
  scenario    -> A grant for organization A is returned; caller sets `grant.subject.orgId` to organization B, then calls `report()` -> credits are debited from B and the audit records B.
  why missed  -> `Object.freeze(info)` freezes only the grant container; the nested `subject` object remains mutable.

FINDING 3: Shadow mode debits credits for allowed verdicts
  file: `lib/entitlements/can.ts:109-123` -> `lib/entitlements/can.ts:139-142,190-192`
  confidence  -> CONFIRMED
  scenario    -> Shadow mode, a credits feature has sufficient balance, and the caller reports usage -> the successful verdict is minted with `shadow: false`, so `report()` calls `debit()` despite shadow mode.
  why missed  -> The denied-credit shadow test has zero balance, so it never exercises the allowed-credit path.

FINDING 4: The feature-list client cache is shared across account sessions
  file: `lib/entitlements/use-paid-features.ts:8-20,25-32` -> `app/api/entitlements/features/route.ts:12-13`
  confidence  -> CONFIRMED
  scenario    -> Account A loads the list, logs out, and account B logs in within five minutes in the same SPA/browser -> the singleton promise or private HTTP cache supplies A’s feature list to B; the hook ignores the returned subject.
  why missed  -> The server cache is keyed by subject, but the browser-side cache is keyed only by URL/time and has no session or subject invalidation.

TOTAL: 4 findings
