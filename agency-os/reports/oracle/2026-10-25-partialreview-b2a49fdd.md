# codex-oracle review -- 2026-10-25 01:45:05 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/ai-cost-logged.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-calculator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/kb/rag.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-claude.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/handlers/_anthropic.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/video-script-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/onboarding/spec-generator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/visual-consistency-check/route.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `103852367`
- context: Every paid AI call must be written to ai_call_logs (/ops/costs reads only that table). 13 call sites logged nothing; each now calls logAiCall (text: SDK response, or tokens from the provider usage frame) or logImageCost (image/upscale), with organizationId = billedOrgId(grant) (the grant billing account, null when unresolved; never throws). script-forge streams: Anthropic usage from message_start (input, cache) and message_delta (output), logged in finally so an aborted stream still records what was billed; OpenAI adds stream_options.include_usage and logs the final usage frame. New gate lib/ai/__tests__/ai-cost-logged.test.ts: any file whose source calls a provider (messages.create/stream, generateContent, providerUrl, embedContent, embeddings.create) must call logAiCall or logImageCost, or be in CALLERS_LOG (a library whose named function every caller must log). Also fixed resolveTextRate: OpenAI dates (-2024-07-18) were not stripped and prefix match took the first key, so gpt-4o-mini-* priced as gpt-4o and gpt-5.4-nano-* as gpt-5.4; now both date formats and the longest prefix. Price rows added: gpt-4o-mini, text-embedding-3-small. Real calls checked: kb embed and outreach OpenAI wrote rows. Verify: double logging (a caller and its library both logging the same call), the stream usage reading (does message_delta carry cumulative output tokens), the gate pattern missing a call shape used in the repo, and whether a call path logs before it knows the call succeeded.
- exit: 0 | elapsed: 306667ms | answer: 5858B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/visual-consistency-check/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/ai-cost-logged.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-calculator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/handlers/_anthropic.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/video-script-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/kb/rag.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/onboarding/spec-generator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-claude.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Gemini outreach’s default model is recorded at Anthropic prices.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts:40
  confidence  -> CONFIRMED
  scenario    -> With GEMINI_MODEL unset, line 16 selects `gemini-flash-latest`. No TEXT_RATES key matches it, so cost-calculator.ts:44 selects `claude-opus-5-5`. A successful Gemini request therefore records Anthropic as its vendor and uses $4/$20 per million tokens.
  why missed  -> The added prices cover OpenAI outreach and embeddings; the existing Gemini default differs from the priced Flash-Lite model.

FINDING 2: ScriptForge prices mid-stream Anthropic fallback output using the original model.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts:159
  confidence  -> CONFIRMED
  scenario    -> The request enables `claudeFallback` at line 150. If the provider switches models after output starts, `served` retains the message_start model, and subsequent input/cache counters are ignored. The resulting row combines stale model/input information with later output usage. The installed SDK handles these updates in node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.js:487 and :511; the [provider contract](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback) also specifies this event sequence.
  why missed  -> The implementation assumes message_start identifies the model and input usage for the entire request.

FINDING 3: Successfully billed images disappear from accounting when their download fails.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts:97
  confidence  -> CONFIRMED
  scenario    -> Replicate returns `succeeded`, but downloading its output returns HTTP 503. image-gen.ts:535 awaits that download; :616 converts its exception into `{ok:false}`. The route returns at line 100 before logging, despite successful paid generation. The new staging-image logger has the same dependency.
  why missed  -> `generateTarotImage().ok` means generation plus download succeeded, rather than merely that the provider completed paid work.

FINDING 4: New image records discard the resolved billing organization.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts:102
  confidence  -> CONFIRMED
  scenario    -> A customer batch resolves a valid billing grant at line 96 and generates a card. Its cost record nevertheless has `organization_id: null`: logImageCost hardcodes that value in lib/ai/log-ai-call.ts:174 and accepts no organization argument. The customer’s cost totals omit the expense.
  why missed  -> billedOrgId was added to text calls, but the existing image logger cannot preserve billing ownership.

FINDING 5: The new gate passes an existing path that never logs its paid image calls.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/ai-cost-logged.test.ts:51
  confidence  -> CONFIRMED
  scenario    -> `/api/video/regenerate-image` calls buildSceneAsset, which generates a paid image at lib/content/blocks/video-pipeline.ts:357 and returns without logging. The gate accepts this file because its separate video-motion function calls logImageCost at :443. Successful static-image generation therefore remains invisible while the check passes.
  why missed  -> Logger presence is checked per file, so an unrelated function satisfies the supposed caller guarantee.

FINDING 6: Interrupted ScriptForge streams still lose billed usage.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts:241
  confidence  -> CONFIRMED
  scenario    -> A user cancels after receiving OpenAI output but before the final usage frame. An aborted read exits before logging, or the loop exits with usageFrame null; neither writes a row. On the Anthropic branch, cancellation before message_delta leaves output_tokens at zero, even after output was delivered; message_start’s output_tokens is also ignored at :158. Final usage is not guaranteed on interruption. [OpenAI contract](https://platform.openai.com/docs/api-reference/chat/object?lang=ruby), [Anthropic event sequence](https://platform.claude.com/docs/en/build-with-claude/streaming).
  why missed  -> Requesting final usage and adding finally do not recover counters that never arrived.

FINDING 7: OpenAI cached input is charged at the full input rate.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts:42
  confidence  -> CONFIRMED
  scenario    -> A gpt-4o-mini response reports 2,048 prompt tokens, including 1,024 cached tokens. The logger records all 2,048 as uncached input: $0.0003072 instead of $0.0002304 using the repository’s rates. ScriptForge repeats the same mapping at route.ts:242. The [API usage structure](https://platform.openai.com/docs/api-reference/chat/object?lang=ruby) identifies cached tokens under prompt_tokens_details.
  why missed  -> Only aggregate prompt/completion counts were copied; the calculator requires cached input to be separated explicitly.

FINDING 8: OpenAI tarot batches are attributed to Replicate.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts:102
  confidence  -> CONFIRMED
  scenario    -> A batch uses the accepted `openai-high` model. image-gen.ts:143 selects OpenAI, and :584 calls its images endpoint, but the new record always writes `vendor: "Replicate"`. The vendor breakdown consequently attributes OpenAI expenditure to Replicate.
  why missed  -> The batch logger assumes every model in the shared image generator uses Replicate.

TOTAL: 8 findings
