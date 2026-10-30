import { CLAUDE_FAST_MODEL, claudeParams, loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd, resolveTextRate } from "@/lib/ai/cost-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE_SECTIONS: Record<string, number> = { short: 4, medium: 7, long: 12 };

export const POST = withFeature("content.outline", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const keyword     = (typeof body.keyword     === "string" ? body.keyword     : "").trim();
  const title       = (typeof body.title       === "string" ? body.title       : "").trim();
  const language    = (typeof body.language    === "string" ? body.language    : "English");
  const articleType = (typeof body.articleType === "string" ? body.articleType : "Pillar Article");
  const articleSize = (typeof body.articleSize === "string" ? body.articleSize : "medium");

  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  const sections = SIZE_SECTIONS[articleSize] ?? 7;
  const titleLine = title ? `Article title: "${title}"` : "";

  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    ...claudeParams(CLAUDE_FAST_MODEL, 700, "medium", { thinking: "off" }),
    messages: [{
      role: "user",
      content: `Generate an SEO-optimized article outline.
Primary keyword: "${keyword}"
${titleLine}
Language: ${language}
Article type: ${articleType}
Target sections: ~${sections} H2 headings (add 2-3 H3 under complex sections; use #### H4 only for deep sub-points)

Rules:
- Each H2 answers a specific reader question
- Headings must be specific, not generic ("How to Start Art Journaling" not "Introduction")
- KEYWORD COVERAGE (critical): the primary keyword OR a close variant / partial phrase / synonym / LSI term must appear in EVERY H2, H3 and H4 — every sub-heading should signal the topic.
- ANTI-STUFFING (must reconcile with the rule above): write the EXACT primary keyword in only 1–2 headings total; in all the others use a synonym, a shorter partial phrase, or a closely-related term. This avoids a keyword-stuffing penalty (especially important for CJK languages — Chinese/Japanese/Korean — where exact-keyword repetition is capped at 4–6× across the whole article).
- Use ## for H2, ### for H3, #### for H4
- Do not include H1
- Output ONLY the outline in Markdown heading format, no explanations

Example format (primary keyword "art therapy" — exact in 1–2, variants elsewhere):
## What Is Art Therapy?
## Benefits of Art Therapy
### Emotional Healing Through Creative Expression
### Cognitive Gains From Art-Based Practice
## How to Get Started With Therapeutic Art
## Art Therapy FAQ
## Conclusion: Making Creative Healing Part of Life`,
    }],
  });

  void logAiCall({ route: "/api/content/outline", response: msg, actorRole: role, grant });
  const { rate } = resolveTextRate(msg.model);
  const _cost = { usd: textCallCostUsd({ model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens, cacheWriteTokens: msg.usage.cache_creation_input_tokens }), model: msg.model, vendor: rate.vendor };

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "empty outline" }, { status: 502 });
  return NextResponse.json({ ok: true, outline: text, _cost });
}
