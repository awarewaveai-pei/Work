# codex-oracle review -- 2026-10-19 20:09:04 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/use-paid-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/entitlements/features/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/import-boundary.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/entitlement_issuer.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 step 3, round 3: verify the fixes of round 2. (1) Every raw paid-provider HTTP call now builds its URL with lib/ai/gateway.ts providerUrl(grant, provider, path), which asserts an allowed grant; the import-boundary test rejects any provider host string/template literal outside gateway.ts. Polls of one job reuse the grant obtained once per function. (2) Grant copies and freezes subject. (3) report() debits only when mode is enforce. (4) usePaidFeatures no longer caches in the browser; route answers no-store; the server cache is per subject+mode. (5) COS issuer HTTP moved to ai_lego/platform/net/entitlement_issuer.py. Adversarial: is any provider call still reachable without a grant (template literal split across expressions, URL from env/config, fetchWithRetry429), is a grant obtained in one org's context reused for another org's job, does the shadow path ever debit, can the regex in the boundary test be dodged trivially in code that exists today.

- exit: 0 | elapsed: 242151ms | answer: 2242B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/import-boundary.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/entitlement_issuer.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/entitlements/features/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/use-paid-features.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Paid provider calls never debit credits
  lib/outreach/ai-openai.ts:20-42 -> lib/entitlements/can.ts:111-119
  confidence  -> CONFIRMED
  scenario    -> `enforce` mode with a credits-backed grant and a successful OpenAI call -> no production caller invokes `grant.report()`, so the debit never runs and repeated calls remain possible.
  why missed  -> The change verifies authorization before the HTTP call but has no post-call usage-reporting path.

FINDING 2: Outreach grants can be evaluated against the internal account instead of the lead’s organization
  app/api/outreach/messages/route.ts:174-178 -> lib/entitlements/subject.ts:60-69
  confidence  -> CONFIRMED
  scenario    -> A staff operator generates a draft for a lead belonging to customer organization C -> the request has no client tenant context, so `resolveSubject` selects the internal account; customer C may be wrongly denied or the internal account is charged.
  why missed  -> `assertOrgAccess` authorizes the lead but its `organization_id` is not passed into `grantFor`.

FINDING 3: Collection search/extraction providers remain reachable without an entitlement grant
  lib/schedules/jobs.ts:43-44 -> lib/collect/net/providers.ts:154-176
  confidence  -> CONFIRMED
  scenario    -> An enabled scheduled collection runs with `SERPER_API_KEY` or `PERPLEXITY_API_KEY` configured and no entitlement grant -> `runCollection` calls `createProviderCall`, which checks only provider configuration and budget before sending the authenticated paid request.
  why missed  -> The boundary focuses on four model-provider hosts and does not cover the separate provider registry.

FINDING 4: The import-boundary test is trivially bypassed by split URL construction
  lib/entitlements/__tests__/import-boundary.test.ts:44-46 -> lib/entitlements/__tests__/import-boundary.test.ts:110-115
  confidence  -> CONFIRMED
  scenario    -> Code outside `gateway.ts` builds `"https://api." + "openai.com/v1/chat/completions"` -> each AST string node lacks the complete host, so the test passes while the raw provider call bypasses `providerUrl`.
  why missed  -> Tests cover full literals and templates but never reconstruct or reject concatenated host fragments.

TOTAL: 4 findings
