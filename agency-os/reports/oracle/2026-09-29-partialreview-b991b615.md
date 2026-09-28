# codex-oracle review -- 2026-09-29 01:03:11 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_execution/gateway.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/ai_coding.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/interpret_method_record.py, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_gateway.py, Projects/internal/cognitive-engineering-os/deploy/.env.example, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/summarize.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/pipeline.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/config.py, agency-os/docs/video_generator/claude_call.py, agency-os/docs/video_generator/growth.py, agency-os/docs/video_generator/quality_control.py, agency-os/docs/video_generator/full_pipeline_v3.py, agency-os/docs/video_generator/config.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/claude-request.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/text-model-options.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/humanize/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/visual-consistency-check/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/handlers/_anthropic.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/onboarding/spec-generator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/image-edit-prompt.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/product-copy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/video-script-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/llm.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/dossier/report.ts, Projects/internal/ziwei-doushu/lib/ai/models.ts, Projects/internal/ziwei-doushu/lib/ai/providers/anthropic.ts, mcp-local-wrappers/llm-mcp.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Migrates every Claude call site in this repo to claude-opus-5-5 (Haiku routes intentionally kept). Opus 5.5: thinking always on (counts toward max_tokens, responses start with a thinking block, so text must be read by block type), effort is the only control (API default medium), non-default temperature is a 400, forced tool_choice is a 400, server-side classifier fallback via beta server-side-fallback-2026-07-01 + fallbacks=default (billed at the answering model; response.model names it). Check: any path still reading content[0] on a model that thinks; max_tokens too small once thinking counts; effort sent to Haiku (400); fallbacks sent on the non-beta client; cost metering priced by the requested instead of the answering model; refusal/max_tokens handled. Also verify: does this change depend on something NOT visible in this diff (config value, env override like ANTHROPIC_MODEL/CLAUDE_MODEL on the server, timeout, upstream default) that makes it silently unreachable? If you cannot support a real finding, say so and return no findings.
- exit: 0 | elapsed: 78758ms | answer: 2442B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/modules/research/ai_coding.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/interpret_method_record.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_execution/gateway.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py, Projects/internal/cognitive-engineering-os/deploy/.env.example, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_gateway.py, Projects/internal/ziwei-doushu/lib/ai/models.ts, Projects/internal/ziwei-doushu/lib/ai/providers/anthropic.ts, agency-os/docs/video_generator/config.py, agency-os/docs/video_generator/full_pipeline_v3.py, agency-os/docs/video_generator/growth.py, agency-os/docs/video_generator/quality_control.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/summarize.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/humanize/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/visual-consistency-check/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/text-model-options.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/command-plane/handlers/_anthropic.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/video-script-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/llm.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/dossier/report.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/onboarding/spec-generator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/image-edit-prompt.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/product-copy.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-service/config.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/pipeline.py, mcp-local-wrappers/llm-mcp.mjs, agency-os/docs/video_generator/claude_call.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/claude-request.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The generic Python provider does not reserve token budget for Opus thinking.
  provider.py:91   -> provider.py:95
  confidence  -> CONFIRMED
  scenario    -> The default Opus model receives `max_tokens=16384`; thinking consumes part of that budget, so a response needing 12,000 thinking tokens plus 5,000 answer tokens stops at `max_tokens` and raises `AI_PROVIDER_CUT_OFF`.
  why missed  -> Headroom was added in some wrappers but not in the shared provider path.

FINDING 2: The video-service Opus calls likewise omit thinking headroom.
  pipeline.py:80   -> pipeline.py:82
  confidence  -> CONFIRMED
  scenario    -> A generated script needs more than the remaining 16,000 tokens after thinking; the API returns `max_tokens`, `_claude_text` raises, and the pipeline fails instead of producing JSON.
  why missed  -> The migration updated block extraction and effort but left the old total-token ceiling unchanged.

FINDING 3: Customer-service Opus calls do not enable server-side fallback.
  llm.ts:32   -> config.ts:8
  confidence  -> CONFIRMED
  scenario    -> `CS_MODELS.generate` selects `claude-opus-5-5`; `claudeTurn` calls `client.messages.create` without `claudeFallback`, so a safety-classifier refusal is returned directly instead of being retried by the configured fallback model.
  why missed  -> The shared parameter helper was added, but the fallback helper was not applied to this call path.

FINDING 4: Cheap JSON reports the requested model even when fallback answered.
  cheap-json.ts:101   -> cheap-json.ts:101
  confidence  -> CONFIRMED
  scenario    -> Opus 5.5 is refused and the fallback answers as another model; the function returns `model: args.model`, so downstream cost/accounting records the requested model rather than `response.model`.
  why missed  -> Logging uses the response object, but the returned result still uses the original request model.

FINDING 5: The meeting summarizer keeps the old total token limit after switching to always-thinking Opus.
  summarize.py:181   -> summarize.py:181
  confidence  -> CONFIRMED
  scenario    -> A long meeting requires output near `API_MAX_TOKENS`; thinking consumes part of the same limit, producing `stop_reason="max_tokens"` and a failed summary despite the requested answer fitting within the nominal limit.
  why missed  -> The streaming change addressed transport duration but did not increase the token budget for thinking.

TOTAL: 5 findings
