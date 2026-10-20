import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { textCallCostUsd } from "@/lib/ai/cost-calculator";
import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// #5 — Competitor & pain-point market analysis. Uses Claude Haiku (knowledge-based, not web-grounded)
// to research the topic from multiple marketing angles, then returns BOTH a structured summary (for the
// UI) and a ready-to-inject `context` string (threaded into /api/content/generate as `marketContext`).
// Read-only research — no writes, no persistence.

export interface MarketAnalysis {
  competitors: string[];   // notable players / alternatives in this space
  painPoints: string[];    // reader frustrations / unmet needs
  searchIntent: string[];  // what readers are really trying to accomplish (angles)
  objections: string[];    // hesitations that block conversion
  differentiators: string[]; // gaps competitors leave open = the brand's angle
}

function lines(arr: string[]): string {
  return arr.map(x => `  - ${x}`).join("\n");
}

/** Build the prompt-injection block the article generator consumes (params.marketContext). */
function buildContext(a: MarketAnalysis): string {
  const parts: string[] = [];
  if (a.painPoints.length)     parts.push(`READER PAIN POINTS:\n${lines(a.painPoints)}`);
  if (a.searchIntent.length)   parts.push(`SEARCH INTENT / ANGLES:\n${lines(a.searchIntent)}`);
  if (a.objections.length)     parts.push(`CONVERSION OBJECTIONS:\n${lines(a.objections)}`);
  if (a.competitors.length)    parts.push(`COMPETITOR LANDSCAPE (do NOT name or disparage in the article):\n${lines(a.competitors)}`);
  if (a.differentiators.length) parts.push(`DIFFERENTIATION OPPORTUNITIES (gaps to lead with):\n${lines(a.differentiators)}`);
  return parts.join("\n\n");
}

export const POST = withFeature("content.market-analysis", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const keyword  = (typeof body.keyword === "string" ? body.keyword : "").trim();
  if (!keyword) return NextResponse.json({ ok: false, error: "keyword required" }, { status: 400 });
  const brand    = (typeof body.brand === "string" ? body.brand : "").trim();
  const audience = (typeof body.audience === "string" ? body.audience : "").trim();
  const language = (typeof body.language === "string" ? body.language : "English").trim();

  const prompt = `You are a market research analyst. Research the topic "${keyword}" from a content-marketing and SEO angle${brand ? ` for the brand "${brand}"` : ""}${audience ? `, whose audience is: ${audience}` : ""}.
Output language for the text values: ${language}.

Return ONLY a valid JSON object with these arrays (each item a short phrase, 4-8 items max per array, most important first):
{
  "competitors": ["notable competing brands, products, or content sources ranking for this topic"],
  "painPoints": ["concrete frustrations, fears, or unmet needs the target reader has about this topic"],
  "searchIntent": ["the real goals/angles behind searches for this topic — informational, commercial, comparison, how-to, etc."],
  "objections": ["hesitations or doubts that stop a reader from converting / taking action"],
  "differentiators": ["gaps or weaknesses in existing content/competitors that a new article could own"]
}
Output ONLY the JSON, no markdown fences, no explanation.`;

  try {
    const Anthropic = await loadAnthropic(grant);
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "max_tokens") {
      return NextResponse.json({ ok: false, error: "Response truncated — retry with a simpler keyword" }, { status: 502 });
    }
    const _cost = { usd: textCallCostUsd({ model: "claude-haiku-4-5-20251001", inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }), model: "claude-haiku-4-5-20251001", vendor: "Anthropic" };
    const textBlock = msg.content.find(b => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";
    if (!text) return NextResponse.json({ ok: false, error: "Empty model response" }, { status: 502 });

    const match = text.match(/\{[\s\S]*\}/);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match?.[0] ?? "{}") as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "JSON parse failed", raw: text.slice(0, 300) }, { status: 502 });
    }
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map(x => x.trim()).slice(0, 8) : [];

    const analysis: MarketAnalysis = {
      competitors:     arr(parsed.competitors),
      painPoints:      arr(parsed.painPoints),
      searchIntent:    arr(parsed.searchIntent),
      objections:      arr(parsed.objections),
      differentiators: arr(parsed.differentiators),
    };
    return NextResponse.json({ ok: true, analysis, context: buildContext(analysis), _cost });
  } catch {
    return NextResponse.json({ ok: false, error: "市場分析失敗，請重試" }, { status: 500 });
  }
}
