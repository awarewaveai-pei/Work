# codex-oracle review -- 2026-10-23 19:48:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/gateway.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/providers.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/render-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/culture/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/culture/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 NEXT 2: usage metering. Grant.recordUse (lib/entitlements/can.ts) records one entitlement.usage row per grant at every paid seam (lib/ai/gateway.ts loadAnthropic/loadGoogleGenerativeAI/providerUrl, lib/collect/net/providers.ts createProviderCall, video.tts after video-service accepts the render). Units stay 0: per-feature prices are an operator decision; report() only debits source=credits in enforce. Gate in registry-code.test.ts: every credits feature is asked by code whose import closure reaches a recordUse call. Studio culture route: curated items free for every caller, only the live LLM fallback goes through withFeature(ops.cheap-json), which customers are refused (back_office_only); StudioWorkbench hides the model picker, trending and AI re-roll when the feature list refuses ops.cheap-json.
- exit: 0 | elapsed: 376248ms | answer: 1972B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/culture/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/gateway.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/providers.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/render-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/culture/route.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `video.tts` authorizes and meters against the internal account, not the target customer.
  file:line   -> `app/api/video/render-draft/route.ts:69` -> `lib/content/video/render-client.ts:146` -> `lib/entitlements/grant.ts:24`
  confidence  -> CONFIRMED
  scenario    -> A customer render includes `organizationId` and `ttsProvider:"openai"`; `grantFor("video.tts")` has no request context, resolves actor `system` and the internal subject, so the job can bypass the customer’s entitlement and usage is recorded to the wrong account.
  why missed  -> The route passes the tenant only to job storage/render naming, while the library grant silently defaults to the internal account.

FINDING 2: A transient audit failure permanently suppresses later usage recording for the same grant.
  file:line   -> `lib/entitlements/can.ts:122` -> `lib/entitlements/can.ts:145` -> `lib/entitlements/can.ts:177`
  confidence  -> CONFIRMED
  scenario    -> The first `recordUse()` runs while Supabase is unavailable; `USED.add(this)` executes, `safeAudit` swallows the failure, and a later paid seam using that grant returns immediately without retrying, leaving no usage row.
  why missed  -> Idempotence is applied before the audit write succeeds, and the best-effort audit path hides the failed persistence.

FINDING 3: An accepted video render can be left unmetered when the response loses its job ID.
  file:line   -> `lib/content/video/render-client.ts:154` -> `lib/content/video/render-client.ts:166` -> `lib/content/video/render-client.ts:169`
  confidence  -> PLAUSIBLE
  scenario    -> The video service enqueues TTS/render work, then the connection drops or returns malformed JSON; this code returns an error and skips `recordUse()`, while the remote job continues and incurs provider cost.
  why missed  -> Metering is tied to a successful response containing `jobId`, with no reconciliation or idempotency path for ambiguous submission outcomes.

TOTAL: 3 findings
