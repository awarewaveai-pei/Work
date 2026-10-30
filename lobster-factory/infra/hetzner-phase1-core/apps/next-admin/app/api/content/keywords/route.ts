import { CLAUDE_FAST_MODEL, claudeParams, loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd, resolveTextRate } from "@/lib/ai/cost-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withFeature("content.keywords", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const keyword     = (typeof body.keyword     === "string" ? body.keyword     : "").trim();
  const language    = (typeof body.language    === "string" ? body.language    : "English");
  const articleType = (typeof body.articleType === "string" ? body.articleType : "Pillar Article");

  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    ...claudeParams(CLAUDE_FAST_MODEL, 600, "medium", { thinking: "off" }),
    messages: [{
      role: "user",
      content: `Generate 20 NLP/LSI (Latent Semantic Indexing) keywords for an SEO article about: "${keyword}"
Language: ${language}
Article type: ${articleType}

Requirements:
- Include long-tail variations, related terms, and semantic synonyms
- Mix single-word and multi-word phrases
- Relevant to the topic (not generic filler)
- Avoid repeating the main keyword itself

Return ONLY a valid JSON array of 20 keyword strings, no explanations.
Example: ["keyword one", "phrase two", "term three"]`,
    }],
  });

  void logAiCall({ route: "/api/content/keywords", response: msg, actorRole: role, grant });
  const { rate } = resolveTextRate(msg.model);
  const _cost = { usd: textCallCostUsd({ model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens, cacheWriteTokens: msg.usage.cache_creation_input_tokens }), model: msg.model, vendor: rate.vendor };

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const kws   = JSON.parse(match?.[0] ?? "[]") as unknown[];
    const valid = kws.filter((k): k is string => typeof k === "string").slice(0, 20);
    return NextResponse.json({ ok: true, keywords: valid, _cost });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse keywords" }, { status: 500 });
  }
}
